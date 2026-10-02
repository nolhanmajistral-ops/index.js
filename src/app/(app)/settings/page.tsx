import { requireOnboardedUser } from "@/lib/auth/session";
import { getProfile } from "@/repositories/profile";
import { listServices } from "@/repositories/services";
import { listAuditLogs } from "@/repositories/audit";
import { getScoreWeights } from "@/domain/analytics/service";
import { socialIntegrationStatus } from "@/datahub/social/service";
import { listImportBatches } from "@/repositories/imports";
import { aiStatus } from "@/ai/providers";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, ConnectionBadge } from "@/components/ui/badge";
import { formatCHF } from "@/lib/money";
import { formatDateTimeFr } from "@/lib/dates";
import { ACTIVITY_LABEL } from "@/lib/activity";
import { DeleteAccountForm, DemoForms, ProfileForm, RetentionForm, ServiceForm, WeightsForm } from "./forms";
import { toggleServiceAction } from "./actions";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  const [profile, services, logs, weights, social, batches] = await Promise.all([getProfile(user.id), listServices(user.id), listAuditLogs(user.id, 30), getScoreWeights(user.id), socialIntegrationStatus(user.id), listImportBatches(user.id, 50)]);
  const ai = aiStatus();
  const planityConnected = batches.some((b) => b.provider === "PLANITY" && b.status === "COMPLETED");
  return (
    <div>
      <PageHeader title="Réglages" subtitle={user.email} />
      <SectionTitle>Profil</SectionTitle>
      <Card>{profile ? <ProfileForm p={profile} /> : null}</Card>

      <SectionTitle>Tarifs</SectionTitle>
      <Card className="space-y-4">
        <ul className="divide-y divide-line text-sm">
          {services.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className={s.active ? "" : "text-mute line-through"}>{s.name} {s.source !== "MANUAL" ? <Badge>{s.source}</Badge> : null}</span>
              <span className="flex items-center gap-3"><span className="tabular-nums">{formatCHF(s.priceCents)}</span><form action={toggleServiceAction.bind(null, s.id, !s.active)}><button className="text-xs text-mute hover:text-bone">{s.active ? "Désactiver" : "Réactiver"}</button></form></span>
            </li>
          ))}
        </ul>
        <ServiceForm />
      </Card>

      <SectionTitle id="weights">Pondérations des scores de contenu</SectionTitle>
      <Card><WeightsForm w={weights} /></Card>

      <SectionTitle>Intégrations</SectionTitle>
      <Card>
        <ul className="divide-y divide-line text-sm">
          {social.map((s) => <li key={s.platform} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{s.platform === "INSTAGRAM" ? "Instagram" : "TikTok"}</span><span className="flex items-center gap-2">{!s.configured ? <span className="text-xs text-mute">{s.missing.join(", ")}</span> : null}<ConnectionBadge status={s.status} /></span></li>)}
          <li className="flex items-center justify-between py-2"><span>Planity <span className="text-xs text-mute">(import CSV/XLSX — pas d&apos;API publique)</span></span><ConnectionBadge status={planityConnected ? "CONNECTED_IMPORT" : "CONFIGURATION_REQUIRED"} /></li>
          <li className="flex items-center justify-between py-2"><span>Fournisseur IA</span>{ai.configured ? <Badge tone="ok">{ai.provider}</Badge> : <Badge tone="warn">Configuration required — mode déterministe</Badge>}</li>
        </ul>
      </Card>

      <SectionTitle>Exports</SectionTitle>
      <Card className="flex flex-wrap gap-2 text-sm">
        {(["clients", "contents", "appointments", "revenue", "metrics"] as const).map((e) => (
          <span key={e} className="flex gap-1 rounded-xl border border-line px-3 py-2">
            <span className="text-soft">{{ clients: "Clients", contents: "Contenus", appointments: "Rendez-vous", revenue: "CA", metrics: "Métriques" }[e]}</span>
            <a className="text-gold" href={`/api/export?entity=${e}&format=csv`}>CSV</a>·<a className="text-gold" href={`/api/export?entity=${e}&format=json`}>JSON</a>
          </span>
        ))}
        <a className="btn-ghost" href="/api/export?entity=all&format=json">Tout exporter (JSON)</a>
      </Card>

      <SectionTitle id="demo">Données de démonstration</SectionTitle>
      <Card className="space-y-2">
        <p className="text-sm text-mute">Supprime uniquement les données marquées DEMO de ton compte, puis les recrée. Tes données réelles ne sont jamais touchées.</p>
        <DemoForms />
      </Card>

      <SectionTitle>Données personnelles (NLPD)</SectionTitle>
      <Card className="space-y-4 text-sm">
        <p className="text-mute">Emails et téléphones clients chiffrés (AES-256-GCM). Export par client depuis sa fiche ; suppression d&apos;un client depuis sa fiche. Rétention actuelle : {profile?.dataRetentionMonths ?? 36} mois.</p>
        <RetentionForm />
        <div className="border-t border-line pt-4"><DeleteAccountForm /></div>
      </Card>

      <SectionTitle>Journal d&apos;audit</SectionTitle>
      <Card>
        <ul className="divide-y divide-line text-xs">
          {logs.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{ACTIVITY_LABEL[l.action] ?? l.action}</span><span className="text-mute">{formatDateTimeFr(l.createdAt)}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
