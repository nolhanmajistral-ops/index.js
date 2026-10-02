import { prisma } from "@/lib/db";
import { mergeClients } from "@/repositories/clients";
import { findReview, setReviewStatus } from "@/repositories/match-reviews";
import { audit } from "@/repositories/audit";

/**
 * File de revue des correspondances. Décisions manuelles uniquement, toutes tracées dans l'audit.
 * Fusion : le client importé (review.clientId) est fusionné dans le client existant (candidateClientId).
 */
export async function decideMatchReview(userId: string, reviewId: string, decision: "MERGE" | "IGNORE") {
  return prisma.$transaction(async (tx) => {
    const review = await findReview(userId, reviewId, tx);
    if (!review) throw new Error("Revue introuvable");
    if (review.status !== "PENDING") throw new Error("Revue déjà traitée");
    if (decision === "IGNORE") {
      await setReviewStatus(userId, reviewId, "IGNORED", tx);
      await audit(userId, "client.match.ignored", { entity: "ClientMatchReview", entityId: reviewId, metadata: { level: review.level } }, tx);
      return { status: "IGNORED" as const };
    }
    await setReviewStatus(userId, reviewId, "MERGED", tx);
    await audit(userId, "client.match.merged", { entity: "Client", entityId: review.candidateClientId, metadata: { mergedClientId: review.clientId, level: review.level, score: review.score } }, tx);
    // Les autres revues impliquant le client fusionné deviennent caduques (cascade à la suppression).
    await mergeClients(userId, review.candidateClientId, review.clientId, tx);
    return { status: "MERGED" as const, keptClientId: review.candidateClientId };
  });
}
