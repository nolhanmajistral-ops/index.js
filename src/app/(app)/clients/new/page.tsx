import { requireOnboardedUser } from "@/lib/auth/session";
import { listContentOptions } from "@/repositories/contents";
import { PageHeader, Card } from "@/components/ui/card";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";

export const metadata = { title: "Nouveau client" };

export default async function NewClientPage() {
  const user = await requireOnboardedUser();
  const contents = await listContentOptions(user.id);
  return (
    <div>
      <PageHeader title="Nouveau client" subtitle="Les emails et téléphones sont chiffrés en base." />
      <Card><ClientForm action={createClientAction} contents={contents} submitLabel="Ajouter le client" /></Card>
    </div>
  );
}
