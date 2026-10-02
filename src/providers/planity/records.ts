import { parseMoneyToCents } from "@/lib/money";
import { zonedMidnight, DEFAULT_TZ } from "@/lib/dates";
import { normalizeText } from "@/datahub/normalization";
import type { CellValue, ColumnMapping, PlanityAppointmentRecord, PlanityRowError, PlanityStatus, RawTable } from "./types";

const STATUS_MAP: [PlanityStatus, string[]][] = [
  ["COMPLETED", ["honore", "termine", "effectue", "realise", "completed", "done", "venu", "paye", "paid", "fini", "valide"]],
  ["CANCELLED", ["annule", "cancelled", "canceled", "annulation", "annule par le client", "annule par le salon"]],
  ["NO_SHOW", ["absent", "no show", "noshow", "lapin", "non honore", "pas venu"]],
  ["BOOKED", ["confirme", "reserve", "booked", "confirmed", "a venir", "upcoming", "planifie", "en attente", "pending"]],
];

export function parseStatus(v: string | null): PlanityStatus | null {
  const n = normalizeText(v);
  if (!n) return null;
  for (const [status, words] of STATUS_MAP) if (words.includes(n)) return status;
  return null;
}

function str(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Excel stocke les dates en numéro de série (1900). */
function excelSerialToParts(n: number) {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

interface DateParts { y: number; m: number; d: number; h?: number; min?: number }

export function parseDateParts(v: CellValue | undefined): DateParts | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // exceljs renvoie les dates "naïves" en UTC : on lit les composantes UTC comme heure locale du salon.
    return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate(), h: v.getUTCHours(), min: v.getUTCMinutes() };
  }
  if (typeof v === "number") return v > 20000 && v < 80000 ? excelSerialToParts(v) : null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2})[:h](\d{2}))?/);
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]!, h: m[4] ? +m[4] : undefined, min: m[5] ? +m[5] : undefined };
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[\s,à]+(\d{1,2})[:h](\d{2}))?/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return { y, m: +m[2]!, d: +m[1]!, h: m[4] ? +m[4] : undefined, min: m[5] ? +m[5] : undefined };
  }
  return null;
}

export function parseTime(v: CellValue | undefined): { h: number; min: number } | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { h: v.getUTCHours(), min: v.getUTCMinutes() };
  if (typeof v === "number") {
    if (v >= 0 && v < 1) {
      const total = Math.round(v * 24 * 60);
      return { h: Math.floor(total / 60), min: total % 60 };
    }
    return null;
  }
  const m = v.trim().match(/^(\d{1,2})[:h.](\d{2})/i);
  if (!m) return null;
  return { h: +m[1]!, min: +m[2]! };
}

function validParts(p: DateParts) {
  return p.y >= 2000 && p.y <= 2100 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31 && (p.h ?? 0) < 24 && (p.min ?? 0) < 60;
}

export interface ExtractResult {
  records: PlanityAppointmentRecord[];
  errors: PlanityRowError[];
  warnings: string[];
}

/** Convertit les lignes brutes en enregistrements Planity validés (aucune écriture en base). */
export function extractAppointments(table: RawTable, mapping: ColumnMapping, now = new Date(), tz = DEFAULT_TZ): ExtractResult {
  const records: PlanityAppointmentRecord[] = [];
  const errors: PlanityRowError[] = [];
  let assumedStatus = 0;
  const get = (cells: CellValue[], idx: number | null | undefined) => (idx === null || idx === undefined ? null : (cells[idx] ?? null));

  for (const row of table.rows) {
    const raw = row.cells.map((c) => (c instanceof Date ? c.toISOString() : (c ?? ""))).join(" | ");
    const fail = (error: string, correction?: string) => errors.push({ rowNumber: row.rowNumber, rawValue: raw, error, correction: correction ?? null });

    const dateParts = parseDateParts(get(row.cells, mapping.date));
    if (!dateParts || !validParts(dateParts)) {
      fail("Date invalide ou manquante", "Format attendu : JJ/MM/AAAA ou AAAA-MM-JJ");
      continue;
    }
    const time = parseTime(get(row.cells, mapping.time));
    const h = time?.h ?? dateParts.h ?? 0;
    const min = time?.min ?? dateParts.min ?? 0;
    const startsAt = new Date(zonedMidnight(dateParts.y, dateParts.m, dateParts.d, tz).getTime() + (h * 60 + min) * 60_000);

    const firstName = str(get(row.cells, mapping.firstName));
    const lastName = str(get(row.cells, mapping.lastName));
    const fullName = str(get(row.cells, mapping.clientName));
    const clientName = [firstName, lastName].filter(Boolean).join(" ") || fullName || "";
    if (!clientName) {
      fail("Nom du client manquant");
      continue;
    }
    const serviceName = str(get(row.cells, mapping.service));
    if (!serviceName) {
      fail("Prestation manquante");
      continue;
    }
    const priceRaw = get(row.cells, mapping.price);
    let priceCents: number | null = null;
    if (priceRaw !== null && String(priceRaw).trim() !== "") {
      priceCents = parseMoneyToCents(typeof priceRaw === "number" ? priceRaw : String(priceRaw));
      if (priceCents === null) {
        fail(`Prix invalide : "${String(priceRaw)}"`, "Utiliser un nombre, ex. 55 ou 55.00");
        continue;
      }
    }
    const statusRaw = str(get(row.cells, mapping.status));
    let status = parseStatus(statusRaw);
    let statusAssumed = false;
    if (statusRaw && !status) {
      fail(`Statut inconnu : "${statusRaw}"`, "Statuts reconnus : Honoré/Terminé, Annulé, Absent, Confirmé");
      continue;
    }
    if (!status) {
      status = startsAt.getTime() <= now.getTime() ? "COMPLETED" : "BOOKED";
      statusAssumed = true;
      assumedStatus++;
    }
    records.push({
      rowNumber: row.rowNumber,
      externalId: str(get(row.cells, mapping.externalId)),
      startsAt,
      clientName,
      firstName,
      lastName: lastName ?? (firstName ? null : null),
      email: str(get(row.cells, mapping.email)),
      phone: str(get(row.cells, mapping.phone)),
      serviceName,
      priceCents,
      status,
      statusAssumed,
      howFound: str(get(row.cells, mapping.howFound)),
      notes: str(get(row.cells, mapping.notes)),
      raw,
    });
  }
  const warnings: string[] = [];
  if (assumedStatus > 0) warnings.push(`${assumedStatus} ligne(s) sans statut : rendez-vous passés supposés réalisés, futurs supposés réservés.`);
  return { records, errors, warnings };
}
