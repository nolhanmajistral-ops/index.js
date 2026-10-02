/** Normalisation de texte : minuscules, sans accents, sans ponctuation, espaces compactés. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Nom normalisé, tokens triés : "Dupont Jean" == "jean  DUPONT" == "Jéan Dupont". */
export function normalizePersonName(input: string | null | undefined): string {
  const t = normalizeText(input);
  if (!t) return "";
  return t.split(" ").filter((x) => x.length > 0).sort().join(" ");
}

export function displayName(first?: string | null, last?: string | null, full?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  return (full ?? "").trim().replace(/\s+/g, " ");
}

export function splitFullName(full: string): { firstName: string | null; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") };
}
