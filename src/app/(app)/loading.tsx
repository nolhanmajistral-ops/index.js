export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-ink-3" />
      <div className="h-48 animate-pulse rounded-3xl bg-ink-2" />
      <div className="grid gap-3 md:grid-cols-2"><div className="h-40 animate-pulse rounded-2xl bg-ink-2" /><div className="h-40 animate-pulse rounded-2xl bg-ink-2" /></div>
    </div>
  );
}
