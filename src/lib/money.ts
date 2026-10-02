export const CURRENCY = "CHF";

/** Les montants sont stockés en centimes. */
export function formatCHF(cents: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const value = cents / 100;
  const decimals = opts.decimals ?? !Number.isInteger(value);
  return `${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 }).format(value)} CHF`;
}

/** Convertit "55", "55.50", "55,50", "CHF 55.-" en centimes. Renvoie null si invalide. */
export function parseMoneyToCents(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/chf|fr\.?|€|\s|'/gi, "").replace(/\.-$/, "").replace(/-$/, "");
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: digits }).format(ratio * 100)} %`;
}
