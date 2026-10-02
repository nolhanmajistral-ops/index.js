import { randomBytes } from "node:crypto";
import type { Platform } from "@prisma/client";
import { createInstagramProvider } from "@/providers/instagram";
import { createTikTokProvider } from "@/providers/tiktok";
import type { Fetcher, SocialProvider } from "@/providers/social-types";
import { addSocialSnapshot, clearSocialTokens, ensureSocialAccount, getSocialAccounts, readSocialAccessToken, setSocialStatus, storeSocialTokens } from "@/repositories/social";
import { finishSyncJob, startSyncJob } from "@/repositories/sync";
import { audit } from "@/repositories/audit";
import { logger } from "@/lib/logger";

/** Point d'entrée unique vers les providers sociaux (app/ n'importe jamais un provider directement). */
export function socialProvider(platform: Platform, env: Record<string, string | undefined> = process.env, http: Fetcher = fetch): SocialProvider {
  return platform === "INSTAGRAM" ? createInstagramProvider(env, http) : createTikTokProvider(env, http);
}

export async function socialIntegrationStatus(userId: string, env: Record<string, string | undefined> = process.env) {
  const accounts = await getSocialAccounts(userId);
  return (["INSTAGRAM", "TIKTOK"] as const).map((platform) => {
    const p = socialProvider(platform, env);
    const acc = accounts.find((a) => a.platform === platform);
    // Sans configuration serveur, le statut est TOUJOURS "Configuration required", quoi qu'il y ait en base.
    const status = !p.isConfigured() ? "CONFIGURATION_REQUIRED" : acc?.hasToken ? acc.status : "DISCONNECTED";
    return { platform, configured: p.isConfigured(), missing: p.missingConfig(), status, handle: acc?.handle ?? null, lastSyncedAt: acc?.lastSyncedAt ?? null, lastError: acc?.lastError ?? null };
  });
}

export function newOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function startConnect(platform: Platform, state: string, env?: Record<string, string | undefined>) {
  return socialProvider(platform, env).getAuthorizationUrl(state);
}

/** Callback OAuth : échange du code, stockage CHIFFRÉ du jeton, statut CONNECTED uniquement après succès réel. */
export async function completeConnect(userId: string, platform: Platform, code: string, env?: Record<string, string | undefined>, http?: Fetcher) {
  const p = socialProvider(platform, env, http);
  if (!p.isConfigured()) throw new Error("Configuration required");
  await ensureSocialAccount(userId, platform);
  try {
    const tokens = await p.exchangeCode(code);
    await storeSocialTokens(userId, platform, tokens);
    await audit(userId, "social.connected", { metadata: { platform } });
    return syncSocial(userId, platform, env, http);
  } catch (e) {
    await setSocialStatus(userId, platform, "ERROR", (e as Error).message.slice(0, 200));
    logger.warn("social.connect_failed", { platform, error: e as Error });
    throw e;
  }
}

/** Synchronisation réelle : crée un snapshot (source = plateforme) uniquement avec les valeurs effectivement reçues. */
export async function syncSocial(userId: string, platform: Platform, env?: Record<string, string | undefined>, http?: Fetcher) {
  const p = socialProvider(platform, env, http);
  if (!p.isConfigured()) return { ok: false, status: "CONFIGURATION_REQUIRED" as const };
  const token = await readSocialAccessToken(userId, platform);
  if (!token) return { ok: false, status: "DISCONNECTED" as const };
  const job = await startSyncJob(userId, platform, "account-metrics");
  await setSocialStatus(userId, platform, "SYNCING");
  try {
    const m = await p.fetchAccountMetrics(token);
    await addSocialSnapshot(userId, { platform, capturedAt: new Date(), followers: m.followers ?? undefined, views: m.views ?? undefined, likes: m.likes ?? undefined, comments: m.comments ?? undefined, shares: m.shares ?? undefined, source: platform });
    const partial = [m.views, m.likes].some((v) => v === null);
    await setSocialStatus(userId, platform, partial ? "PARTIAL" : "CONNECTED");
    await finishSyncJob(job.id, partial ? "PARTIAL" : "COMPLETED", 1, 0);
    return { ok: true, status: partial ? ("PARTIAL" as const) : ("CONNECTED" as const) };
  } catch (e) {
    await setSocialStatus(userId, platform, "ERROR", (e as Error).message.slice(0, 200));
    await finishSyncJob(job.id, "FAILED", 0, 1, { error: (e as Error).message });
    return { ok: false, status: "ERROR" as const };
  }
}

export async function disconnectSocial(userId: string, platform: Platform) {
  await clearSocialTokens(userId, platform);
  await audit(userId, "social.disconnected", { metadata: { platform } });
}
