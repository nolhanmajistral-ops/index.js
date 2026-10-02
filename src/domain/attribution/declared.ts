import type { AcquisitionChannel, AttributionConfidence } from "@prisma/client";
import { normalizeText } from "@/datahub/normalization";

const CHANNEL_WORDS: [AcquisitionChannel, string[]][] = [
  ["INSTAGRAM", ["instagram", "insta", "ig", "reel", "reels"]],
  ["TIKTOK", ["tiktok", "tik tok", "tt"]],
  ["GOOGLE", ["google", "google maps", "maps", "recherche google"]],
  ["PLANITY", ["planity"]],
  ["WORD_OF_MOUTH", ["bouche a oreille", "bouche a l oreille", "ami", "amis", "un ami", "recommandation", "famille", "word of mouth", "friend"]],
  ["WALK_IN", ["passage", "en passant", "walk in", "vitrine"]],
];

/**
 * Attribution déclarée ("Comment nous as-tu trouvé ?").
 * HIGH uniquement si le client a déclaré une source reconnue. Sinon UNKNOWN. Jamais d'invention.
 */
export function attributionFromDeclaration(answer: string | null | undefined): { channel: AcquisitionChannel; confidence: AttributionConfidence } {
  const n = normalizeText(answer);
  if (!n) return { channel: "UNKNOWN", confidence: "UNKNOWN" };
  for (const [channel, words] of CHANNEL_WORDS) {
    if (words.some((w) => n === w || n.split(" ").includes(w) || (w.includes(" ") && n.includes(w)))) return { channel, confidence: "HIGH" };
  }
  return { channel: "OTHER", confidence: "LOW" };
}

/** Saisie manuelle d'un canal par Nolhan (sans déclaration du client) : confiance MEDIUM. */
export function attributionFromManualChannel(channel: AcquisitionChannel, declaredAnswer?: string | null): { channel: AcquisitionChannel; confidence: AttributionConfidence; method: "DECLARED" | "INFERRED" } {
  if (declaredAnswer && declaredAnswer.trim()) {
    const d = attributionFromDeclaration(declaredAnswer);
    return { ...d, method: "DECLARED" };
  }
  if (channel === "UNKNOWN") return { channel, confidence: "UNKNOWN", method: "INFERRED" };
  return { channel, confidence: "MEDIUM", method: "INFERRED" };
}
