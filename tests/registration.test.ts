import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createUserIfAllowed, isRegistrationAvailable } from "@/repositories/users";

beforeEach(resetDb);

const data = (n: number) => ({ email: `Owner${n}@Example.test`, name: `Owner ${n}`, passwordHash: "hash" });

describe("Inscriptions fermées (ALLOW_REGISTRATION=false)", () => {
  it("autorise le tout premier compte sur une base vide, puis plus aucun", async () => {
    expect(await isRegistrationAvailable(false)).toBe(true);
    const first = await createUserIfAllowed(data(1), false);
    expect(first?.email).toBe("owner1@example.test");
    expect(await isRegistrationAvailable(false)).toBe(false);
    expect(await createUserIfAllowed(data(2), false)).toBeNull();
    expect(await prisma.user.count()).toBe(1);
  });

  it("deux inscriptions simultanées sur une base vide ne créent qu'un seul compte", async () => {
    const results = await Promise.all([1, 2, 3, 4].map((n) => createUserIfAllowed(data(n), false)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("inscriptions ouvertes : plusieurs comptes possibles", async () => {
    await createUserIfAllowed(data(1), true);
    expect(await isRegistrationAvailable(true)).toBe(true);
    expect(await createUserIfAllowed(data(2), true)).not.toBeNull();
    expect(await prisma.user.count()).toBe(2);
  });
});
