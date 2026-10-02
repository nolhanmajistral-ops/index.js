import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/http";
import { inspectFile, readUploadedFile, runPlanityImport } from "@/datahub/import";
import { parseMapping } from "@/datahub/import/upload";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Étape 1-2 : validation + parsing + détection des colonnes + aperçu (dry-run, aucune écriture). */
export async function POST(req: Request) {
  const guard = await requireApiUser("import");
  if ("response" in guard) return guard.response;
  try {
    const form = await req.formData();
    const file = await readUploadedFile(form);
    if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
    const info = await inspectFile(file.buffer, file.kind);
    const mapping = parseMapping(form.get("mapping"), info.headers.length) ?? info.detectedMapping;
    let preview = null;
    let previewError: string | null = null;
    try {
      preview = await runPlanityImport(guard.userId, { buffer: file.buffer, kind: file.kind, fileName: file.name, mimeType: file.type, mapping, dryRun: true });
    } catch (e) {
      previewError = (e as Error).message;
    }
    return NextResponse.json({ ...info, mapping, preview, previewError });
  } catch (e) {
    logger.warn("planity.inspect_failed", { error: e as Error });
    return NextResponse.json({ error: "Fichier illisible ou mapping invalide." }, { status: 400 });
  }
}
