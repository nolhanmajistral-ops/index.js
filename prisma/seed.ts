/**
 * Seed DEMO (développement / démonstration uniquement).
 * Crée le compte SEED_DEMO_EMAIL (mot de passe SEED_DEMO_PASSWORD) et 8 semaines de données marquées DEMO.
 * Idempotent : relancer le seed réinitialise uniquement les données DEMO de ce compte.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { completeOnboarding } from "../src/domain/onboarding/service";
import { resetDemoData } from "../src/datahub/demo";

async function main() {
  const email = (process.env.SEED_DEMO_EMAIL || "demo@nolhan-os.local").toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Définir SEED_DEMO_PASSWORD (10 caractères minimum) dans .env");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Seed DEMO refusé en production (ALLOW_DEMO_SEED=true pour forcer).");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: "Nolhan Yildirim", passwordHash: await hashPassword(password) } });
    await completeOnboarding(user.id, {
      displayName: "Nolhan Yildirim", activity: "Barber", city: "Lausanne",
      priceCoupe: 40, priceCoupeBarbe: 55, priceTransformation: 55, priceTransformationBarbe: 65,
      instagramHandle: "nolhan.barber", tiktokHandle: "nolhan.barber", usesPlanity: true, weeklyHoursAvailable: 45, contentHoursPerWeek: 4,
    });
  }
  const res = await resetDemoData(user.id);
  console.log(`Compte DEMO : ${email}`);
  console.log(`Données DEMO : ${res.created.clients} clients, ${res.created.appointments} rendez-vous, ${res.created.contents} contenus.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
