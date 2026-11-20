import { z } from "zod";
import { NextResponse } from "next/server";
import { askCoach } from "@/ai/coach/coach";
import { requireApiUser } from "@/lib/http";
import { ndjsonResponse, rejectCrossSiteJson } from "@/lib/ndjson";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  question: z.string().trim().min(2).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).max(16).default([]),
});

/** Coach IA en flux : événements status / text / done / error (NDJSON). */
export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req);
  if (rejected) return rejected;
  const auth = await requireApiUser("ai");
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Question invalide." }, { status: 400 });
  const { question, history } = parsed.data;
  return ndjsonResponse(async (send) => {
    const reply = await askCoach(auth.userId, question, history, new Date(), {
      onText: (delta) => send({ type: "text", delta }),
      onStatus: (status) => send({ type: "status", status }),
    });
    send({ type: "done", reply });
  }, "ai.coach.stream_failed");
}
