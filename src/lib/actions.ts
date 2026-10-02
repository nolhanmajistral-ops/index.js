import "server-only";
import { requireOnboardedUser } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { ZodError } from "zod";

export interface ActionState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Navigation effectuée côté client après succès (plus fiable qu'un redirect() dans une action de formulaire). */
  redirectTo?: string;
}

export const fieldErrors = (e: ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));

/**
 * Enveloppe des server actions : session obligatoire (userId issu de la session signée), rate limiting,
 * erreurs gérées et journalisées sans données sensibles.
 */
export async function guarded<T extends ActionState>(name: string, fn: (userId: string) => Promise<T>, limit: keyof typeof LIMITS = "mutation"): Promise<T | ActionState> {
  const user = await requireOnboardedUser();
  const rl = rateLimit(`${limit}:${user.id}`, LIMITS[limit].limit, LIMITS[limit].windowMs);
  if (!rl.ok) return { ok: false, message: `Trop de requêtes. Réessaie dans ${rl.retryAfterSec}s.` };
  try {
    return await fn(user.id);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    logger.error("action.failed", { action: name, error: e as Error });
    return { ok: false, message: e instanceof Error && e.message.length < 200 ? e.message : "Une erreur est survenue." };
  }
}
