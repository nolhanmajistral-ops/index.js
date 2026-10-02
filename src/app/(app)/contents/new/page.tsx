import { PageHeader, Card } from "@/components/ui/card";
import { ContentForm } from "../content-form";
import { createContentAction } from "../actions";

export const metadata = { title: "Nouveau contenu" };

export default function NewContentPage() {
  return (
    <div>
      <PageHeader title="Nouveau contenu" subtitle="Idée, tournage ou publication : tout part d'ici." />
      <Card><ContentForm action={createContentAction} submitLabel="Créer le contenu" /></Card>
    </div>
  );
}
