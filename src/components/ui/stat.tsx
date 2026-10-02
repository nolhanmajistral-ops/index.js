import clsx from "clsx";
import { formatPercent } from "@/lib/money";

export function Delta({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-xs text-mute">—</span>;
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.005;
  return (
    <span className={clsx("text-xs font-medium tabular-nums", neutral ? "text-mute" : positive ? "text-ok" : "text-bad")}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {formatPercent(Math.abs(value))}
    </span>
  );
}

export function Stat({ label, value, delta, hint, className }: { label: string; value: React.ReactNode; delta?: number | null; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="label truncate">{label}</div>
      <div className="mt-1 truncate font-display text-2xl tabular-nums md:text-[28px]">{value}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-mute">
        {delta !== undefined ? <Delta value={delta} /> : null}
        {hint}
      </div>
    </div>
  );
}
