import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/http";
import { EXPORT_ENTITIES, exportAll, exportRows, type ExportEntity } from "@/datahub/export/service";
import { toCsv } from "@/datahub/export/csv";
import { audit } from "@/repositories/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireApiUser("export");
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const stamp = new Date().toISOString().slice(0, 10);
  if (entity === "all") {
    return new NextResponse(JSON.stringify(await exportAll(guard.userId), null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="nolhan-os-export-${stamp}.json"`, "Cache-Control": "no-store" } });
  }
  if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) return NextResponse.json({ error: "Entité inconnue" }, { status: 400 });
  const rows = await exportRows(guard.userId, entity as ExportEntity);
  await audit(guard.userId, "data.exported", { metadata: { entity, format, rows: rows.length } });
  const body = format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2);
  return new NextResponse(body, {
    headers: { "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="nolhan-os-${entity}-${stamp}.${format}"`, "Cache-Control": "no-store" },
  });
}
