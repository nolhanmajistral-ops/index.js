"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h2 className="font-display text-2xl">Une erreur est survenue.</h2>
      <p className="mt-2 text-sm text-mute">L&apos;incident a été journalisé. Aucune donnée n&apos;a été perdue.</p>
      <button onClick={reset} className="btn-primary mt-4">Réessayer</button>
    </div>
  );
}
