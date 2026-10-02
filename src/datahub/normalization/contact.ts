const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const e = input.trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

/**
 * Normalise un téléphone au format E.164. Par défaut Suisse (+41).
 * "079 123 45 67" → "+41791234567" ; "0041 79..." → "+4179..." ; "+33 6..." conservé.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry = "41"): string | null {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s.\-()/]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    // "+41 0791234567" → retire le 0 national
    if (digits.startsWith(defaultCountry + "0")) return "+" + defaultCountry + digits.slice(defaultCountry.length + 1);
    return "+" + digits;
  }
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith("0") && s.length === 10) return "+" + defaultCountry + s.slice(1);
  if (s.startsWith(defaultCountry) && s.length === 11) return "+" + s;
  if (s.length === 9 && /^[1-9]/.test(s)) return "+" + defaultCountry + s;
  return null;
}
