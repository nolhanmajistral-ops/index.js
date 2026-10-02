import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/components/layout/app-shell";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Bienvenue" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 font-display text-4xl">Bienvenue, {user.name.split(" ")[0]}.</h1>
      <p className="mt-2 text-mute">Quelques informations pour construire ton système de pilotage. Tout est modifiable ensuite.</p>
      <div className="mt-8">
        <OnboardingForm defaultName={user.name} />
      </div>
    </div>
  );
}
