"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Field, TextInput } from "@/components/ui/field";
import { loginAction, registerAction, type AuthState } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState<AuthState, FormData>(loginAction, {});
  return (
    <form action={action} className="card space-y-4">
      <h1 className="font-display text-2xl">Connexion</h1>
      <Field label="Email" name="email">
        <TextInput name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" name="password">
        <TextInput name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Connexion…">Se connecter</SubmitButton>
      <p className="text-center text-sm text-mute">
        Pas de compte ? <Link className="text-gold" href="/register">Créer un compte</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<AuthState, FormData>(registerAction, {});
  return (
    <form action={action} className="card space-y-4">
      <h1 className="font-display text-2xl">Créer un compte</h1>
      <Field label="Nom" name="name" error={state.fieldErrors?.name}>
        <TextInput name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" name="email" error={state.fieldErrors?.email}>
        <TextInput name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" name="password" hint="10 caractères minimum" error={state.fieldErrors?.password}>
        <TextInput name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Création…">Créer mon compte</SubmitButton>
      <p className="text-center text-sm text-mute">
        Déjà inscrit ? <Link className="text-gold" href="/login">Se connecter</Link>
      </p>
    </form>
  );
}
