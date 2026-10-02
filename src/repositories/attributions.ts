import type { AcquisitionChannel, AttributionConfidence, AttributionMethod, DataSource } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export function upsertAttribution(
  userId: string,
  data: { clientId: string; channel: AcquisitionChannel; confidence: AttributionConfidence; method: AttributionMethod; declaredAnswer?: string | null; contentId?: string | null; leadId?: string | null; source?: DataSource },
  tx: Tx = prisma,
) {
  const payload = {
    channel: data.channel,
    confidence: data.confidence,
    method: data.method,
    declaredAnswer: data.declaredAnswer ?? null,
    contentId: data.contentId ?? null,
    leadId: data.leadId ?? null,
  };
  return tx.attribution.upsert({
    where: { clientId: data.clientId },
    create: { userId, clientId: data.clientId, source: data.source ?? "MANUAL", ...payload },
    update: payload,
  });
}

export function getAttribution(userId: string, clientId: string) {
  return prisma.attribution.findFirst({ where: { userId, clientId }, include: { content: { select: { id: true, title: true } } } });
}
