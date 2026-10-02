import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://x",
  AUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("env validation", () => {
  it("accepte une configuration minimale valide", () => {
    const env = envSchema.parse(base);
    expect(env.AI_PROVIDER).toBe("none");
    expect(env.ALLOW_REGISTRATION).toBe(true);
    expect(env.IMPORT_MAX_FILE_MB).toBe(5);
  });
  it("refuse une clé de chiffrement de mauvaise taille", () => {
    expect(envSchema.safeParse({ ...base, ENCRYPTION_KEY: "abc" }).success).toBe(false);
  });
  it("refuse un AUTH_SECRET trop court", () => {
    expect(envSchema.safeParse({ ...base, AUTH_SECRET: "short" }).success).toBe(false);
  });
  it("traite les chaînes vides comme absentes", () => {
    const env = envSchema.parse({ ...base, ANTHROPIC_API_KEY: "", AI_PROVIDER: "" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_PROVIDER).toBe("none");
  });
});

import { onboardingSchema } from "@/lib/validation/schemas";
describe("onboarding schema", () => {
  it("accepte les champs optionnels vides", () => {
    const r = onboardingSchema.safeParse({ displayName: "N", activity: "Barber", city: "Lausanne", priceCoupe: "40", priceCoupeBarbe: "55", priceTransformation: "55", priceTransformationBarbe: "65", goalRevenueMonth: "", approxMonthlyRevenue: "", goalClientsWeek: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.goalRevenueMonth).toBeUndefined();
  });
});
