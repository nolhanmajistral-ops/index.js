import type { ProviderResult } from "../types";
import { configurationRequired } from "../types";
import { parseFile, type FileKind } from "./parse-file";
import { detectMapping } from "./columns";
import { extractAppointments, type ExtractResult } from "./records";
import type { ColumnMapping, RawTable } from "./types";

/**
 * PlanityProvider.
 * Planity ne propose PAS d'API publique documentée : aucune connexion/synchronisation automatique n'est
 * simulée. La seule source réelle est l'export CSV/XLSX fourni par l'utilisateur (statut "Connected (import)").
 */
export class PlanityProvider {
  readonly name = "PLANITY" as const;

  async connect(): Promise<ProviderResult<never>> {
    return configurationRequired("Planity ne fournit pas d'API publique. Utilisez l'import CSV/XLSX.");
  }

  async disconnect(): Promise<ProviderResult<never>> {
    return { ok: true, status: "DISCONNECTED" };
  }

  async sync(): Promise<ProviderResult<never>> {
    return configurationRequired("Synchronisation automatique indisponible (pas d'API Planity). Importez un export CSV/XLSX.");
  }

  /** Lecture d'un export (seule source de données réelle). */
  async readExport(buf: Buffer, kind: FileKind): Promise<RawTable> {
    return parseFile(buf, kind);
  }

  detectMapping(table: RawTable): ColumnMapping {
    return detectMapping(table.headers);
  }

  getAppointments(table: RawTable, mapping: ColumnMapping, now?: Date): ExtractResult {
    return extractAppointments(table, mapping, now);
  }

  /** Clients distincts présents dans l'export (dérivés des rendez-vous). */
  getClients(table: RawTable, mapping: ColumnMapping) {
    const { records } = extractAppointments(table, mapping);
    const seen = new Map<string, { name: string; email: string | null; phone: string | null }>();
    for (const r of records) {
      const key = (r.email ?? r.phone ?? r.clientName).toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: r.clientName, email: r.email, phone: r.phone });
    }
    return [...seen.values()];
  }

  getServices(table: RawTable, mapping: ColumnMapping) {
    const { records } = extractAppointments(table, mapping);
    return [...new Set(records.map((r) => r.serviceName))];
  }

  getRevenue(table: RawTable, mapping: ColumnMapping) {
    const { records } = extractAppointments(table, mapping);
    return records.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + (r.priceCents ?? 0), 0);
  }

  async getMetrics(): Promise<ProviderResult<never>> {
    return configurationRequired("Métriques Planity disponibles uniquement via import.");
  }
}

export const planityProvider = new PlanityProvider();
