import Link from "next/link";
import { Badge } from "./badge";

/** Affichage honnête de l'absence de données — jamais de valeur inventée. */
export function EmptyState({ title, children, status, href, cta }: { title: string; children?: React.ReactNode; status?: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-bone">{title}</span>
        {status ? <Badge tone="warn">{status}</Badge> : null}
      </div>
      {children ? <div className="mt-1 text-mute">{children}</div> : null}
      {href && cta ? (
        <Link href={href} className="mt-3 inline-block text-gold underline-offset-4 hover:underline">
          {cta} →
        </Link>
      ) : null}
    </div>
  );
}

export function InsufficientData({ children }: { children?: React.ReactNode }) {
  return (
    <EmptyState title="Données insuffisantes">
      {children ?? "NOLHAN OS a besoin de davantage de données pour identifier une tendance fiable."}
    </EmptyState>
  );
}
