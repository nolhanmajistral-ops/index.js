import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { createClient, deleteClient, getClient, listClients, updateClient } from "@/repositories/clients";
import { addContentMetric, archiveContent, createContent, getContent, listContents } from "@/repositories/contents";
import { updateMissionStatus, createMissions } from "@/repositories/missions";
import { addSocialSnapshot, getSocialAccounts, storeSocialTokens, ensureSocialAccount } from "@/repositories/social";

beforeEach(resetDb);

describe("isolation userId (repositories)", () => {
  it("un utilisateur ne voit ni ne modifie les clients d'un autre", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const c = await createClient(a.id, { firstName: "Jean", lastName: "Dupont", email: "jean@ex.ch", phone: "079 123 45 67", source: "MANUAL" });
    expect(await getClient(b.id, c.id)).toBeNull();
    expect((await listClients(b.id)).total).toBe(0);
    expect(await updateClient(b.id, c.id, { firstName: "Hack" })).toBeNull();
    expect(await deleteClient(b.id, c.id)).toBe(false);
    const own = await getClient(a.id, c.id);
    expect(own?.displayName).toBe("Jean Dupont");
    expect(own?.email).toBe("jean@ex.ch");
    expect(own?.phone).toBe("+41791234567");
  });

  it("les contenus, métriques et missions sont scopés", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const content = await createContent(a.id, { platform: "INSTAGRAM", title: "Fade", type: "TRANSFORMATION", status: "PUBLISHED" });
    expect(await getContent(b.id, content.id)).toBeNull();
    expect(await addContentMetric(b.id, content.id, { views: 10 })).toBeNull();
    expect(await archiveContent(b.id, content.id, true)).toBe(false);
    expect((await listContents(b.id)).total).toBe(0);
    const [m] = await createMissions(a.id, new Date("2026-10-01"), [{ code: "x", title: "t", why: "w", action: "a", priority: 1, expectedResult: "r", dataUsed: {} }]);
    expect(await updateMissionStatus(b.id, m!.id, "DONE")).toBeNull();
  });

  it("les emails/téléphones sont chiffrés en base et cherchables via index aveugle", async () => {
    const a = await createTestUser("A");
    await createClient(a.id, { fullName: "Ali Kaya", email: "Ali@Example.ch", phone: "+41 79 000 00 00", source: "MANUAL" });
    const raw = await prisma.client.findFirstOrThrow({ where: { userId: a.id } });
    expect(raw.emailEnc).not.toContain("ali");
    expect(raw.phoneEnc).not.toContain("79");
    expect((await listClients(a.id, { q: "ali@example.ch" })).total).toBe(1);
    expect((await listClients(a.id, { q: "079 000 00 00" })).total).toBe(1);
  });

  it("les tokens sociaux sont chiffrés et jamais exposés par la vue publique", async () => {
    const a = await createTestUser("A");
    await ensureSocialAccount(a.id, "INSTAGRAM", "nolhan");
    await storeSocialTokens(a.id, "INSTAGRAM", { accessToken: "IGQVJ-secret-token" });
    const raw = await prisma.socialAccount.findFirstOrThrow({ where: { userId: a.id } });
    expect(raw.accessTokenEnc).not.toContain("secret");
    const [view] = await getSocialAccounts(a.id);
    expect(view).not.toHaveProperty("accessTokenEnc");
    expect(view?.hasToken).toBe(true);
  });

  it("les snapshots sociaux s'accumulent sans écraser l'historique", async () => {
    const a = await createTestUser("A");
    await addSocialSnapshot(a.id, { platform: "INSTAGRAM", capturedAt: new Date("2026-09-01"), followers: 1000 });
    await addSocialSnapshot(a.id, { platform: "INSTAGRAM", capturedAt: new Date("2026-09-08"), followers: 1050 });
    expect(await prisma.socialMetric.count({ where: { userId: a.id } })).toBe(2);
  });
});
