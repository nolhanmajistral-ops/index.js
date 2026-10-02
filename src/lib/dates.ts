/**
 * Périodes calculées dans le fuseau du salon (Europe/Zurich par défaut).
 * Semaine = lundi → dimanche. Toutes les bornes renvoyées sont des instants UTC.
 */
export const DEFAULT_TZ = "Europe/Zurich";
export const DAY_MS = 86_400_000;

export type PeriodUnit = "day" | "week" | "month" | "year";
export interface Period {
  start: Date;
  end: Date; // exclusif
}

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
    wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday ?? "Mon"),
  };
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant UTC correspondant à minuit local (tz) de la date civile y-m-d. */
export function zonedMidnight(y: number, m: number, d: number, tz = DEFAULT_TZ): Date {
  const guess = new Date(Date.UTC(y, m - 1, d));
  const off = offsetMs(guess, tz);
  const candidate = new Date(guess.getTime() - off);
  const off2 = offsetMs(candidate, tz);
  return off2 === off ? candidate : new Date(guess.getTime() - off2);
}

export function startOf(unit: PeriodUnit, date: Date, tz = DEFAULT_TZ): Date {
  const p = parts(date, tz);
  switch (unit) {
    case "day":
      return zonedMidnight(p.y, p.m, p.d, tz);
    case "week": {
      const base = new Date(Date.UTC(p.y, p.m - 1, p.d - p.wd));
      return zonedMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), tz);
    }
    case "month":
      return zonedMidnight(p.y, p.m, 1, tz);
    case "year":
      return zonedMidnight(p.y, 1, 1, tz);
  }
}

export function addUnits(unit: PeriodUnit, date: Date, n: number, tz = DEFAULT_TZ): Date {
  const p = parts(date, tz);
  const b = new Date(Date.UTC(p.y, p.m - 1, p.d));
  if (unit === "day") b.setUTCDate(b.getUTCDate() + n);
  if (unit === "week") b.setUTCDate(b.getUTCDate() + 7 * n);
  if (unit === "month") b.setUTCMonth(b.getUTCMonth() + n);
  if (unit === "year") b.setUTCFullYear(b.getUTCFullYear() + n);
  const mid = zonedMidnight(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), tz);
  // Conserve l'heure locale relative au début de journée.
  return new Date(mid.getTime() + (date.getTime() - startOf("day", date, tz).getTime()));
}

export function periodOf(unit: PeriodUnit, date: Date, tz = DEFAULT_TZ): Period {
  const start = startOf(unit, date, tz);
  return { start, end: addUnits(unit, start, 1, tz) };
}

export function previousPeriod(unit: PeriodUnit, date: Date, tz = DEFAULT_TZ): Period {
  const start = addUnits(unit, startOf(unit, date, tz), -1, tz);
  return { start, end: startOf(unit, date, tz) };
}

export function inPeriod(d: Date, p: Period): boolean {
  return d.getTime() >= p.start.getTime() && d.getTime() < p.end.getTime();
}

/** Date civile locale "YYYY-MM-DD". */
export function localDateKey(date: Date, tz = DEFAULT_TZ): string {
  const p = parts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Les N dernières semaines complètes ou en cours (la plus ancienne en premier). */
export function lastWeeks(n: number, now: Date, tz = DEFAULT_TZ): Period[] {
  const out: Period[] = [];
  const current = startOf("week", now, tz);
  for (let i = n - 1; i >= 0; i--) {
    const start = addUnits("week", current, -i, tz);
    out.push({ start, end: addUnits("week", start, 1, tz) });
  }
  return out;
}

export function formatDateFr(d: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTimeFr(d: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Libellé court jj.mm dans le fuseau du salon (utilisé pour les axes de graphiques). */
export function shortDayLabel(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("fr-CH", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d);
}

/** "YYYY-MM-DDTHH:mm" (ou "YYYY-MM-DD") saisi dans un <input> → instant UTC, interprété dans le fuseau du salon. */
export function fromLocalInput(value: string, tz = DEFAULT_TZ): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const base = zonedMidnight(+m[1]!, +m[2]!, +m[3]!, tz);
  return new Date(base.getTime() + ((m[4] ? +m[4] : 0) * 60 + (m[5] ? +m[5] : 0)) * 60_000);
}

/** Instant → valeur pour <input type="datetime-local"> dans le fuseau du salon. */
export function toLocalInput(d: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "";
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
