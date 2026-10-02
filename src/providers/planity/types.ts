/** Modèles EXTERNES (format Planity) — convertis en modèles internes par le DataHub. */
export type CellValue = string | number | Date | null;

export interface RawTable {
  headers: string[];
  headerRowNumber: number; // numéro de ligne (1-based) de l'en-tête dans le fichier
  rows: { rowNumber: number; cells: CellValue[] }[];
}

export const PLANITY_FIELDS = [
  "externalId",
  "date",
  "time",
  "clientName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "service",
  "price",
  "status",
  "howFound",
  "notes",
] as const;
export type PlanityField = (typeof PLANITY_FIELDS)[number];

/** Mapping champ interne → index de colonne (ou null). */
export type ColumnMapping = Partial<Record<PlanityField, number | null>>;

export type PlanityStatus = "COMPLETED" | "CANCELLED" | "NO_SHOW" | "BOOKED";

export interface PlanityAppointmentRecord {
  rowNumber: number;
  externalId: string | null;
  startsAt: Date;
  clientName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  serviceName: string;
  priceCents: number | null;
  status: PlanityStatus;
  statusAssumed: boolean;
  howFound: string | null;
  notes: string | null;
  raw: string;
}

export interface PlanityRowError {
  rowNumber: number;
  rawValue: string;
  error: string;
  correction?: string | null;
}
