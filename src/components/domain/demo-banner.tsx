import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/5 px-4 py-2.5 text-sm text-warn">
      <span>Des données <strong>DEMO</strong> (fictives) sont présentes et incluses dans les statistiques.</span>
      <Link href="/settings#demo" className="underline underline-offset-4">Gérer</Link>
    </div>
  );
}
