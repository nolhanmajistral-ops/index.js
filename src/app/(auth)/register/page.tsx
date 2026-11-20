import Link from "next/link";
import { getEnv } from "@/lib/env";
import { isRegistrationAvailable } from "@/repositories/users";
import { RegisterForm } from "../auth-forms";

export const metadata = { title: "Inscription" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!(await isRegistrationAvailable(getEnv().ALLOW_REGISTRATION))) {
    return (
      <div className="card space-y-4">
        <h1 className="font-display text-2xl">Inscriptions fermées</h1>
        <p className="text-sm text-mute">Ce NOLHAN OS a déjà son propriétaire. Connecte-toi avec ton compte.</p>
        <Link className="btn-primary w-full" href="/login">Se connecter</Link>
      </div>
    );
  }
  return <RegisterForm />;
}
