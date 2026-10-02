import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiUser } from "@/lib/http";
import { inspectFile, readUploadedFile, runPlanityImport } from "@/datahub/import";
import { parseMapping } from "@/datahub/import/upload";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Import réel (transactionnel) avec le mapping validé par l'utilisateur. */
export async function POST(req: Request) {
  const guard = await requireApiUser("import");
  if ("response" in guard) return guard.response;
  try {
    const form = await req.formData();
    const file = await readUploadedFile(form);
    if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
    const info = await inspectFile(file.buffer, file.kind);
    const mapping = parseMapping(form.get("mapping"), info.headers.length) ?? info.detectedMapping;
    const report = await runPlanityImport(guard.userId, { buffer: file.buffer, kind: file.kind, fileName: file.name, mimeType: file.type, mapping, dryRun: false });
    revalidatePath("/planity");
    revalidatePath("/dashboard");
    return NextResponse.json({ report });
  } catch (e) {
    logger.warn("planity.import_failed", { error: e as Error });
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg.startsWith("Colonnes obligatoires") ? msg : "Import impossible : fichier ou mapping invalide." }, { status: 400 });
  }
}
