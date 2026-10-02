/**
 * Génère docs/samples/planity-sample.csv et .xlsx.
 * DONNÉES FICTIVES — TEST UNIQUEMENT. Noms, emails (@example.com) et numéros (079 000 …) inventés.
 * Contient volontairement : doublons, lignes erronées, clients récurrents, statuts et prix variés.
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const BANNER = "DONNÉES FICTIVES — TEST UNIQUEMENT";

// [id, date, heure, prénom, nom, email, téléphone, prestation, prix, statut, source, notes]
type Row = [string, string, string, string, string, string, string, string, string, string, string, string];
const rows: Row[] = [
  ["PL-1001", "01/09/2026", "09:00", "Luca", "Bianchi", "luca.bianchi@example.com", "079 000 10 01", "Coupe", "40", "Honoré", "Instagram", ""],
  ["PL-1002", "01/09/2026", "10:00", "Karim", "Benali", "", "079 000 10 02", "Coupe + barbe", "55", "Honoré", "TikTok", ""],
  ["PL-1003", "02/09/2026", "14:30", "Jean", "Dupont", "jean.dupont@example.com", "", "Transformation", "55", "Honoré", "Bouche-à-oreille", "Premier passage"],
  ["PL-1004", "03/09/2026", "11:00", "Marco", "Rossi", "", "", "Transformation + barbe", "65", "Honoré", "", ""],
  ["PL-1005", "04/09/2026", "16:00", "Yanis", "Morel", "yanis.morel@example.com", "079 000 10 05", "Coupe", "40", "Annulé", "Google", ""],
  ["PL-1006", "05/09/2026", "09:30", "Luca", "Bianchi", "luca.bianchi@example.com", "079 000 10 01", "Coupe + barbe", "55", "Honoré", "Instagram", "Client récurrent"],
  ["PL-1007", "08/09/2026", "10:30", "Samir", "Haddad", "", "079 000 10 07", "Coupe", "40", "Absent", "", ""],
  ["PL-1008", "08/09/2026", "13:00", "Jean", "Dupond", "", "", "Coupe", "40", "Honoré", "", "Orthographe proche de Jean Dupont"],
  ["PL-1009", "09/09/2026", "15:00", "Karim", "Benali", "", "079 000 10 02", "Coupe", "40", "Honoré", "TikTok", ""],
  ["PL-1010", "10/09/2026", "17:00", "Noah", "Favre", "noah.favre@example.com", "", "Transformation", "", "Honoré", "Insta", "Prix manquant → prix catalogue (estimé)"],
  ["PL-1011", "11/09/2026", "09:00", "Elias", "Meier", "", "079 000 10 11", "Coupe + barbe", "55.00", "Terminé", "Passage", ""],
  ["PL-1012", "12/09/2026", "11:30", "Marco", "Rossi", "", "", "Coupe", "40", "Honoré", "", "Récurrent sans contact"],
  ["PL-1012", "12/09/2026", "11:30", "Marco", "Rossi", "", "", "Coupe", "40", "Honoré", "", "DOUBLON volontaire (même ID)"],
  ["PL-1013", "32/09/2026", "10:00", "Erreur", "Date", "", "", "Coupe", "40", "Honoré", "", "ERREUR volontaire : date invalide"],
  ["PL-1014", "15/09/2026", "10:00", "", "", "", "", "Coupe", "40", "Honoré", "", "ERREUR volontaire : client manquant"],
  ["PL-1015", "16/09/2026", "12:00", "Hugo", "Blanc", "", "", "Coupe", "quarante", "Honoré", "", "ERREUR volontaire : prix invalide"],
  ["PL-1016", "17/09/2026", "14:00", "Tom", "Girard", "", "", "Coupe", "40", "Peut-être", "", "ERREUR volontaire : statut inconnu"],
  ["PL-1017", "18/09/2026", "09:00", "Luca", "Bianchi", "luca.bianchi@example.com", "079 000 10 01", "Coupe", "40", "Honoré", "Instagram", ""],
  ["PL-1018", "19/09/2026", "10:00", "Adam", "Keller", "adam.keller@example.com", "079 000 10 18", "Transformation + barbe", "65", "Honoré", "Instagram", ""],
  ["PL-1019", "22/09/2026", "16:30", "Karim", "Benali", "", "079 000 10 02", "Coupe + barbe", "55", "Honoré", "TikTok", ""],
  ["PL-1020", "24/09/2026", "11:00", "Noah", "Favre", "noah.favre@example.com", "", "Coupe", "40", "Honoré", "", ""],
  ["PL-1021", "26/09/2026", "13:30", "Elias", "Meier", "", "079 000 10 11", "Coupe", "40", "Honoré", "", ""],
  ["PL-1022", "29/09/2026", "15:00", "Adam", "Keller", "adam.keller@example.com", "079 000 10 18", "Coupe + barbe", "55", "Honoré", "", ""],
  ["PL-1023", "15/10/2026", "10:00", "Luca", "Bianchi", "luca.bianchi@example.com", "079 000 10 01", "Coupe", "40", "Confirmé", "", "RDV futur : non compté dans le CA"],
];

const CSV_HEADERS = ["ID RDV", "Date RDV", "Heure", "Prénom", "Nom", "E-mail", "Téléphone", "Prestation", "Prix", "Statut", "Comment nous as-tu trouvé ?", "Notes"];
const XLSX_HEADERS = ["Booking ID", "Appointment date", "Time", "Customer", "Email", "Phone", "Service", "Price", "Status", "Source", "Comment"];
const EN_STATUS: Record<string, string> = { "Honoré": "Completed", "Annulé": "Cancelled", Absent: "No show", "Terminé": "Done", "Confirmé": "Confirmed", "Peut-être": "Maybe" };

function csvCell(v: string) {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const dir = path.join(process.cwd(), "docs", "samples");
  fs.mkdirSync(dir, { recursive: true });
  const csv = [BANNER, CSV_HEADERS.join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "planity-sample.csv"), "﻿" + csv, "utf8");

  const wb = new ExcelJS.Workbook();
  wb.creator = "NOLHAN OS — données fictives";
  const ws = wb.addWorksheet("Export");
  ws.addRow([BANNER]);
  ws.addRow(XLSX_HEADERS);
  for (const r of rows) {
    const [id, date, time, first, last, email, phone, service, price, status, source, notes] = r;
    const [d, m, y] = date.split("/").map(Number) as [number, number, number];
    const [hh, mm] = time.split(":").map(Number) as [number, number];
    const validDate = d <= 31 && !Number.isNaN(d);
    const dateCell = validDate ? new Date(Date.UTC(y, m - 1, d, hh, mm)) : date;
    const priceCell = price === "" ? null : Number.isNaN(Number(price)) ? price : Number(price);
    ws.addRow([id, dateCell, time, [first, last].filter(Boolean).join(" "), email, phone, service, priceCell, EN_STATUS[status] ?? status, source, notes]);
  }
  ws.getColumn(2).numFmt = "dd/mm/yyyy";
  await wb.xlsx.writeFile(path.join(dir, "planity-sample.xlsx"));
  console.log(`Échantillons générés dans ${dir} (${rows.length} lignes).`);
}

main();
