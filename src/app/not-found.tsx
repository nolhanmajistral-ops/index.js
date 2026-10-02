import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-4xl">Introuvable.</h1>
      <p className="text-mute">Cette page n&apos;existe pas ou ne t&apos;appartient pas.</p>
      <Link href="/dashboard" className="btn-primary">Retour au dashboard</Link>
    </div>
  );
}
