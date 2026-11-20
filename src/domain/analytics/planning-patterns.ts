import type { AppointmentRow } from "@/domain/revenue/types";
import { DAY_MS, type Period } from "@/lib/dates";

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
export type DaySlot = "matin" | "midi" | "apresMidi" | "soir";

function localParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday: wd < 0 ? 0 : wd, hour: Number(get("hour")), key: `${get("year")}-${get("month")}-${get("day")}` };
}

function slotOf(hour: number): DaySlot {
  if (hour < 12) return "matin";
  if (hour < 14) return "midi";
  if (hour < 18) return "apresMidi";
  return "soir";
}

/**
 * Habitudes du planning (rendez-vous réellement honorés) : jours et tranches horaires les plus remplis,
 * plus la charge des 7 prochains jours. Sert à repérer les créneaux creux à remplir.
 */
export function planningPatterns(appts: AppointmentRow[], period: Period, now: Date, tz: string) {
  const past = appts.filter((a) => a.startsAt >= period.start && a.startsAt < period.end && a.startsAt <= now);
  const done = past.filter((a) => a.status === "COMPLETED");
  const noShow = past.filter((a) => a.status === "NO_SHOW").length;

  const byWeekday = DAYS.map((day) => ({ day, count: 0 }));
  const bySlot: Record<DaySlot, number> = { matin: 0, midi: 0, apresMidi: 0, soir: 0 };
  for (const a of done) {
    const p = localParts(a.startsAt, tz);
    byWeekday[p.weekday]!.count++;
    bySlot[slotOf(p.hour)]++;
  }
  const workedDays = byWeekday.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);

  // Charge des 7 prochains jours (rendez-vous réservés), jour par jour.
  const nextDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() + i * DAY_MS);
    const p = localParts(date, tz);
    return { key: p.key, day: DAYS[p.weekday]!, booked: 0 };
  });
  for (const a of appts) {
    if (a.status !== "BOOKED" || a.startsAt < now) continue;
    const slot = nextDays.find((d) => d.key === localParts(a.startsAt, tz).key);
    if (slot) slot.booked++;
  }

  return {
    total: done.length,
    noShow,
    byWeekday,
    bySlot,
    busiestDays: workedDays.slice(0, 2).map((d) => d.day),
    // Jours travaillés les moins remplis : seulement avec assez d'historique pour que ça veuille dire quelque chose.
    quietestDays: done.length >= 10 ? workedDays.slice(-2).reverse().map((d) => d.day) : [],
    nextDays: nextDays.map(({ day, booked }) => ({ day, booked })),
  };
}
