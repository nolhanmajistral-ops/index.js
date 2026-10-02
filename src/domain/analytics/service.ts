import { loadDataset } from "@/repositories/analytics";
import { getSetting } from "@/repositories/settings";
import { scoreWeightsSchema, type ScoreWeights } from "@/lib/validation/schemas";
import { buildSnapshot } from "./snapshot";
import { detectAnomalies } from "./anomalies";
import { DEFAULT_SCORE_WEIGHTS } from "@/domain/content/scores";

export const SCORE_WEIGHTS_KEY = "content.scoreWeights";

export async function getScoreWeights(userId: string): Promise<ScoreWeights> {
  const raw = await getSetting<unknown>(userId, SCORE_WEIGHTS_KEY);
  const parsed = scoreWeightsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SCORE_WEIGHTS;
}

/** Point d'entrée unique : dataset → snapshot → anomalies. */
export async function getAnalytics(userId: string, now = new Date()) {
  const [ds, weights] = await Promise.all([loadDataset(userId, now), getScoreWeights(userId)]);
  const snapshot = buildSnapshot(ds, weights);
  const anomalies = detectAnomalies(ds, snapshot);
  return { ds, snapshot, anomalies, weights };
}
