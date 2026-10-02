export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/contents", label: "Contenus", icon: "Clapperboard" },
  { href: "/clients", label: "Clients", icon: "Users" },
  { href: "/planity", label: "Planity", icon: "CalendarCheck" },
  { href: "/revenue", label: "CA", icon: "Wallet" },
  { href: "/social", label: "Réseaux", icon: "Radio" },
  { href: "/missions", label: "Missions", icon: "Target" },
  { href: "/analytics", label: "Analyse", icon: "LineChart" },
  { href: "/ai", label: "Coach IA", icon: "Sparkles" },
  { href: "/goals", label: "Objectifs", icon: "Flag" },
  { href: "/settings", label: "Réglages", icon: "Settings" },
] as const;

export const MOBILE_SHORTCUTS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/missions", label: "Mission", icon: "Target" },
  { href: "/contents/new", label: "Contenu", icon: "PlusSquare" },
  { href: "/clients/new", label: "Client", icon: "UserPlus" },
  { href: "/ai", label: "Coach IA", icon: "Sparkles" },
] as const;
