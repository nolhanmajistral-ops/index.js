import { normalizeText } from "@/datahub/normalization";

/**
 * Clés métier déterministes, indépendantes de la source.
 * Un même rendez-vous saisi manuellement puis importé de Planity produit la même clé → jamais compté deux fois.
 */
export function minuteKey(d: Date): string {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000).toISOString();
}

export function appointmentDedupKey(input: { clientId?: string | null; clientName?: string | null; startsAt: Date; serviceName: string }): string {
  const who = input.clientId ? `c:${input.clientId}` : `n:${normalizeText(input.clientName) || "anon"}`;
  return `appt|${who}|${minuteKey(input.startsAt)}|${normalizeText(input.serviceName)}`;
}

export function appointmentRevenueDedupKey(appointmentDedupKey: string): string {
  return `rev|${appointmentDedupKey}`;
}

export function manualRevenueDedupKey(uniqueId: string): string {
  return `rev|manual|${uniqueId}`;
}
