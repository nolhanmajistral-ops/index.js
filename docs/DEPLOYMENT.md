# Déploiement

## 1. Prérequis
- Node.js **22** (LTS) et npm 10
- PostgreSQL **16** (local, Docker, ou managé : Neon, Supabase, Railway, Scaleway, Infomaniak…)
- Un domaine et HTTPS (fourni par l'hébergeur ou un reverse proxy)

## 2. Installation locale

```bash
git clone https://github.com/nolhanmajistral-ops/index.js.git nolhan-os
cd nolhan-os
npm install                      # installe et génère le client Prisma
cp .env.example .env             # puis remplir (voir §3)
docker compose up -d db          # PostgreSQL local (ou ton propre PostgreSQL)
npx prisma migrate deploy        # crée les tables
npm run db:seed                  # optionnel : compte DEMO + 8 semaines de données DEMO
npm run build
npm start                        # http://localhost:3000
```

Développement : `npm run dev`.

## 3. Variables d'environnement

| Nom | Rôle | Obligatoire | Comment l'obtenir |
|---|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL | Oui | URL fournie par ton PostgreSQL. Local docker : `postgresql://nolhan:nolhan@localhost:5432/nolhan_os?schema=public` |
| `APP_URL` | URL publique, sans `/` final | Oui | ex. `https://os.mondomaine.ch` |
| `AUTH_SECRET` | Signature des sessions | Oui | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | Derrière un proxy | Oui (`true`) | — |
| `ENCRYPTION_KEY` | Chiffrement AES-256-GCM | Oui | `openssl rand -base64 32` (exactement 32 octets). **À sauvegarder.** |
| `ALLOW_REGISTRATION` | Autoriser les inscriptions | Non (défaut `true`) | Mettre `false` après création de ton compte |
| `LOG_LEVEL` | Verbosité | Non (`info`) | `debug`/`info`/`warn`/`error` |
| `IMPORT_MAX_FILE_MB` | Taille max d'import | Non (`5`) | — |
| `AI_PROVIDER` | `none` ou `anthropic` | Non (`none`) | — |
| `ANTHROPIC_API_KEY` | Clé Claude | Si `anthropic` | console.anthropic.com → API Keys |
| `AI_MODEL` | Modèle Claude | Non (`claude-opus-5-5`) | — |
| `INSTAGRAM_APP_ID` / `_SECRET` / `_REDIRECT_URI` | OAuth Instagram | Non | `docs/INSTAGRAM.md` |
| `TIKTOK_CLIENT_KEY` / `_SECRET` / `_REDIRECT_URI` | OAuth TikTok | Non | `docs/TIKTOK.md` |
| `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` | Compte du seed DEMO | Pour `db:seed` | Mot de passe ≥ 10 caractères de ton choix |

## 4. Production

### Option A — Docker (VPS, Fly.io, Railway, Render…)
```bash
docker build -t nolhan-os .
docker run -d --env-file .env -p 3000:3000 nolhan-os
# ou, avec la base incluse :
docker compose --profile app up -d --build
```
L'image (Next.js `standalone`, utilisateur non-root) applique `prisma migrate deploy` au démarrage. Sonde de santé : `GET /api/health`.

### Option B — Node directement
```bash
npm ci && npx prisma migrate deploy && npm run build && npm start
```
Utiliser un gestionnaire de processus (systemd, pm2) et un reverse proxy (Caddy/Nginx).

### Seed DEMO en production
Refusé par défaut. Pour une démo : `ALLOW_DEMO_SEED=true NODE_ENV=production npm run db:seed`. Les données DEMO sont supprimables depuis Réglages.

## 5. Domaine & HTTPS
- Pointer un enregistrement DNS `A`/`CNAME` vers l'hébergeur.
- HTTPS : automatique chez la plupart des PaaS ; sur VPS, Caddy (`os.mondomaine.ch { reverse_proxy localhost:3000 }`) obtient le certificat Let's Encrypt automatiquement.
- Mettre `APP_URL=https://os.mondomaine.ch` et les redirect URI OAuth sur ce domaine. HSTS est envoyé par l'application.

## 6. Migrations
Toujours `npx prisma migrate deploy` (non destructif) en production. Nouvelle migration en dev : `npm run db:migrate -- --name <nom>`.

## 7. Sauvegardes
- Base : `pg_dump "$DATABASE_URL" -Fc -f nolhan-$(date +%F).dump` quotidien (cron) + rétention 30 jours, copie hors serveur ; restauration `pg_restore -d "$DATABASE_URL" --clean nolhan-AAAA-MM-JJ.dump`. Les bases managées proposent des sauvegardes automatiques (PITR) : les activer.
- Sauvegarder **séparément** `ENCRYPTION_KEY` et `AUTH_SECRET` (gestionnaire de mots de passe).
- Export applicatif complet : Réglages → « Tout exporter (JSON) ».

## 8. Logs
Logs JSON sur stdout (collectés par l'hébergeur, `docker logs`, ou journald). Événements clés : `auth.*`, `sync.started/completed`, `import.*`, `action.failed`, `demo.*`. Aucun mot de passe, jeton, email ou téléphone n'est journalisé.

## 9. Tests
```bash
createdb nolhan_os_test            # base dédiée aux tests (son nom doit contenir "test")
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/nolhan_os_test npm test
npm run build && npm start &       # puis :
npm run test:e2e                   # Playwright (Chromium)
```
Les tests E2E créent plusieurs comptes : la limite d'inscription (5/h par IP) impose de redémarrer le serveur entre deux exécutions.

## 10. Plusieurs instances
Le rate limiting est en mémoire (par instance) : pour un déploiement multi-instances, brancher un store partagé (Redis) dans `src/lib/rate-limit`.
