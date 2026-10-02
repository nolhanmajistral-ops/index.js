import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { completeConnect, socialIntegrationStatus, socialProvider, startConnect, syncSocial } from "@/datahub/social/service";
import { planityProvider } from "@/providers/planity";
import { storeSocialTokens, ensureSocialAccount } from "@/repositories/social";

const IG_ENV = { INSTAGRAM_APP_ID: "app", INSTAGRAM_APP_SECRET: "secret", INSTAGRAM_REDIRECT_URI: "https://os.example.ch/api/integrations/instagram/callback" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(resetDb);

describe("Intégrations — aucune fausse connexion", () => {
  it("sans configuration : Configuration required, même si un jeton existe en base", async () => {
    const u = await createTestUser();
    await ensureSocialAccount(u.id, "INSTAGRAM");
    await storeSocialTokens(u.id, "INSTAGRAM", { accessToken: "x" });
    const status = await socialIntegrationStatus(u.id, {});
    expect(status.map((s) => s.status)).toEqual(["CONFIGURATION_REQUIRED", "CONFIGURATION_REQUIRED"]);
    expect(status[0]!.missing).toEqual(["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"]);
    expect(startConnect("INSTAGRAM", "state", {})).toMatchObject({ ok: false, status: "CONFIGURATION_REQUIRED" });
    expect(await syncSocial(u.id, "INSTAGRAM", {})).toMatchObject({ ok: false, status: "CONFIGURATION_REQUIRED" });
    expect(await prisma.socialMetric.count()).toBe(0);
  });

  it("Planity : connect/sync renvoient Configuration required (pas d'API inventée)", async () => {
    expect(await planityProvider.connect()).toMatchObject({ ok: false, status: "CONFIGURATION_REQUIRED" });
    expect(await planityProvider.sync()).toMatchObject({ ok: false, status: "CONFIGURATION_REQUIRED" });
  });

  it("configuré : URL OAuth officielle avec scopes et state, sans mot de passe", () => {
    const r = startConnect("INSTAGRAM", "abc123", IG_ENV);
    expect(r.ok).toBe(true);
    const url = new URL(r.data!);
    expect(url.host).toBe("www.instagram.com");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("scope")).toContain("instagram_business_basic");
    const tt = socialProvider("TIKTOK", { TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", TIKTOK_REDIRECT_URI: "https://x/cb" }).getAuthorizationUrl("st");
    expect(new URL(tt.data!).searchParams.get("client_key")).toBe("k");
  });

  it("callback : échange de code, jeton chiffré, snapshot créé uniquement avec les valeurs reçues", async () => {
    const u = await createTestUser();
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.instagram.com/oauth/access_token")) return json({ access_token: "short-token", user_id: 42, permissions: ["instagram_business_basic"] });
      if (url.startsWith("https://graph.instagram.com/access_token")) return json({ access_token: "long-lived-SECRET", expires_in: 5184000 });
      if (url.startsWith("https://graph.instagram.com/me")) return json({ username: "nolhan.barber", followers_count: 2100 });
      return json({}, 404);
    };
    const res = await completeConnect(u.id, "INSTAGRAM", "code", IG_ENV, fakeFetch);
    expect(res).toMatchObject({ ok: true, status: "PARTIAL" }); // vues non fournies → Partial, pas Connected
    const acc = await prisma.socialAccount.findFirstOrThrow({ where: { userId: u.id } });
    expect(acc.accessTokenEnc).not.toContain("SECRET");
    const snap = await prisma.socialMetric.findFirstOrThrow({ where: { userId: u.id } });
    expect(snap).toMatchObject({ followers: 2100, views: null, likes: null, source: "INSTAGRAM" });
    expect(await prisma.syncJob.count({ where: { userId: u.id, status: "PARTIAL" } })).toBe(1);
  });

  it("erreur API : statut Error, aucun snapshot", async () => {
    const u = await createTestUser();
    const failing: typeof fetch = async () => json({ error: "invalid_code" }, 400);
    await expect(completeConnect(u.id, "INSTAGRAM", "bad", IG_ENV, failing)).rejects.toThrow();
    expect((await prisma.socialAccount.findFirstOrThrow({ where: { userId: u.id } })).status).toBe("ERROR");
    expect(await prisma.socialMetric.count()).toBe(0);
  });
});
