import { configurationRequired } from "../types";
import type { Fetcher, SocialAccountMetrics, SocialProvider, TokenSet } from "../social-types";

/**
 * TikTokProvider — TikTok Login Kit + Display API (v2). Préparé selon la documentation TikTok for Developers ;
 * inactif tant que TIKTOK_CLIENT_KEY / SECRET / REDIRECT_URI ne sont pas configurés et l'app validée. Voir docs/TIKTOK.md.
 */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];

export function createTikTokProvider(env: Record<string, string | undefined> = process.env, http: Fetcher = fetch): SocialProvider {
  const required = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"];
  const missing = () => required.filter((k) => !env[k]);
  return {
    platform: "TIKTOK",
    requiredEnv: required,
    isConfigured: () => missing().length === 0,
    missingConfig: missing,
    getAuthorizationUrl(state) {
      if (missing().length) return configurationRequired(`Variables manquantes : ${missing().join(", ")}`);
      const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
      u.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY!);
      u.searchParams.set("scope", TIKTOK_SCOPES.join(","));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", env.TIKTOK_REDIRECT_URI!);
      u.searchParams.set("state", state);
      return { ok: true, status: "DISCONNECTED", data: u.toString() };
    },
    async exchangeCode(code): Promise<TokenSet> {
      const res = await http("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY!, client_secret: env.TIKTOK_CLIENT_SECRET!, code, grant_type: "authorization_code", redirect_uri: env.TIKTOK_REDIRECT_URI! }),
      });
      if (!res.ok) throw new Error(`TikTok token exchange failed (${res.status})`);
      const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; open_id?: string; error?: string };
      if (!j.access_token) throw new Error(`TikTok token exchange error (${j.error ?? "unknown"})`);
      return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null, scopes: j.scope, externalId: j.open_id };
    },
    async fetchAccountMetrics(accessToken): Promise<SocialAccountMetrics> {
      const res = await http("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`TikTok user info failed (${res.status})`);
      const j = (await res.json()) as { data?: { user?: { display_name?: string; follower_count?: number; likes_count?: number } } };
      const u = j.data?.user;
      return { followers: u?.follower_count ?? null, likes: u?.likes_count ?? null, views: null, comments: null, shares: null, username: u?.display_name ?? null };
    },
  };
}
