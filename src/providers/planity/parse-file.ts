import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { CellValue, RawTable } from "./types";
import { recognizedColumns } from "./columns";

export type FileKind = "csv" | "xlsx";

const MAX_ROWS = 20_000;

function decodeText(buf: Buffer): string {
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1"); // export Windows-1252/Latin-1
  return text.replace(/^﻿/, "");
}

function cellToValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellToValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

function toTable(matrix: CellValue[][]): RawTable {
  // L'en-tête est la première ligne (parmi les 15 premières) contenant ≥ 2 colonnes reconnues.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const cells = (matrix[i] ?? []).map((c) => (c === null ? "" : String(c)));
    if (recognizedColumns(cells) >= 2) {
      headerIdx = i;
      break;
    }
  }
  const headers = (matrix[headerIdx] ?? []).map((c) => (c === null ? "" : String(c).trim()));
  const rows = matrix
    .slice(headerIdx + 1)
    .map((cells, i) => ({ rowNumber: headerIdx + 2 + i, cells }))
    .filter((r) => r.cells.some((c) => c !== null && String(c).trim() !== ""));
  if (rows.length > MAX_ROWS) throw new Error(`Fichier trop volumineux : ${rows.length} lignes (max ${MAX_ROWS}).`);
  return { headers, headerRowNumber: headerIdx + 1, rows };
}

export function parseCsv(buf: Buffer): RawTable {
  const text = decodeText(buf);
  const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const matrix: CellValue[][] = res.data.map((row) => row.map((c) => (c === undefined || c === "" ? null : c)));
  return toTable(matrix);
}

export async function parseXlsx(buf: Buffer): Promise<RawTable> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Classeur vide");
  const matrix: CellValue[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = row.values as ExcelJS.CellValue[]; // index 1-based
    const cells: CellValue[] = [];
    for (let c = 1; c < values.length; c++) cells.push(cellToValue(values[c] ?? null));
    matrix[rowNumber - 1] = cells;
  });
  for (let i = 0; i < matrix.length; i++) if (!matrix[i]) matrix[i] = [];
  return toTable(matrix);
}

export async function parseFile(buf: Buffer, kind: FileKind): Promise<RawTable> {
  return kind === "csv" ? parseCsv(buf) : parseXlsx(buf);
}
