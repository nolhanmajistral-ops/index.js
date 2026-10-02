"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Graphiques mono-série : pas de légende (le titre nomme la série), barres ≤ 24px à extrémité arrondie,
 * ligne 2px, grille hairline pleine, infobulle au survol, texte en tokens neutres (jamais la couleur de série).
 */
const SERIES = "#b8862f";
const GRID = "#262626";
const AXIS = "#8a8a8a";

export interface Point {
  label: string;
  value: number | null;
}

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { value: number }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length || payload[0]?.value === null || payload[0]?.value === undefined) return null;
  return (
    <div className="rounded-lg border border-line-2 bg-ink px-3 py-2 text-xs shadow-xl">
      <div className="text-mute">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums text-bone">{format(payload[0].value)}</div>
    </div>
  );
}

const fmtAxis = (v: number) => new Intl.NumberFormat("fr-CH", { notation: v >= 10000 ? "compact" : "standard" }).format(v);

export function BarSeries({ data, format = (v) => fmtAxis(v), height = 200 }: { data: Point[]; format?: (v: number) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={fmtAxis} width={48} />
          <Tooltip cursor={{ fill: "#ffffff08" }} content={<TooltipBox format={format} />} />
          <Bar dataKey="value" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeries({ data, format = (v) => fmtAxis(v), height = 200 }: { data: Point[]; format?: (v: number) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={fmtAxis} width={48} domain={["auto", "auto"]} />
          <Tooltip cursor={{ stroke: AXIS, strokeWidth: 1 }} content={<TooltipBox format={format} />} />
          <Line type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" connectNulls dot={{ r: 4, fill: SERIES, stroke: "#111111", strokeWidth: 2 }} activeDot={{ r: 6, fill: SERIES, stroke: "#111111", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
