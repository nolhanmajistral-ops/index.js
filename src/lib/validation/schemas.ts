import { z } from "zod";
import { fromLocalInput } from "@/lib/dates";

/** Date saisie dans un formulaire (fuseau Europe/Zurich). */
const localDate = z.preprocess((v) => (typeof v === "string" ? fromLocalInput(v) ?? v : v), z.date({ invalid_type_error: "Date invalide" }));
const optionalLocalDate = z.preprocess((v) => (v === "" || v == null ? undefined : typeof v === "string" ? fromLocalInput(v) ?? v : v), z.date({ invalid_type_error: "Date invalide" }).optional());

/** Schémas Zod partagés (validation serveur systématique — jamais de confiance au frontend). */
const trimmed = (max: number) => z.string().trim().max(max);
const optionalTrimmed = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const optionalInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(1_000_000_000).optional());
const chf = z.coerce.number().min(0).max(1_000_000);
const optionalChf = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().min(0).max(1_000_000).optional());

export const registerSchema = z.object({
  name: trimmed(80).min(2, "Nom trop court"),
  email: z.string().trim().toLowerCase().email("Email invalide").max(200),
  password: z.string().min(10, "10 caractères minimum").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const acquisitionChannels = ["INSTAGRAM", "TIKTOK", "GOOGLE", "PLANITY", "WORD_OF_MOUTH", "WALK_IN", "OTHER", "UNKNOWN"] as const;
export const contentTypes = ["TRANSFORMATION", "BEFORE_AFTER", "FACE_CAMERA", "ADVICE", "HUMOR", "LIFESTYLE", "BEHIND_THE_SCENES", "STORYTELLING", "CLIENT_REACTION", "EDUCATION", "OTHER"] as const;
export const contentStatuses = ["IDEA", "TO_FILM", "FILMED", "TO_EDIT", "READY", "PUBLISHED"] as const;
export const platforms = ["INSTAGRAM", "TIKTOK"] as const;
export const goalMetrics = ["INSTAGRAM_FOLLOWERS", "TIKTOK_FOLLOWERS", "VIEWS_WEEK", "CLIENTS_WEEK", "REVENUE_WEEK", "REVENUE_MONTH", "VIDEOS_WEEK", "STORIES_DAY", "NEW_CLIENTS_WEEK"] as const;
export const missionStatuses = ["PENDING", "DONE", "SKIPPED", "PARTIAL"] as const;

export const onboardingSchema = z.object({
  displayName: trimmed(80).min(1),
  activity: trimmed(80).min(1),
  city: trimmed(80).min(1),
  priceCoupe: chf,
  priceCoupeBarbe: chf,
  priceTransformation: chf,
  priceTransformationBarbe: chf,
  goalRevenueMonth: optionalChf,
  goalClientsWeek: optionalInt,
  goalInstagramFollowers: optionalInt,
  goalVideosWeek: optionalInt,
  instagramHandle: optionalTrimmed(60),
  tiktokHandle: optionalTrimmed(60),
  usesPlanity: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  approxActiveClients: optionalInt,
  approxMonthlyRevenue: optionalChf,
  weeklyHoursAvailable: optionalInt,
  contentHoursPerWeek: optionalInt,
  loadDemo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const clientSchema = z.object({
  firstName: optionalTrimmed(80),
  lastName: optionalTrimmed(80),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().email("Email invalide").max(200).optional()),
  phone: optionalTrimmed(40),
  acquisitionChannel: z.enum(acquisitionChannels).default("UNKNOWN"),
  declaredAnswer: optionalTrimmed(200),
  originContentId: optionalTrimmed(40),
  notes: optionalTrimmed(2000),
}).refine((d) => d.firstName || d.lastName, { message: "Prénom ou nom requis", path: ["firstName"] });

export const contentSchema = z.object({
  platform: z.enum(platforms),
  title: trimmed(200).min(1, "Titre requis"),
  type: z.enum(contentTypes).default("OTHER"),
  status: z.enum(contentStatuses).default("IDEA"),
  hook: optionalTrimmed(300),
  description: optionalTrimmed(3000),
  durationSec: optionalInt,
  url: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().url("URL invalide").max(500).optional()),
  notes: optionalTrimmed(3000),
  publishedAt: optionalLocalDate,
  plannedAt: optionalLocalDate,
});

export const contentMetricSchema = z.object({
  views: optionalInt,
  likes: optionalInt,
  comments: optionalInt,
  shares: optionalInt,
  saves: optionalInt,
  followersGained: optionalInt,
  profileVisits: optionalInt,
  messages: optionalInt,
  leads: optionalInt,
});

export const socialSnapshotSchema = z.object({
  platform: z.enum(platforms),
  capturedAt: localDate.refine((d) => d.getTime() <= Date.now() + 60_000, "La date ne peut pas être dans le futur"),
  followers: optionalInt,
  views: optionalInt,
  likes: optionalInt,
  comments: optionalInt,
  shares: optionalInt,
}).refine((d) => [d.followers, d.views, d.likes, d.comments, d.shares].some((x) => x !== undefined), { message: "Au moins une métrique est requise", path: ["followers"] });

export const manualRevenueSchema = z.object({
  amount: chf.refine((v) => v > 0, "Montant requis"),
  occurredAt: localDate,
  serviceId: optionalTrimmed(40),
  clientId: optionalTrimmed(40),
  kind: z.enum(["SERVICE", "PRODUCT", "TIP", "OTHER"]).default("SERVICE"),
  label: optionalTrimmed(200),
});

export const appointmentSchema = z.object({
  clientId: optionalTrimmed(40),
  serviceId: trimmed(40).min(1, "Prestation requise"),
  startsAt: localDate,
  price: optionalChf,
  status: z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"]).default("COMPLETED"),
});

export const goalSchema = z.object({
  metric: z.enum(goalMetrics),
  target: z.coerce.number().min(0).max(100_000_000),
});

export const serviceSchema = z.object({
  name: trimmed(80).min(1),
  price: chf,
  durationMinutes: optionalInt,
});

export const missionUpdateSchema = z.object({
  missionId: trimmed(40).min(1),
  status: z.enum(missionStatuses),
  resultNote: optionalTrimmed(1000),
});

export const experimentSchema = z.object({
  hypothesis: trimmed(500).min(5),
  action: trimmed(500).min(3),
  startDate: localDate,
  durationDays: z.coerce.number().int().min(1).max(180),
  expectedResult: trimmed(500).min(3),
  metrics: z.array(z.enum(["views", "profileVisits", "leads", "newClients", "revenue", "followers"])).min(1),
});

export const leadSchema = z.object({
  name: optionalTrimmed(120),
  channel: z.enum(acquisitionChannels).default("UNKNOWN"),
  contentId: optionalTrimmed(40),
  notes: optionalTrimmed(1000),
});

export const scoreWeightsSchema = z.object({
  visibility: z.object({ views: z.number().min(0).max(10), viewsPerFollower: z.number().min(0).max(10), reach: z.number().min(0).max(10) }),
  engagement: z.object({ likeRate: z.number().min(0).max(10), commentRate: z.number().min(0).max(10), shareRate: z.number().min(0).max(10), saveRate: z.number().min(0).max(10) }),
  acquisition: z.object({ profileVisits: z.number().min(0).max(10), followersGained: z.number().min(0).max(10), leads: z.number().min(0).max(10) }),
  business: z.object({ clients: z.number().min(0).max(10), revenue: z.number().min(0).max(10) }),
});
export type ScoreWeights = z.infer<typeof scoreWeightsSchema>;

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
