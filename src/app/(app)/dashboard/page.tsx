import { requireOnboardedUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  return <h1 className="font-display text-4xl">Bonjour {user.name.split(" ")[0]}.</h1>;
}
