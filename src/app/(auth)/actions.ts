"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { formDataToObject, loginSchema, registerSchema } from "@/lib/validation/schemas";
import { createUser, findUserByEmail } from "@/repositories/users";
import { audit } from "@/repositories/audit";

export interface AuthState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function registerAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  if (!getEnv().ALLOW_REGISTRATION) return { message: "Les inscriptions sont fermées." };
  const rl = rateLimit(`register:${await clientIp()}`, LIMITS.register.limit, LIMITS.register.windowMs);
  if (!rl.ok) return { message: `Trop de tentatives. Réessaie dans ${rl.retryAfterSec}s.` };
  const parsed = registerSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) {
    return { message: "Vérifie les champs.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return { message: "Un compte existe déjà avec cet email." };
  const user = await createUser({ name, email, passwordHash: await hashPassword(password) });
  await audit(user.id, "user.registered");
  logger.info("auth.registered", { userId: user.id });
  await signIn("credentials", { email, password, redirect: false });
  redirect("/onboarding");
}

export async function loginAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { message: "Email ou mot de passe invalide." };
  const rl = rateLimit(`login-ip:${await clientIp()}`, LIMITS.login.limit * 3, LIMITS.login.windowMs);
  if (!rl.ok) return { message: `Trop de tentatives. Réessaie dans ${rl.retryAfterSec}s.` };
  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { message: "Email ou mot de passe incorrect." };
    throw e;
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
