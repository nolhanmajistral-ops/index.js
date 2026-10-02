"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  CalendarCheck, Clapperboard, Flag, LayoutDashboard, LineChart, PlusSquare, Radio, Settings, Sparkles, Target, UserPlus, Users, Wallet,
} from "lucide-react";
import { MOBILE_SHORTCUTS, NAV_ITEMS } from "./nav";

const ICONS = { CalendarCheck, Clapperboard, Flag, LayoutDashboard, LineChart, PlusSquare, Radio, Settings, Sparkles, Target, UserPlus, Users, Wallet };

function isActive(pathname: string, href: string) {
  if (href.endsWith("/new")) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={clsx(
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              active ? "bg-ink-3 text-bone" : "text-mute hover:bg-ink-3/60 hover:text-bone",
            )}
          >
            <Icon size={16} className={clsx(active ? "text-gold" : "text-mute group-hover:text-soft")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Raccourcis"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {MOBILE_SHORTCUTS.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} prefetch={false} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[10px]", active ? "text-bone" : "text-mute")}>
            <Icon size={19} className={active ? "text-gold" : undefined} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu() {
  const pathname = usePathname();
  return (
    <details className="relative md:hidden">
      <summary className="btn-ghost cursor-pointer list-none px-3 py-1.5 text-xs">Menu</summary>
      <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-line bg-ink-2 p-2 shadow-2xl">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} prefetch={false} className={clsx("block rounded-lg px-3 py-2 text-sm", isActive(pathname, item.href) ? "bg-ink-3 text-bone" : "text-soft")}>
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
