import clsx from "clsx";

type Tone = "neutral" | "gold" | "ok" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "border-line-2 text-soft",
  gold: "border-gold/40 text-gold bg-gold-soft",
  ok: "border-ok/40 text-ok",
  warn: "border-warn/40 text-warn",
  bad: "border-bad/40 text-bad",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Marqueur obligatoire des données de démonstration. */
export function DemoBadge() {
  return (
    <Badge tone="warn" title="Donnée de démonstration — pas une donnée réelle">
      DEMO
    </Badge>
  );
}

const CONNECTION_LABEL: Record<string, { label: string; tone: Tone }> = {
  CONNECTED: { label: "Connected", tone: "ok" },
  CONNECTED_IMPORT: { label: "Connected (import)", tone: "ok" },
  DISCONNECTED: { label: "Disconnected", tone: "neutral" },
  SYNCING: { label: "Syncing", tone: "gold" },
  PARTIAL: { label: "Partial", tone: "warn" },
  ERROR: { label: "Error", tone: "bad" },
  CONFIGURATION_REQUIRED: { label: "Configuration required", tone: "warn" },
};

export function ConnectionBadge({ status }: { status: string }) {
  const c = CONNECTION_LABEL[status] ?? { label: "Configuration required", tone: "warn" as Tone };
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

const CONF: Record<string, Tone> = { HIGH: "ok", MEDIUM: "gold", LOW: "warn", UNKNOWN: "neutral" };
export function ConfidenceBadge({ level, prefix = "Confiance" }: { level: string; prefix?: string }) {
  const label = { HIGH: "haute", MEDIUM: "moyenne", LOW: "faible", UNKNOWN: "inconnue" }[level] ?? level;
  return <Badge tone={CONF[level] ?? "neutral"}>{prefix} {label}</Badge>;
}
