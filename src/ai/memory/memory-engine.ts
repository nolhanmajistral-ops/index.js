import type { MemoryKind } from "@prisma/client";
import { addMemory, listMemories, upsertMemoryByKey } from "@/repositories/ai";

/** MemoryEngine : objectifs, préférences, formats préférés/évités, expériences, décisions, résultats. */
export const MemoryEngine = {
  recall(userId: string, kinds?: MemoryKind[]) {
    return listMemories(userId, kinds);
  },
  remember(userId: string, kind: MemoryKind, content: string, opts: { key?: string; weight?: number; sourceRef?: string } = {}) {
    if (opts.key) return upsertMemoryByKey(userId, opts.key, { kind, content, weight: opts.weight, sourceRef: opts.sourceRef });
    return addMemory(userId, { kind, content, weight: opts.weight, sourceRef: opts.sourceRef });
  },
  async summaryForContext(userId: string) {
    const rows = await listMemories(userId, undefined, 30);
    return rows.map((m) => ({ kind: m.kind, content: m.content }));
  },
};
