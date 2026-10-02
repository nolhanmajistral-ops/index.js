# Sécurité & données personnelles (nLPD)

## Authentification & autorisation
- Auth.js v5, sessions JWT signées (`AUTH_SECRET`), cookies httpOnly ; mots de passe **bcrypt** (coût 12), temps de réponse constant si l'email n'existe pas.
- Inscriptions désactivables (`ALLOW_REGISTRATION=false`).
- Middleware (redirection) **et** contrôle serveur systématique (`requireUser`, `requireOnboardedUser`, `requireApiUser`). Le `userId` vient toujours de la session, jamais du client.
- Repositories : toute requête filtre par `userId` ; mises à jour/suppressions avec `{ id, userId }`. Testé (`tests/repositories.isolation.test.ts`, E2E : accès à la fiche d'un autre compte ⇒ 404).

## Validation & upload
- Zod sur toutes les entrées (formulaires, API, mapping d'import).
- Upload : taille max (`IMPORT_MAX_FILE_MB`), extension, MIME, signature binaire, limite de 20 000 lignes, parsing côté serveur uniquement, fichier jamais stocké sur disque.
- Exports CSV protégés contre l'injection de formules.

## Rate limiting
En mémoire (fenêtre glissante) : connexion 10/15 min par email (+30 par IP), inscription 5/h par IP, import 20/h, IA 30/h, export 30/h, actions 300/h. Pour plusieurs instances : remplacer le store par Redis (`src/lib/rate-limit`).

## Chiffrement & secrets
- AES-256-GCM (`ENCRYPTION_KEY`, 32 octets) pour emails/téléphones clients et jetons OAuth ; recherche par index aveugle HMAC-SHA256 scopé par utilisateur.
- Secrets uniquement dans les variables d'environnement serveur (aucune variable `NEXT_PUBLIC_*`), `.env` ignoré par Git, `.env.example` sans valeur réelle.
- ⚠️ Perdre `ENCRYPTION_KEY` rend les emails/téléphones/jetons illisibles : la sauvegarder hors du serveur.

## En-têtes HTTP
CSP stricte (`default-src 'self'`, `frame-ancestors 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`.

## OAuth
Paramètre `state` aléatoire en cookie httpOnly (10 min), comparaison à temps constant. Jetons jamais renvoyés au frontend.

## Logs
JSON structurés ; masquage automatique des clés sensibles (mot de passe, token, secret, cookie, email, téléphone…). Imports/syncs : started, completed, records, errors, duration, status.

## Données personnelles (nLPD)
- **Minimisation** : seules les données utiles sont demandées ; notes avec rappel de minimisation.
- **Export client** (droit d'accès) : fiche client → « Exporter (NLPD) » (JSON).
- **Suppression client** : fiche client → « Supprimer » (identifiants et attributions supprimés, rendez-vous anonymisés pour conserver le CA historique).
- **Rétention** : réglable (min. 6 mois, défaut 36) ; « Appliquer la politique de rétention » supprime rendez-vous, revenus, leads et journaux plus anciens, et les clients sans visite récente.
- **Suppression globale** : Réglages → « Supprimer mon compte » (cascade complète).
- **Journal d'audit** : actions sensibles tracées sans données personnelles.
