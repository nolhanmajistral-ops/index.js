import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./index";
import { findUserById } from "@/repositories/users";

/**
 * Autorisation côté serveur : chaque page/action protégée appelle requireUser().
 * L'identifiant utilisateur provient UNIQUEMENT de la session signée, jamais du client.
 */
export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await findUserById(id);
  if (!user) redirect("/login");
  return user;
}

export async function requireOnboardedUser() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/onboarding");
  return user;
}

/** Variante pour route handlers : renvoie null au lieu de rediriger. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await findUserById(id);
  return user?.id ?? null;
}
