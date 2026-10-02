import type { GoalMetric } from "@prisma/client";
import { prisma } from "@/lib/db";
import { upsertProfile } from "@/repositories/profile";
import { upsertService } from "@/repositories/services";
import { upsertGoal } from "@/repositories/goals";
import { ensureSocialAccount } from "@/repositories/social";
import { upsertMemoryByKey } from "@/repositories/ai";
import { markOnboarded } from "@/repositories/users";
import { audit } from "@/repositories/audit";

export const DEFAULT_SERVICES = [
  { key: "priceCoupe", name: "Coupe", price: 40, duration: 30 },
  { key: "priceCoupeBarbe", name: "Coupe + barbe", price: 55, duration: 45 },
  { key: "priceTransformation", name: "Transformation", price: 55, duration: 60 },
  { key: "priceTransformationBarbe", name: "Transformation + barbe", price: 65, duration: 75 },
] as const;

export interface OnboardingInput {
  displayName: string;
  activity: string;
  city: string;
  priceCoupe: number;
  priceCoupeBarbe: number;
  priceTransformation: number;
  priceTransformationBarbe: number;
  goalRevenueMonth?: number;
  goalClientsWeek?: number;
  goalInstagramFollowers?: number;
  goalVideosWeek?: number;
  instagramHandle?: string;
  tiktokHandle?: string;
  usesPlanity: boolean;
  approxActiveClients?: number;
  approxMonthlyRevenue?: number;
  weeklyHoursAvailable?: number;
  contentHoursPerWeek?: number;
}

/**
 * Onboarding : crée le profil, les tarifs, les objectifs, les comptes sociaux (non connectés)
 * et le contexte initial de l'IA (mémoire). Les valeurs déclaratives (CA approximatif…)
 * sont stockées comme telles et jamais présentées comme des données réelles.
 */
export async function completeOnboarding(userId: string, input: OnboardingInput) {
  await prisma.$transaction(async (tx) => {
    await upsertProfile(
      userId,
      {
        displayName: input.displayName,
        activity: input.activity,
        city: input.city,
        instagramHandle: input.instagramHandle?.replace(/^@/, "") ?? null,
        tiktokHandle: input.tiktokHandle?.replace(/^@/, "") ?? null,
        usesPlanity: input.usesPlanity,
        approxActiveClients: input.approxActiveClients ?? null,
        approxMonthlyRevenue: input.approxMonthlyRevenue !== undefined ? Math.round(input.approxMonthlyRevenue * 100) : null,
        weeklyHoursAvailable: input.weeklyHoursAvailable ?? null,
        contentHoursPerWeek: input.contentHoursPerWeek ?? null,
      },
      tx,
    );
    for (const s of DEFAULT_SERVICES) {
      await upsertService(userId, { name: s.name, priceCents: Math.round(input[s.key] * 100), durationMinutes: s.duration }, tx);
    }
    const goals: [GoalMetric, number | undefined][] = [
      ["REVENUE_MONTH", input.goalRevenueMonth !== undefined ? Math.round(input.goalRevenueMonth * 100) : undefined],
      ["CLIENTS_WEEK", input.goalClientsWeek],
      ["INSTAGRAM_FOLLOWERS", input.goalInstagramFollowers],
      ["VIDEOS_WEEK", input.goalVideosWeek],
    ];
    for (const [metric, target] of goals) if (target !== undefined && target > 0) await upsertGoal(userId, metric, target, tx);
  });

  await ensureSocialAccount(userId, "INSTAGRAM", input.instagramHandle?.replace(/^@/, "") ?? null);
  await ensureSocialAccount(userId, "TIKTOK", input.tiktokHandle?.replace(/^@/, "") ?? null);

  // Contexte initial de l'IA
  await upsertMemoryByKey(userId, "profile.activity", { kind: "PREFERENCE", content: `${input.activity} à ${input.city}.` });
  if (input.weeklyHoursAvailable !== undefined)
    await upsertMemoryByKey(userId, "profile.hours", { kind: "PREFERENCE", content: `Temps disponible déclaré : ${input.weeklyHoursAvailable} h/semaine${input.contentHoursPerWeek !== undefined ? `, dont ${input.contentHoursPerWeek} h pour le contenu` : ""}.` });
  if (input.approxMonthlyRevenue !== undefined)
    await upsertMemoryByKey(userId, "profile.declaredRevenue", { kind: "NOTE", content: `CA mensuel approximatif DÉCLARÉ à l'onboarding : ${input.approxMonthlyRevenue} CHF (estimation, non vérifiée).` });
  if (input.approxActiveClients !== undefined)
    await upsertMemoryByKey(userId, "profile.declaredClients", { kind: "NOTE", content: `Clients actuels DÉCLARÉS : ~${input.approxActiveClients} (estimation).` });
  if (input.goalRevenueMonth) await upsertMemoryByKey(userId, "goal.revenueMonth", { kind: "GOAL", content: `Objectif CA mensuel : ${input.goalRevenueMonth} CHF.`, weight: 2 });
  if (input.goalClientsWeek) await upsertMemoryByKey(userId, "goal.clientsWeek", { kind: "GOAL", content: `Objectif : ${input.goalClientsWeek} clients par semaine.`, weight: 2 });

  await markOnboarded(userId);
  await audit(userId, "onboarding.completed", { metadata: { usesPlanity: input.usesPlanity } });
}
