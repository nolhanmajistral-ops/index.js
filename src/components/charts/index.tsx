"use client";

import dynamic from "next/dynamic";
import type { Point } from "./charts";

/** Chargement différé des graphiques (Recharts) : n'alourdit pas le premier rendu. */
const Placeholder = () => <div className="h-[200px] animate-pulse rounded-xl bg-ink-3/50" />;
const LazyBar = dynamic(() => import("./charts").then((m) => m.BarSeries), { ssr: false, loading: Placeholder });
const LazyLine = dynamic(() => import("./charts").then((m) => m.LineSeries), { ssr: false, loading: Placeholder });

type Unit = "chf" | "count";
const formatter = (unit: Unit) => (v: number) => (unit === "chf" ? `${new Intl.NumberFormat("fr-CH").format(Math.round(v))} CHF` : new Intl.NumberFormat("fr-CH").format(Math.round(v)));

/** Graphique + table de données accessible (le graphique n'est jamais la seule source de l'information). */
export function Chart({ kind, title, data, unit = "count", height }: { kind: "bar" | "line"; title: string; data: Point[]; unit?: Unit; height?: number }) {
  const fmt = formatter(unit);
  const hasData = data.some((d) => d.value !== null && d.value !== 0);
  return (
    <figure>
      <figcaption className="mb-2 text-sm text-soft">{title}</figcaption>
      {hasData ? (kind === "bar" ? <LazyBar data={data} format={fmt} height={height} /> : <LazyLine data={data} format={fmt} height={height} />) : <p className="py-8 text-center text-sm text-mute">Aucune donnée disponible.</p>}
      {hasData ? (
        <details className="mt-2 text-xs text-mute">
          <summary className="cursor-pointer select-none">Voir les données</summary>
          <table className="mt-2 w-full tabular-nums">
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-t border-line">
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right text-soft">{d.value === null ? "—" : fmt(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </figure>
  );
}
