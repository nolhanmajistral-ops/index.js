import { z } from "zod";
import { NextResponse } from "next/server";
import { runStudio } from "@/ai/studio/studio";
import { getStudioMode, type StudioModeId } from "@/ai/studio/modes";
import { requireApiUser } from "@/lib/http";
import { ndjsonResponse, rejectCrossSiteJson } from "@/lib/ndjson";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ mode: z.string().max(20), inputs: z.record(z.string(), z.string().max(20000)).default({}) });

/** Valide les champs selon la définition du mode (longueur, obligatoires, valeurs de liste). */
function validateInputs(modeId: string, raw: Record<string, string>): { mode: StudioModeId; inputs: Record<string, string> } | { error: string } {
  const mode = getStudioMode(modeId);
  if (!mode) return { error: "Mode inconnu." };
  const inputs: Record<string, string> = {};
  for (const f of mode.fields) {
    const v = (raw[f.name] ?? "").trim();
    if (f.required && v.length < 2) return { error: `« ${f.label} » est obligatoire.` };
    if (v.length > f.max) return { error: `« ${f.label} » est trop long (${f.max} caractères max).` };
    if (f.kind === "select" && v && !f.options?.some((o) => o.value === v)) return { error: `Valeur invalide pour « ${f.label} ».` };
    if (v) inputs[f.name] = v;
  }
  return { mode: mode.id, inputs };
}

/** Studio contenu en flux : événements status / text / done / error (NDJSON). */
export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req);
  if (rejected) return rejected;
  const auth = await requireApiUser("ai");
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const valid = validateInputs(parsed.data.mode, parsed.data.inputs);
  if ("error" in valid) return NextResponse.json({ error: valid.error }, { status: 400 });
  return ndjsonResponse(async (send) => {
    const result = await runStudio(auth.userId, valid.mode, valid.inputs, {
      onText: (delta) => send({ type: "text", delta }),
      onStatus: (status) => send({ type: "status", status }),
    });
    send({ type: "done", result });
  }, "ai.studio.stream_failed");
}
