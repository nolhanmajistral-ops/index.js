"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { CHANNEL_LABEL, options } from "@/lib/labels";
import { Select, TextInput } from "@/components/ui/field";
import { createLeadAction } from "./actions";

export function LeadForm({ contents }: { contents: { id: string; title: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createLeadAction, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
      <TextInput name="name" placeholder="Nom / pseudo" aria-label="Nom du prospect" />
      <Select name="channel" aria-label="Canal" defaultValue="INSTAGRAM" options={options(CHANNEL_LABEL)} />
      <Select name="contentId" aria-label="Contenu" options={[{ value: "", label: "Contenu d'origine —" }, ...contents.map((c) => ({ value: c.id, label: c.title }))]} />
      <SubmitButton variant="ghost" pendingText="…">Ajouter</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}
