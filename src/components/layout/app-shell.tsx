import Link from "next/link";
import { BottomNav, MobileMenu, SidebarLinks } from "./nav-links";
import { signOutAction } from "@/app/(auth)/actions";

export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-baseline gap-1.5">
      <span className="font-display text-xl tracking-tight">NOLHAN</span>
      <span className="text-[10px] font-semibold tracking-[0.3em] text-gold">OS</span>
    </Link>
  );
}

export function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-ink px-3 py-5 md:flex">
        <div className="px-3 pb-6">
          <Logo />
        </div>
        <SidebarLinks />
        <div className="mt-auto space-y-2 px-3 pt-4 text-xs text-mute">
          <div className="truncate">{userName}</div>
          <form action={signOutAction}>
            <button className="text-mute underline-offset-4 hover:text-bone hover:underline">Déconnexion</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:hidden">
          <Logo />
          <MobileMenu />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
