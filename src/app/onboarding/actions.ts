"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formDataToObject, onboardingSchema } from "@/lib/validation/schemas";
import { completeOnboarding } from "@/domain/onboarding/service";
import { loadDemoData } from "@/datahub/demo";

export interface OnboardingState {
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function onboardingAction(_prev: OnboardingState, fd: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) {
    return { message: "Vérifie les champs en rouge.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const { loadDemo, ...input } = parsed.data;
  await completeOnboarding(user.id, input);
  if (loadDemo) await loadDemoData(user.id);
  redirect("/dashboard");
}
