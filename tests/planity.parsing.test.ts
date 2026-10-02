import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planityProvider, detectMapping } from "@/providers/planity";
import { parseDateParts, parseStatus } from "@/providers/planity/records";
import { validateUpload } from "@/datahub/import";
import { parseMoneyToCents } from "@/lib/money";
import { normalizePhone, normalizePersonName, normalizeEmail } from "@/datahub/normalization";

const samples = path.join(process.cwd(), "docs", "samples");
const NOW = new Date("2026-10-02T12:00:00Z");

describe("Planity — parsing & mapping", () => {
  it("détecte la ligne d'en-tête sous le bandeau et mappe les colonnes FR", async () => {
    const table = await planityProvider.readExport(fs.readFileSync(path.join(samples, "planity-sample.csv")), "csv");
    expect(table.headerRowNumber).toBe(2);
    expect(table.rows).toHaveLength(24);
    const m = planityProvider.detectMapping(table);
    expect(m).toMatchObject({ externalId: 0, date: 1, time: 2, firstName: 3, lastName: 4, email: 5, phone: 6, service: 7, price: 8, status: 9, howFound: 10, notes: 11 });
  });

  it("mappe les colonnes EN du fichier XLSX (Customer = nom complet)", async () => {
    const table = await planityProvider.readExport(fs.readFileSync(path.join(samples, "planity-sample.xlsx")), "xlsx");
    expect(table.rows).toHaveLength(24);
    const m = planityProvider.detectMapping(table);
    expect(m).toMatchObject({ externalId: 0, date: 1, time: 2, clientName: 3, email: 4, phone: 5, service: 6, price: 7, status: 8, howFound: 9, notes: 10 });
  });

  it("'Nom' seul = nom complet ; avec 'Prénom' = nom de famille", () => {
    expect(detectMapping(["Nom", "Date", "Prestation"]).clientName).toBe(0);
    const m = detectMapping(["Prénom", "Nom", "Date", "Service"]);
    expect(m.firstName).toBe(0);
    expect(m.lastName).toBe(1);
    expect(m.clientName).toBeUndefined();
  });

  it("extrait les enregistrements et signale les lignes erronées", async () => {
    for (const [file, kind] of [["planity-sample.csv", "csv"], ["planity-sample.xlsx", "xlsx"]] as const) {
      const table = await planityProvider.readExport(fs.readFileSync(path.join(samples, file)), kind);
      const { records, errors } = planityProvider.getAppointments(table, planityProvider.detectMapping(table), NOW);
      expect(errors.map((e) => e.error).sort()).toEqual(
        ["Date invalide ou manquante", "Nom du client manquant", 'Prix invalide : "quarante"', expect.stringMatching(/^Statut inconnu/)].sort(),
      );
      expect(records).toHaveLength(20);
      const first = records[0]!;
      expect(first.clientName).toBe("Luca Bianchi");
      expect(first.priceCents).toBe(4000);
      expect(first.status).toBe("COMPLETED");
      // 01/09/2026 09:00 heure de Lausanne = 07:00 UTC (CEST)
      expect(first.startsAt.toISOString()).toBe("2026-09-01T07:00:00.000Z");
      expect(records.find((r) => r.externalId === "PL-1010")?.priceCents).toBeNull();
      expect(records.find((r) => r.externalId === "PL-1023")?.status).toBe("BOOKED");
    }
  });

  it("formats de date, statuts, montants", () => {
    expect(parseDateParts("2026-09-01 14:30")).toMatchObject({ y: 2026, m: 9, d: 1, h: 14, min: 30 });
    expect(parseDateParts("1.9.26")).toMatchObject({ y: 2026, m: 9, d: 1 });
    expect(parseStatus("Annulé")).toBe("CANCELLED");
    expect(parseStatus("No show")).toBe("NO_SHOW");
    expect(parseStatus("Completed")).toBe("COMPLETED");
    expect(parseMoneyToCents("CHF 55.-")).toBe(5500);
    expect(parseMoneyToCents("55,50")).toBe(5550);
    expect(parseMoneyToCents("1'250.00")).toBe(125000);
    expect(parseMoneyToCents("abc")).toBeNull();
  });

  it("normalisation contacts", () => {
    expect(normalizePhone("079 123 45 67")).toBe("+41791234567");
    expect(normalizePhone("0041 79 123 45 67")).toBe("+41791234567");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizeEmail(" Jean@Example.COM ")).toBe("jean@example.com");
    expect(normalizeEmail("pas-un-email")).toBeNull();
    expect(normalizePersonName("Dupont  Jéan")).toBe(normalizePersonName("jean DUPONT"));
  });
});

describe("Upload sécurisé", () => {
  const csv = Buffer.from("Date;Client;Prestation\n01/09/2026;A;Coupe\n");
  it("accepte CSV et XLSX valides", () => {
    expect(validateUpload({ name: "a.csv", type: "text/csv", size: csv.length, buffer: csv }, 5)).toEqual({ ok: true, kind: "csv" });
    const xlsx = fs.readFileSync(path.join(samples, "planity-sample.xlsx"));
    expect(validateUpload({ name: "a.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: xlsx.length, buffer: xlsx }, 5)).toEqual({ ok: true, kind: "xlsx" });
  });
  it("refuse extension, MIME, signature et taille invalides", () => {
    expect(validateUpload({ name: "a.exe", type: "application/x-msdownload", size: 3, buffer: Buffer.from("MZ!") }, 5).ok).toBe(false);
    expect(validateUpload({ name: "a.csv", type: "image/png", size: csv.length, buffer: csv }, 5).ok).toBe(false);
    expect(validateUpload({ name: "fake.xlsx", type: "application/octet-stream", size: csv.length, buffer: csv }, 5).ok).toBe(false);
    const big = Buffer.alloc(2 * 1024 * 1024, 65);
    expect(validateUpload({ name: "a.csv", type: "text/csv", size: big.length, buffer: big }, 1).ok).toBe(false);
    const bin = Buffer.from([0x41, 0x00, 0x42]);
    expect(validateUpload({ name: "a.csv", type: "text/csv", size: 3, buffer: bin }, 5).ok).toBe(false);
  });
});
