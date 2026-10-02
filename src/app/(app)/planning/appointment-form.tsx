"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { CHANNEL_LABEL, options } from "@/lib/labels";
import { addAppointmentAction } from "./actions";

interface Props {
  services: { id: string; name: string; priceCents: number }[];
  clients: { id: string; name: string }[];
  defaultDate: string;
  defaultTime: string;
}

export function AppointmentForm({ services, clients, defaultDate, defaultTime }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(addAppointmentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const known = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const isNew = name.trim().length > 0 && !known;

  useEffect(() => {
    if (state.ok) {
      setName("");
      formRef.current?.querySelector<HTMLInputElement>("[name=clientName]")?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Date" name="p-date"><TextInput id="p-date" name="date" type="date" defaultValue={defaultDate} required /></Field>
      <Field label="Heure" name="p-time"><TextInput id="p-time" name="time" type="time" step={900} defaultValue={defaultTime} required /></Field>
      <Field label="Client" name="p-client" hint={known ? "Client existant" : isNew ? "Nouveau client : il sera créé" : "Laisse vide si inconnu"}>
        <TextInput id="p-client" name="clientName" list="planning-clients" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du client" autoComplete="off" />
        <datalist id="planning-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <input type="hidden" name="clientId" value={known?.id ?? ""} />
      </Field>
      <Field label="Prestation" name="p-service">
        <Select id="p-service" name="serviceId" options={services.map((s) => ({ value: s.id, label: `${s.name} — ${s.priceCents / 100} CHF` }))} />
      </Field>
      {isNew ? (
        <>
          <Field label="Téléphone (optionnel)" name="p-phone"><TextInput id="p-phone" name="clientPhone" type="tel" placeholder="079 123 45 67" /></Field>
          <Field label="Comment il t'a trouvé ?" name="p-channel"><Select id="p-channel" name="acquisitionChannel" defaultValue="UNKNOWN" options={options(CHANNEL_LABEL)} /></Field>
        </>
      ) : null}
      <Field label="Prix (vide = tarif)" name="p-price"><TextInput id="p-price" name="price" type="number" step="0.5" min={0} placeholder="CHF" /></Field>
      <Field label="Statut" name="p-status">
        <Select id="p-status" name="status" defaultValue="AUTO" options={[{ value: "AUTO", label: "Auto (passé = réalisé)" }, { value: "BOOKED", label: "Réservé" }, { value: "COMPLETED", label: "Réalisé" }, { value: "CANCELLED", label: "Annulé" }, { value: "NO_SHOW", label: "Absent" }]} />
      </Field>
      <Field label="Note (optionnel)" name="p-notes" className="sm:col-span-2"><TextInput id="p-notes" name="notes" maxLength={500} /></Field>
      <div className="flex items-end gap-3 sm:col-span-2">
        <SubmitButton pendingText="Ajout…">Ajouter au planning</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
