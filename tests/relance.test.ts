import { describe, expect, it } from "vitest";
import { relanceMessage, toWhatsAppNumber, whatsAppLink } from "@/domain/clients/relance";

describe("Relances WhatsApp", () => {
  it("normalise les numéros suisses et internationaux pour wa.me", () => {
    expect(toWhatsAppNumber("079 123 45 67")).toBe("41791234567");
    expect(toWhatsAppNumber("+41 79 123 45 67")).toBe("41791234567");
    expect(toWhatsAppNumber("0041791234567")).toBe("41791234567");
    expect(toWhatsAppNumber("+33 6 12 34 56 78")).toBe("33612345678");
    expect(toWhatsAppNumber("12345")).toBeNull();
    expect(toWhatsAppNumber(null)).toBeNull();
  });
  it("message personnalisé avec le prénom et le nombre de semaines, lien encodé", () => {
    const msg = relanceMessage({ id: "abc", displayName: "karim benali", firstName: null }, 36);
    expect(msg).toMatch(/Karim/);
    const link = whatsAppLink("079 123 45 67", msg)!;
    expect(link.startsWith("https://wa.me/41791234567?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1]!)).toBe(msg);
    expect(whatsAppLink("", msg)).toBeNull();
  });
  it("varie le message d'un client à l'autre", () => {
    const msgs = new Set(["a1", "b2", "c3", "d4", "e5", "f6"].map((id) => relanceMessage({ id, displayName: "Luca", firstName: "Luca" }, 40)));
    expect(msgs.size).toBeGreaterThan(1);
  });
});
