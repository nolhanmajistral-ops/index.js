import { normalizeText } from "@/datahub/normalization";
import type { ColumnMapping, PlanityField } from "./types";

/** Synonymes FR/EN des colonnes d'export (normalisés). */
export const COLUMN_SYNONYMS: Record<PlanityField, string[]> = {
  externalId: ["id", "id rdv", "id rendez vous", "booking id", "appointment id", "reference", "ref", "numero", "n rdv"],
  date: ["date", "date rdv", "date rendez vous", "date du rendez vous", "appointment date", "jour", "day", "date et heure", "debut", "start", "start date", "datetime"],
  time: ["heure", "time", "heure rdv", "start time", "heure de debut", "horaire"],
  clientName: ["client", "nom client", "customer", "customer name", "client name", "nom complet", "full name", "name", "nom"],
  firstName: ["prenom", "first name", "firstname", "given name"],
  lastName: ["nom de famille", "last name", "lastname", "surname", "family name"],
  email: ["email", "e mail", "mail", "courriel", "adresse email", "email address"],
  phone: ["telephone", "tel", "phone", "mobile", "portable", "phone number", "numero de telephone", "natel"],
  service: ["prestation", "prestations", "service", "services", "soin", "treatment"],
  price: ["prix", "price", "montant", "amount", "total", "tarif", "prix chf", "price chf", "montant chf"],
  status: ["statut", "status", "etat", "state"],
  howFound: ["comment nous as tu trouve", "comment nous avez vous trouve", "source", "how did you find us", "canal", "provenance", "origine"],
  notes: ["notes", "note", "commentaire", "commentaires", "comment", "remarques"],
};

/**
 * Détecte le mapping colonnes → champs. "Nom" devient nom de famille si une colonne "Prénom" existe,
 * sinon nom complet du client.
 */
export function detectMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => normalizeText(h));
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const hasFirstName = norm.some((h) => COLUMN_SYNONYMS.firstName.includes(h));
  const order: PlanityField[] = ["externalId", "firstName", "lastName", "email", "phone", "service", "price", "status", "howFound", "notes", "time", "date", "clientName"];
  for (const field of order) {
    let synonyms = COLUMN_SYNONYMS[field];
    if (field === "lastName" && hasFirstName) synonyms = [...synonyms, "nom"];
    if (field === "clientName" && hasFirstName) synonyms = synonyms.filter((s) => s !== "nom");
    const idx = norm.findIndex((h, i) => !used.has(i) && synonyms.includes(h));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Nombre de colonnes reconnues dans une ligne (pour trouver la ligne d'en-tête). */
export function recognizedColumns(cells: string[]): number {
  const all = new Set(Object.values(COLUMN_SYNONYMS).flat());
  return cells.filter((c) => all.has(normalizeText(c))).length;
}

export function mappingIsUsable(m: ColumnMapping): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (m.date === undefined || m.date === null) missing.push("date");
  if ((m.clientName ?? null) === null && (m.firstName ?? null) === null && (m.lastName ?? null) === null) missing.push("client");
  if (m.service === undefined || m.service === null) missing.push("prestation");
  return { ok: missing.length === 0, missing };
}
