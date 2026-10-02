import type { ConnectionStatus, DataSource, Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptNullable, encryptNullable } from "@/lib/crypto";

/** Vue publique d'un compte social : les tokens ne sortent jamais de ce module. */
export async function getSocialAccounts(userId: string) {
  const rows = await prisma.socialAccount.findMany({ where: { userId } });
  return rows.map(({ accessTokenEnc, refreshTokenEnc, ...rest }) => ({ ...rest, hasToken: Boolean(accessTokenEnc || refreshTokenEnc) }));
}

export function ensureSocialAccount(userId: string, platform: Platform, handle?: string | null) {
  return prisma.socialAccount.upsert({
    where: { userId_platform: { userId, platform } },
    create: { userId, platform, handle: handle ?? null, status: "CONFIGURATION_REQUIRED" },
    update: handle !== undefined ? { handle } : {},
  });
}

export function setSocialStatus(userId: string, platform: Platform, status: ConnectionStatus, lastError?: string | null) {
  return prisma.socialAccount.update({ where: { userId_platform: { userId, platform } }, data: { status, lastError: lastError ?? null } });
}

export function storeSocialTokens(userId: string, platform: Platform, tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; scopes?: string; externalId?: string }) {
  return prisma.socialAccount.update({
    where: { userId_platform: { userId, platform } },
    data: {
      accessTokenEnc: encryptNullable(tokens.accessToken),
      refreshTokenEnc: encryptNullable(tokens.refreshToken ?? null),
      tokenExpiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      externalId: tokens.externalId,
      status: "CONNECTED",
    },
  });
}

/** Lecture interne (providers uniquement) du token déchiffré. */
export async function readSocialAccessToken(userId: string, platform: Platform) {
  const acc = await prisma.socialAccount.findUnique({ where: { userId_platform: { userId, platform } } });
  return decryptNullable(acc?.accessTokenEnc);
}

export function clearSocialTokens(userId: string, platform: Platform) {
  return prisma.socialAccount.updateMany({
    where: { userId, platform },
    data: { accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, status: "DISCONNECTED" },
  });
}

/** Ajoute un snapshot (jamais d'écrasement : la contrainte unique empêche un second snapshot identique). */
export async function addSocialSnapshot(
  userId: string,
  data: { platform: Platform; capturedAt: Date; followers?: number; views?: number; likes?: number; comments?: number; shares?: number; source?: DataSource },
) {
  const account = await ensureSocialAccount(userId, data.platform);
  return prisma.socialMetric.create({
    data: {
      userId,
      socialAccountId: account.id,
      platform: data.platform,
      capturedAt: data.capturedAt,
      followers: data.followers ?? null,
      views: data.views ?? null,
      likes: data.likes ?? null,
      comments: data.comments ?? null,
      shares: data.shares ?? null,
      source: data.source ?? "MANUAL",
    },
  });
}

export function listSocialMetrics(userId: string, platform?: Platform, since?: Date) {
  return prisma.socialMetric.findMany({
    where: { userId, ...(platform ? { platform } : {}), ...(since ? { capturedAt: { gte: since } } : {}) },
    orderBy: { capturedAt: "asc" },
    take: 2000,
  });
}

export async function deleteSocialSnapshot(userId: string, id: string) {
  const r = await prisma.socialMetric.deleteMany({ where: { id, userId } });
  return r.count === 1;
}
