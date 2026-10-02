import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { loginSchema } from "@/lib/validation/schemas";
import { findUserByEmail } from "@/repositories/users";
import { DUMMY_HASH, verifyPassword } from "./password";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Mot de passe", type: "password" } },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const rl = rateLimit(`login:${email}`, LIMITS.login.limit, LIMITS.login.windowMs);
        if (!rl.ok) {
          logger.warn("auth.rate_limited", { retryAfterSec: rl.retryAfterSec });
          return null;
        }
        const user = await findUserByEmail(email);
        const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !ok) {
          logger.info("auth.login_failed");
          return null;
        }
        logger.info("auth.login_success", { userId: user.id });
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
