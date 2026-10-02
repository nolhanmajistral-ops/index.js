# NOLHAN OS — Architecture

Philosophie : **DONNÉES → ANALYSE → INSIGHT → ACTION → RÉSULTAT → APPRENTISSAGE**.

## Vue d'ensemble

```text
Navigateur (mobile-first, sidebar desktop / navigation basse mobile)
        │  Server Components + Server Actions + Route Handlers (Next.js 15, App Router)
        ▼
app/ ──► domain/ (règles métier pures + services) ──► repositories/ ──► PostgreSQL (Prisma)
  │            ▲                                         ▲
  │            │ données internes uniquement             │
  └──► ai/ ────┘                                         │
  └──► datahub/ ──► providers/ (Planity, Instagram, TikTok)
```

Flux d'une donnée externe : `Provider → DataHub (normalisation, matching, déduplication) → modèles internes → Repository → Domain → Analytics / IA → UI`.

## Couches

| Dossier | Rôle | Règles |
|---|---|---|
| `src/app/` | Pages, server actions, route handlers | N'importe **jamais** un provider (règle ESLint `no-restricted-imports`). Toute action passe par `guarded()` (session + rate limit + erreurs). |
| `src/components/` | Design system (UI), graphiques (Recharts, chargement différé), composants métier | Aucune logique de données. |
| `src/providers/` | Connecteurs externes : `planity/` (lecture d'exports CSV/XLSX), `instagram/`, `tiktok/` (OAuth) | Renvoient des modèles **externes**. Statut `CONFIGURATION_REQUIRED` sans configuration. |
| `src/datahub/` | `normalization/` (texte, email, téléphone E.164, similarité), `matching/`, `deduplication/` (clés déterministes), `import/` (pipeline Planity, upload sécurisé, rollback), `social/` (OAuth, sync), `demo/`, `export/`, `privacy/` | Seule couche autorisée à appeler les providers. |
| `src/domain/` | `revenue`, `clients`, `content`, `goals`, `missions`, `attribution`, `analytics`, `recommendations`, `onboarding` | Fonctions pures testables + services qui lisent via repositories. **Une métrique = une définition** (`domain/analytics/snapshot.ts`). |
| `src/ai/` | `providers/` (AIProvider interchangeable), `context/` (ContextBuilder), `prompts/`, `coach/`, `content/` (générateur), `memory/`, `learning/`, `recommendations/` (orchestration) | Voir `docs/AI.md`. |
| `src/repositories/` | Accès Prisma | **Chaque fonction prend `userId`** et filtre dessus ; mises à jour/suppressions via `updateMany/deleteMany({ id, userId })`. |
| `src/lib/` | `db`, `auth`, `crypto`, `logger`, `rate-limit`, `validation` (Zod), `env`, dates (fuseau Europe/Zurich), argent (centimes CHF) | Transverse. |

## Base de données

PostgreSQL + Prisma (`prisma/schema.prisma`). Points clés :
- Tous les modèles utilisateur portent `userId` (SaaS-ready, cascade à la suppression du compte).
- Données externes : `source`, `externalId`, `importedAt`, `lastSyncedAt`, `sourceUpdatedAt` ; unicité `userId + source + externalId`.
- Montants en **centimes** (`Int`).
- **Snapshots** jamais écrasés : `ContentMetric`, `SocialMetric` (unicité `userId+platform+capturedAt+source`).
- Anti double-comptage : `Appointment.dedupKey` (clé métier : client + minute + prestation), `Revenue` lié 1:1 au rendez-vous, `Revenue.reviewStatus` (`OK` / `NEEDS_REVIEW` / `DUPLICATE_IGNORED`).
- Rollback d'import exact : `ImportChange` (journal CREATED/UPDATED avec état précédent).
- Revue de correspondances : `ClientMatchReview` (aucune fusion automatique sur ressemblance de nom).
- Emails/téléphones clients : chiffrés (`emailEnc`/`phoneEnc`) + index aveugle HMAC (`emailHash`/`phoneHash`).

## Authentification

Auth.js v5 (Credentials, sessions JWT signées par `AUTH_SECRET`), mots de passe **bcrypt** (coût 12). Protection en deux niveaux : middleware (edge, redirection vers `/login`) **et** `requireUser()/requireOnboardedUser()` côté serveur dans chaque page/action ; l'identifiant utilisateur provient uniquement de la session.

## Cohérence des métriques

`buildSnapshot()` (`domain/analytics/snapshot.ts`) construit l'unique agrégat utilisé par le Dashboard, l'Analyse, le Coach IA, les Missions et le Next Best Action. Définitions documentées en tête de `domain/revenue/metrics.ts` et `domain/clients/metrics.ts`.

## Sécurité

Voir `docs/SECURITY.md`.

## Choix techniques (écarts justifiés)

- **Next.js 15.5 / Prisma 6.19 / Auth.js 5 beta / Zod 3 / Vitest 3** : combinaisons stables (Next 16 et Prisma 8 RC jugés trop récents).
- **bcryptjs** plutôt qu'argon2 : JS pur, aucune compilation native à l'installation (le cahier des charges autorise les deux).
- **exceljs** plutôt que SheetJS/xlsx : le paquet npm `xlsx` n'est plus maintenu sur npm et a des vulnérabilités connues.
- **Pas de `loading.tsx` au niveau du segment `(app)`** : combiné à `revalidatePath()` dans les server actions, il provoquait des blocages intermittents du formulaire (reproduits puis éliminés par test en boucle).
