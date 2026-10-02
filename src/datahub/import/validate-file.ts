import type { FileKind } from "@/providers/planity";

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}

const CSV_MIMES = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "text/x-csv", ""]);
const XLSX_MIMES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/zip", ""]);

export type FileValidation = { ok: true; kind: FileKind } | { ok: false; error: string };

/** Upload sécurisé : extension, type MIME déclaré, signature binaire (magic bytes) et taille. */
export function validateUpload(file: UploadedFile, maxMb: number): FileValidation {
  if (file.size === 0 || file.buffer.length === 0) return { ok: false, error: "Fichier vide." };
  if (file.size > maxMb * 1024 * 1024 || file.buffer.length > maxMb * 1024 * 1024) return { ok: false, error: `Fichier trop volumineux (max ${maxMb} Mo).` };
  const ext = file.name.toLowerCase().split(".").pop();
  const isZip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (ext === "xlsx") {
    if (!XLSX_MIMES.has(file.type)) return { ok: false, error: `Type MIME non autorisé pour .xlsx : ${file.type}` };
    if (!isZip) return { ok: false, error: "Le fichier .xlsx n'est pas un classeur Excel valide." };
    return { ok: true, kind: "xlsx" };
  }
  if (ext === "csv") {
    if (!CSV_MIMES.has(file.type)) return { ok: false, error: `Type MIME non autorisé pour .csv : ${file.type}` };
    if (isZip || file.buffer.subarray(0, 4096).includes(0)) return { ok: false, error: "Le fichier .csv contient des données binaires." };
    return { ok: true, kind: "csv" };
  }
  return { ok: false, error: "Formats acceptés : .csv et .xlsx" };
}
