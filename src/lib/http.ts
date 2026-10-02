import "server-only";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** Garde des route handlers : session + rate limit. Retourne userId ou une réponse d'erreur. */
export async function requireApiUser(limit: keyof typeof LIMITS): Promise<{ userId: string } | { response: NextResponse }> {
  const userId = await currentUserId();
  if (!userId) return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  const rl = rateLimit(`${limit}:${userId}`, LIMITS[limit].limit, LIMITS[limit].windowMs);
  if (!rl.ok) return { response: NextResponse.json({ error: `Trop de requêtes, réessaie dans ${rl.retryAfterSec}s` }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }) };
  return { userId };
}
