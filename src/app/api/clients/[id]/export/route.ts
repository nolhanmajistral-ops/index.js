import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/http";
import { exportClient } from "@/datahub/export/service";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser("export");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const data = await exportClient(guard.userId, id.slice(0, 40));
  if (!data) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="client-${id}.json"`, "Cache-Control": "no-store" } });
}
