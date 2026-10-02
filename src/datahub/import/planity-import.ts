import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sha256Hex } from "@/lib/crypto";
import { planityProvider, mappingIsUsable, type ColumnMapping, type FileKind, type PlanityAppointmentRecord } from "@/providers/planity";
import { normalizePersonName, normalizeText } from "@/datahub/normalization";
import { matchClient, type MatchableClient, type MatchLevel } from "@/datahub/matching";
import { attributionFromDeclaration } from "@/domain/attribution/declared";
import { classifyManualRevenue } from "@/domain/revenue/ledger";
import { contactHashes, createClient } from "@/repositories/clients";
import { createAppointmentWithRevenue } from "@/repositories/appointments";
import { revenuesAround } from "@/repositories/revenues";
import { addRowErrors, ChangeRecorder, createImportBatch, finishImportBatch, findCompletedBatchByHash } from "@/repositories/imports";
import { finishSyncJob, startSyncJob } from "@/repositories/sync";
import { audit } from "@/repositories/audit";

export interface ImportReport {
  batchId: string | null;
  dryRun: boolean;
  fileName: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  errorRows: number;
  clientsCreated: number;
  clientsMatched: number;
  reviewsCreated: number;
  servicesCreated: string[];
  revenueCents: number;
  estimatedRevenueCents: number;
  manualRevenueMarkedDuplicate: number;
  manualRevenueMarkedReview: number;
  matchLevels: Record<MatchLevel, number>;
  warnings: string[];
  errors: { rowNumber: number; error: string; rawValue: string; correction?: string | null }[];
  preview: { rowNumber: number; date: string; client: string; service: string; priceCents: number | null; status: string; outcome: string; match: MatchLevel | "—" }[];
  alreadyImportedAt: string | null;
}

export interface ParsedImport {
  kind: FileKind;
  headers: string[];
  headerRowNumber: number;
  rowCount: number;
  detectedMapping: ColumnMapping;
}

export async function inspectFile(buffer: Buffer, kind: FileKind): Promise<ParsedImport> {
  const table = await planityProvider.readExport(buffer, kind);
  return { kind, headers: table.headers, headerRowNumber: table.headerRowNumber, rowCount: table.rows.length, detectedMapping: planityProvider.detectMapping(table) };
}

class DryRunRollback extends Error {
  constructor(public readonly report: ImportReport) {
    super("dry-run");
  }
}

const sourceKeyFor = (r: PlanityAppointmentRecord) => (r.email || r.phone ? null : `PLANITY:name:${normalizePersonName(r.clientName)}`);

/**
 * Pipeline d'import Planity : parsing → mapping → validation → matching → déduplication → écriture → rapport.
 * dryRun = true : exécute tout dans une transaction annulée (aperçu exact, aucune écriture).
 * Réimporter le même fichier produit 0 nouvelle ligne (clés externes + clés métier déterministes).
 */
export async function runPlanityImport(
  userId: string,
  input: { buffer: Buffer; kind: FileKind; fileName: string; mimeType: string; mapping?: ColumnMapping; dryRun: boolean; now?: Date },
): Promise<ImportReport> {
  const table = await planityProvider.readExport(input.buffer, input.kind);
  const mapping = input.mapping ?? planityProvider.detectMapping(table);
  const usable = mappingIsUsable(mapping);
  if (!usable.ok) throw new Error(`Colonnes obligatoires non associées : ${usable.missing.join(", ")}`);
  const fileHash = sha256Hex(input.buffer);
  const previous = await findCompletedBatchByHash(userId, fileHash);
  const extracted = planityProvider.getAppointments(table, mapping, input.now);
  const job = input.dryRun ? null : await startSyncJob(userId, "PLANITY", "import");

  const run = async (tx: Tx): Promise<ImportReport> => {
    const now = new Date();
    const batch = await createImportBatch(userId, { provider: "PLANITY", fileName: input.fileName, fileHash, fileSize: input.buffer.length, mimeType: input.mimeType, mapping: mapping as Record<string, unknown>, syncJobId: job?.id }, tx);
    const changes = new ChangeRecorder(batch.id, tx);
    const report: ImportReport = {
      batchId: input.dryRun ? null : batch.id,
      dryRun: input.dryRun,
      fileName: input.fileName,
      totalRows: table.rows.length,
      importedRows: 0,
      duplicateRows: 0,
      skippedRows: 0,
      errorRows: extracted.errors.length,
      clientsCreated: 0,
      clientsMatched: 0,
      reviewsCreated: 0,
      servicesCreated: [],
      revenueCents: 0,
      estimatedRevenueCents: 0,
      manualRevenueMarkedDuplicate: 0,
      manualRevenueMarkedReview: 0,
      matchLevels: { CERTAIN: 0, PROBABLE: 0, TO_VERIFY: 0, UNKNOWN: 0 },
      warnings: [...extracted.warnings],
      errors: extracted.errors,
      preview: [],
      alreadyImportedAt: previous ? previous.createdAt.toISOString() : null,
    };
    if (previous) report.warnings.push(`Ce fichier a déjà été importé le ${previous.createdAt.toLocaleDateString("fr-CH")} : les lignes déjà présentes seront ignorées.`);

    // Index de matching (aucune donnée en clair) + clés source existantes.
    const existing = await tx.client.findMany({ where: { userId, mergedIntoId: null }, select: { id: true, normalizedName: true, emailHash: true, phoneHash: true } });
    const srcIds = await tx.clientIdentifier.findMany({ where: { userId, type: "EXTERNAL" }, select: { clientId: true, value: true } });
    const keysByClient = new Map<string, string[]>();
    for (const s of srcIds) keysByClient.set(s.clientId, [...(keysByClient.get(s.clientId) ?? []), s.value]);
    const index: MatchableClient[] = existing.map((e) => ({ ...e, sourceKeys: keysByClient.get(e.id) ?? [] }));

    const services = new Map((await tx.service.findMany({ where: { userId } })).map((s) => [s.normalizedName, s]));
    const resolvedInFile = new Map<string, string>(); // identité dans le fichier → clientId

    for (const r of extracted.records) {
      const h = contactHashes(userId, r.email, r.phone);
      const fileIdentity = h.emailHash ?? h.phoneHash ?? `name:${normalizePersonName(r.clientName)}`;
      let clientId = resolvedInFile.get(fileIdentity) ?? null;
      let level: MatchLevel = "CERTAIN";

      if (!clientId) {
        const sourceKey = sourceKeyFor(r);
        const m = matchClient({ normalizedName: normalizePersonName(r.clientName), emailHash: h.emailHash, phoneHash: h.phoneHash, sourceKey }, index);
        level = m.level;
        report.matchLevels[m.level]++;
        if (m.clientId) {
          clientId = m.clientId;
          report.clientsMatched++;
        } else {
          const declared = attributionFromDeclaration(r.howFound);
          const client = await createClient(
            userId,
            {
              firstName: r.firstName,
              lastName: r.lastName,
              fullName: r.clientName,
              email: r.email,
              phone: r.phone,
              acquisitionChannel: declared.channel === "UNKNOWN" ? "UNKNOWN" : declared.channel,
              source: "PLANITY",
              externalId: null,
              importedAt: now,
            },
            tx,
          );
          await changes.record("Client", client.id, "CREATED");
          if (sourceKey) {
            const ident = await tx.clientIdentifier.create({ data: { userId, clientId: client.id, type: "EXTERNAL", value: sourceKey, source: "PLANITY" } });
            await changes.record("ClientIdentifier", ident.id, "CREATED");
          }
          if (r.howFound) {
            const attr = await tx.attribution.create({
              data: { userId, clientId: client.id, channel: declared.channel, confidence: declared.confidence, method: "DECLARED", declaredAnswer: r.howFound, source: "PLANITY" },
            });
            await changes.record("Attribution", attr.id, "CREATED");
          }
          clientId = client.id;
          report.clientsCreated++;
          index.push({ id: client.id, normalizedName: client.normalizedName, emailHash: client.emailHash, phoneHash: client.phoneHash, sourceKeys: sourceKey ? [sourceKey] : [] });
          if (m.candidateId && (m.level === "PROBABLE" || m.level === "TO_VERIFY")) {
            const review = await tx.clientMatchReview.create({
              data: { userId, clientId: client.id, candidateClientId: m.candidateId, level: m.level, score: m.score, reasons: m.reasons as Prisma.InputJsonValue, importBatchId: batch.id },
            });
            await changes.record("ClientMatchReview", review.id, "CREATED");
            report.reviewsCreated++;
          }
        }
        resolvedInFile.set(fileIdentity, clientId);
      }

      // Prestation : rattachement au catalogue, sinon création (source PLANITY).
      const sKey = normalizeText(r.serviceName);
      let service = services.get(sKey) ?? null;
      if (!service) {
        service = await tx.service.create({
          data: { userId, name: r.serviceName, normalizedName: sKey, priceCents: r.priceCents ?? 0, source: "PLANITY", importedAt: now, active: true },
        });
        services.set(sKey, service);
        await changes.record("Service", service.id, "CREATED");
        report.servicesCreated.push(r.serviceName);
      }
      const estimated = r.priceCents === null;
      const priceCents = r.priceCents ?? service.priceCents;

      const res = await createAppointmentWithRevenue(
        userId,
        { clientId, clientName: r.clientName, serviceId: service.id, serviceName: service.name, startsAt: r.startsAt, status: r.status, priceCents, source: "PLANITY", externalId: r.externalId, importBatchId: batch.id, importedAt: now, notes: r.notes },
        tx,
      );
      const previewRow = { rowNumber: r.rowNumber, date: r.startsAt.toISOString(), client: r.clientName, service: service.name, priceCents, status: r.status, outcome: "", match: level as MatchLevel | "—" };
      if (res.duplicate) {
        report.duplicateRows++;
        previewRow.outcome = "Doublon ignoré";
      } else {
        report.importedRows++;
        previewRow.outcome = estimated ? "Importé (prix catalogue)" : "Importé";
        await changes.record("Appointment", res.appointment.id, "CREATED");
        if (res.revenue) {
          if (estimated) await tx.revenue.update({ where: { id: res.revenue.id }, data: { isEstimated: true } });
          await changes.record("Revenue", res.revenue.id, "CREATED");
          report.revenueCents += res.revenue.amountCents;
          if (estimated) report.estimatedRevenueCents += res.revenue.amountCents;
          // Anti double-comptage avec les saisies manuelles existantes.
          const around = await revenuesAround(userId, res.revenue.occurredAt, tx);
          for (const manual of around.filter((x) => x.source === "MANUAL" && x.reviewStatus === "OK" && !x.appointmentId)) {
            const d = classifyManualRevenue({ amountCents: manual.amountCents, occurredAt: manual.occurredAt, clientId: manual.clientId, serviceId: manual.serviceId, kind: manual.kind }, [
              { ...res.revenue, reviewStatus: "OK" },
            ]);
            if (d.decision === "CREATE") continue;
            const status = d.decision === "DUPLICATE" ? "DUPLICATE_IGNORED" : "NEEDS_REVIEW";
            await changes.record("Revenue", manual.id, "UPDATED", { reviewStatus: "OK", duplicateOfId: null, reviewNote: null });
            await tx.revenue.update({ where: { id: manual.id }, data: { reviewStatus: status, duplicateOfId: res.revenue.id, reviewNote: `Import Planity : ${d.reason}` } });
            if (status === "DUPLICATE_IGNORED") report.manualRevenueMarkedDuplicate++;
            else report.manualRevenueMarkedReview++;
          }
        }
      }
      if (report.preview.length < 50) report.preview.push(previewRow);
    }
    report.skippedRows = report.errorRows;
    if (report.estimatedRevenueCents > 0) report.warnings.push("Certaines lignes n'ont pas de prix : le prix catalogue a été utilisé et le revenu est marqué « estimé ».");

    await addRowErrors(batch.id, extracted.errors, tx);
    await finishImportBatch(
      batch.id,
      { status: "COMPLETED", totalRows: report.totalRows, importedRows: report.importedRows, skippedRows: report.skippedRows, duplicateRows: report.duplicateRows, errorRows: report.errorRows, report: { ...report, preview: undefined, errors: undefined } as unknown as Record<string, unknown> },
      tx,
    );
    if (input.dryRun) throw new DryRunRollback(report);
    return report;
  };

  try {
    const report = await prisma.$transaction(run, { timeout: 120_000, maxWait: 10_000 });
    await audit(userId, "import.planity.completed", { entity: "ImportBatch", entityId: report.batchId ?? undefined, metadata: { imported: report.importedRows, duplicates: report.duplicateRows, errors: report.errorRows } });
    if (job) await finishSyncJob(job.id, report.errorRows > 0 ? "PARTIAL" : "COMPLETED", report.importedRows, report.errorRows, { batchId: report.batchId, duplicates: report.duplicateRows });
    return report;
  } catch (e) {
    if (e instanceof DryRunRollback) return e.report;
    logger.error("import.planity.failed", { error: e as Error });
    if (job) await finishSyncJob(job.id, "FAILED", 0, 1, { error: (e as Error).message });
    throw e;
  }
}
