import { requireOnboardedUser } from "@/lib/auth/session";
import { aiStatus } from "@/ai/providers";
import { getStudioMode, type StudioModeId } from "@/ai/studio/modes";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudioClient } from "./studio-client";

export const metadata = { title: "Studio contenu" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  await requireOnboardedUser();
  const m = (await searchParams).mode;
  const initialMode = typeof m === "string" && getStudioMode(m) ? (m as StudioModeId) : undefined;
  const status = aiStatus();
  return (
    <div>
      <PageHeader
        title="Studio contenu"
        subtitle="Scripts, légendes, stories, plan de la semaine, messages : écrits avec ta voix et tes chiffres, prêts à poster."
        action={<Badge tone={status.configured ? "ok" : "warn"}>{status.configured ? "IA connectée" : "Mode sans IA (trames à compléter)"}</Badge>}
      />
      <StudioClient llm={status.configured} initialMode={initialMode} />
    </div>
  );
}
