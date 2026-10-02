import { describe, expect, it } from "vitest";
import { blindIndex, decrypt, encrypt } from "@/lib/crypto";
import { redact } from "@/lib/logger";

describe("crypto", () => {
  it("chiffre/déchiffre et produit un IV différent à chaque fois", () => {
    const a = encrypt("token-secret");
    const b = encrypt("token-secret");
    expect(a).not.toBe(b);
    expect(a).not.toContain("token-secret");
    expect(decrypt(a)).toBe("token-secret");
  });
  it("détecte une altération du texte chiffré", () => {
    const parts = encrypt("x").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
  it("index aveugle déterministe et scopé par utilisateur", () => {
    expect(blindIndex("u1", "a@b.ch")).toBe(blindIndex("u1", "a@b.ch"));
    expect(blindIndex("u1", "a@b.ch")).not.toBe(blindIndex("u2", "a@b.ch"));
  });
  it("le logger masque les données sensibles", () => {
    const out = redact({ password: "x", accessToken: "y", email: "a@b.ch", nested: { phone: "079" }, rows: 3 }) as Record<string, unknown>;
    expect(out).toEqual({ password: "[REDACTED]", accessToken: "[REDACTED]", email: "[REDACTED]", nested: { phone: "[REDACTED]" }, rows: 3 });
  });
});
