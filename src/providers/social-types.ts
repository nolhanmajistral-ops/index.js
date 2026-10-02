import type { ProviderResult } from "./types";

export type SocialPlatform = "INSTAGRAM" | "TIKTOK";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string;
  externalId?: string;
}

export interface SocialAccountMetrics {
  followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  username?: string | null;
}

/** Interface commune Instagram / TikTok. OAuth officiel uniquement : jamais de mot de passe. */
export interface SocialProvider {
  readonly platform: SocialPlatform;
  readonly requiredEnv: string[];
  isConfigured(): boolean;
  missingConfig(): string[];
  getAuthorizationUrl(state: string): ProviderResult<string>;
  exchangeCode(code: string): Promise<TokenSet>;
  fetchAccountMetrics(accessToken: string): Promise<SocialAccountMetrics>;
}

export type Fetcher = typeof fetch;
