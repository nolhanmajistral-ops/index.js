"use client";

import { useActionState } from "react";
import { Field, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { onboardingAction, type OnboardingState } from "./actions";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold/50 text-xs text-gold">{n}</span>
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState<OnboardingState, FormData>(onboardingAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Step n={1} title="Toi">
        <Field label="Nom" name="displayName" error={e.displayName}><TextInput name="displayName" defaultValue={defaultName} required /></Field>
        <Field label="Activité" name="activity" error={e.activity}><TextInput name="activity" defaultValue="Barber" required /></Field>
        <Field label="Ville" name="city" error={e.city}><TextInput name="city" defaultValue="Lausanne" required /></Field>
      </Step>
      <Step n={2} title="Tarifs (CHF)">
        <Field label="Coupe" name="priceCoupe" error={e.priceCoupe}><TextInput name="priceCoupe" type="number" min={0} step="0.5" defaultValue={40} required /></Field>
        <Field label="Coupe + barbe" name="priceCoupeBarbe" error={e.priceCoupeBarbe}><TextInput name="priceCoupeBarbe" type="number" min={0} step="0.5" defaultValue={55} required /></Field>
        <Field label="Transformation" name="priceTransformation" error={e.priceTransformation}><TextInput name="priceTransformation" type="number" min={0} step="0.5" defaultValue={55} required /></Field>
        <Field label="Transformation + barbe" name="priceTransformationBarbe" error={e.priceTransformationBarbe}><TextInput name="priceTransformationBarbe" type="number" min={0} step="0.5" defaultValue={65} required /></Field>
      </Step>
      <Step n={3} title="Objectifs">
        <Field label="CA / mois (CHF)" name="goalRevenueMonth"><TextInput name="goalRevenueMonth" type="number" min={0} placeholder="ex. 3000" /></Field>
        <Field label="Clients / semaine" name="goalClientsWeek"><TextInput name="goalClientsWeek" type="number" min={0} placeholder="ex. 14" /></Field>
        <Field label="Followers Instagram" name="goalInstagramFollowers"><TextInput name="goalInstagramFollowers" type="number" min={0} placeholder="ex. 5000" /></Field>
        <Field label="Vidéos / semaine" name="goalVideosWeek"><TextInput name="goalVideosWeek" type="number" min={0} placeholder="ex. 4" /></Field>
      </Step>
      <Step n={4} title="Réseaux & Planity">
        <Field label="Instagram (@)" name="instagramHandle" hint="Aucun mot de passe demandé. Connexion officielle plus tard."><TextInput name="instagramHandle" placeholder="nolhan.barber" /></Field>
        <Field label="TikTok (@)" name="tiktokHandle"><TextInput name="tiktokHandle" placeholder="nolhan.barber" /></Field>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="usesPlanity" className="h-4 w-4 accent-[#c8a96a]" defaultChecked /> J&apos;utilise Planity (import CSV/XLSX)
        </label>
      </Step>
      <Step n={5} title="Situation actuelle (estimations)">
        <Field label="Clients actuels (approx.)" name="approxActiveClients"><TextInput name="approxActiveClients" type="number" min={0} /></Field>
        <Field label="CA mensuel approximatif (CHF)" name="approxMonthlyRevenue" hint="Déclaratif — jamais affiché comme CA réel."><TextInput name="approxMonthlyRevenue" type="number" min={0} /></Field>
        <Field label="Heures dispo / semaine" name="weeklyHoursAvailable"><TextInput name="weeklyHoursAvailable" type="number" min={0} /></Field>
        <Field label="Dont heures contenu / semaine" name="contentHoursPerWeek"><TextInput name="contentHoursPerWeek" type="number" min={0} /></Field>
      </Step>
      <div className="card space-y-3">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="loadDemo" className="mt-0.5 h-4 w-4 accent-[#c8a96a]" />
          <span>
            Charger des <strong>données de démonstration</strong> (8 semaines, toutes marquées <span className="text-warn">DEMO</span>). Supprimables à tout moment via « Reset demo data ». Tes données réelles ne sont jamais touchées.
          </span>
        </label>
        <FormMessage state={state.message ? { ok: false, message: state.message } : null} />
        <SubmitButton className="w-full" pendingText="Génération…">Générer mon dashboard</SubmitButton>
      </div>
    </form>
  );
}
