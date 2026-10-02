import { configurationRequired } from "../types";
import type { Fetcher, SocialAccountMetrics, SocialProvider, TokenSet } from "../social-types";

/**
 * InstagramProvider — « Instagram API with Instagram Login » (compte professionnel requis).
 * Préparé selon la documentation Meta ; inactif tant que INSTAGRAM_APP_ID / SECRET / REDIRECT_URI ne sont pas configurés.
 * Voir docs/INSTAGRAM.md.
 */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];
const GRAPH = "https://graph.instagram.com";

export function createInstagramProvider(env: Record<string, string | undefined> = process.env, http: Fetcher = fetch): SocialProvider {
  const required = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"];
  const missing = () => required.filter((k) => !env[k]);
  return {
    platform: "INSTAGRAM",
    requiredEnv: required,
    isConfigured: () => missing().length === 0,
    missingConfig: missing,
    getAuthorizationUrl(state) {
      if (missing().length) return configurationRequired(`Variables manquantes : ${missing().join(", ")}`);
      const u = new URL("https://www.instagram.com/oauth/authorize");
      u.searchParams.set("client_id", env.INSTAGRAM_APP_ID!);
      u.searchParams.set("redirect_uri", env.INSTAGRAM_REDIRECT_URI!);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
      u.searchParams.set("state", state);
      return { ok: true, status: "DISCONNECTED", data: u.toString() };
    },
    async exchangeCode(code): Promise<TokenSet> {
      const body = new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID!, client_secret: env.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: env.INSTAGRAM_REDIRECT_URI!, code });
      const short = await http("https://api.instagram.com/oauth/access_token", { method: "POST", body });
      if (!short.ok) throw new Error(`Instagram token exchange failed (${short.status})`);
      const s = (await short.json()) as { access_token: string; user_id?: number | string; permissions?: string[] };
      // Jeton longue durée (~60 jours)
      const longUrl = new URL(`${GRAPH}/access_token`);
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", env.INSTAGRAM_APP_SECRET!);
      longUrl.searchParams.set("access_token", s.access_token);
      const long = await http(longUrl.toString());
      if (!long.ok) throw new Error(`Instagram long-lived token failed (${long.status})`);
      const l = (await long.json()) as { access_token: string; expires_in?: number };
      return { accessToken: l.access_token, expiresAt: l.expires_in ? new Date(Date.now() + l.expires_in * 1000) : null, scopes: (s.permissions ?? INSTAGRAM_SCOPES).join(","), externalId: s.user_id ? String(s.user_id) : undefined };
    },
    async fetchAccountMetrics(accessToken): Promise<SocialAccountMetrics> {
      const u = new URL(`${GRAPH}/me`);
      u.searchParams.set("fields", "user_id,username,followers_count,media_count");
      u.searchParams.set("access_token", accessToken);
      const res = await http(u.toString());
      if (!res.ok) throw new Error(`Instagram profile fetch failed (${res.status})`);
      const j = (await res.json()) as { username?: string; followers_count?: number };
      // Les vues/likes agrégés nécessitent l'API insights par média : non récupérés ici → null (jamais inventés).
      return { followers: j.followers_count ?? null, views: null, likes: null, comments: null, shares: null, username: j.username ?? null };
    },
  };
}
