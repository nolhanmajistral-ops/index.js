import { z } from "zod";
import { getEnv } from "@/lib/env";
import { PLANITY_FIELDS, type ColumnMapping } from "@/providers/planity";
import { validateUpload } from "./validate-file";

/** Lecture + validation d'un fichier multipart (taille, MIME, signature) avant tout parsing. */
export async function readUploadedFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Fichier manquant." } as const;
  const maxMb = getEnv().IMPORT_MAX_FILE_MB;
  if (file.size > maxMb * 1024 * 1024) return { error: `Fichier trop volumineux (max ${maxMb} Mo).` } as const;
  const buffer = Buffer.from(await file.arrayBuffer());
  const v = validateUpload({ name: file.name, type: file.type, size: file.size, buffer }, maxMb);
  if (!v.ok) return { error: v.error } as const;
  return { buffer, kind: v.kind, name: file.name.slice(0, 200), type: file.type || "application/octet-stream" } as const;
}

export function parseMapping(raw: FormDataEntryValue | null, headerCount: number): ColumnMapping | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const shape = Object.fromEntries(PLANITY_FIELDS.map((f) => [f, z.number().int().min(0).max(headerCount - 1).nullable().optional()]));
  return z.object(shape).strict().parse(JSON.parse(raw)) as ColumnMapping;
}
