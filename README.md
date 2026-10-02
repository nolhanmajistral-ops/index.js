# NOLHAN OS

Système de pilotage personnel de **Nolhan Yildirim — Barber — Lausanne** : business, clients, rendez-vous (Planity), CA, contenus Instagram/TikTok, objectifs, missions, analytics, attribution, recommandations et coach IA.

**DONNÉES → ANALYSE → INSIGHT → ACTION → RÉSULTAT → APPRENTISSAGE** — avec une question centrale : *qu'est-ce que Nolhan doit faire maintenant ?*

## Démarrage rapide

```bash
npm install
cp .env.example .env        # remplir DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY (openssl rand -base64 32)
docker compose up -d db
npx prisma migrate deploy
npm run db:seed             # optionnel : compte DEMO (SEED_DEMO_EMAIL / SEED_DEMO_PASSWORD)
npm run build && npm start  # http://localhost:3000
```

## Stack
Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · PostgreSQL · Prisma 6 · Auth.js 5 · bcrypt · Zod · Recharts · PapaParse · exceljs · Vitest · Playwright · Docker Compose · SDK Anthropic (optionnel).

## Scripts
| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement / build / production |
| `npm run typecheck` / `lint` | TypeScript / ESLint (dont la règle d'architecture « pas de provider dans app/ et domain/ ») |
| `npm test` | Vitest (unitaires + intégration PostgreSQL, base `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright (serveur lancé sur :3000) |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Migrations / seed DEMO |
| `npm run samples` | Régénère `docs/samples/planity-sample.{csv,xlsx}` |

## Documentation
- [Architecture](docs/ARCHITECTURE.md) · [Déploiement](docs/DEPLOYMENT.md) · [Sécurité & nLPD](docs/SECURITY.md)
- [Planity](docs/PLANITY.md) · [Instagram](docs/INSTAGRAM.md) · [TikTok](docs/TIKTOK.md) · [IA](docs/AI.md)

## Note
`index.js` à la racine est un fichier antérieur (API ffmpeg) sans lien avec NOLHAN OS ; il est conservé tel quel et exclu du lint/TypeScript.
