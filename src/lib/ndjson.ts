import "server-only";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Requête POST JSON venant du site lui-même (défense CSRF en plus du cookie SameSite=Lax) :
 * Content-Type JSON obligatoire et, si le navigateur envoie Origin, même hôte que la requête.
 */
export function rejectCrossSiteJson(req: Request): NextResponse | null {
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON attendu" }, { status: 415 });
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
  }
  return null;
}

/**
 * Réponse en flux NDJSON (une ligne JSON par événement) : texte au fil de l'eau, étapes, résultat final.
 * Une erreur inattendue devient un événement { type: "error" } sans détail technique.
 */
export function ndjsonResponse(run: (send: (event: Record<string, unknown>) => void) => Promise<void>, logEvent: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await run(send);
      } catch (e) {
        logger.error(logEvent, { error: e as Error });
        send({ type: "error", message: "Une erreur est survenue. Réessaie dans un instant." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
