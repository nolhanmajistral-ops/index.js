/**
 * Relances WhatsApp : lien wa.me avec message pré-rempli. Nolhan relit et appuie lui-même sur Envoyer :
 * aucun envoi automatique, aucun envoi de masse.
 */

/** Numéro au format international sans « + » (wa.me). Numéros suisses locaux (0xx…) → 41xx… ; sinon null. */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // déjà international
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) digits = `41${digits.slice(1)}`;
  else return null;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function firstNameOf(displayName: string, firstName: string | null): string {
  return (firstName?.trim() || displayName.trim().split(/\s+/)[0] || "").replace(/^\w/, (c) => c.toUpperCase());
}

const TEMPLATES = [
  (p: string, w: number) => `Salut ${p} ! Ça fait ${w} semaines, ta coupe doit commencer à pousser 😄 J'ai de la place cette semaine, je te réserve un créneau ?`,
  (p: string, w: number) => `Hello ${p}, ça fait un moment (${w} semaines) ! Tu veux que je te bloque une place cette semaine pour rafraîchir le dégradé ?`,
  (p: string) => `Salut ${p}, je fais le planning de la semaine et j'ai pensé à toi. Je te garde un créneau ? Dis-moi le jour qui t'arrange.`,
] as const;

/** Message de relance personnalisé ; le modèle change selon le client pour éviter les copier-coller identiques. */
export function relanceMessage(c: { id: string; displayName: string; firstName: string | null }, daysSince: number): string {
  const weeks = Math.max(1, Math.round(daysSince / 7));
  const idx = [...c.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TEMPLATES.length;
  return TEMPLATES[idx]!(firstNameOf(c.displayName, c.firstName), weeks);
}

export function whatsAppLink(phone: string | null | undefined, message: string): string | null {
  const n = toWhatsAppNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
