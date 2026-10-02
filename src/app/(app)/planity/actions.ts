"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/lib/actions";
import { rollbackImport } from "@/datahub/import";

export async function rollbackAction(batchId: string) {
  const res = await guarded("import.rollback", async (userId) => {
    const r = await rollbackImport(userId, z.string().min(1).max(40).parse(batchId));
    return { ok: true, message: `Import annulé : ${r.deleted} élément(s) supprimé(s), ${r.restored} restauré(s).` };
  });
  revalidatePath("/planity");
  revalidatePath("/dashboard");
  return res;
}
