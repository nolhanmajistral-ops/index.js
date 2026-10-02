# Instagram — intégration préparée (inactive par défaut)

> **État : préparé, non activé, non testé contre l'API réelle de Meta** (aucune application Meta n'est configurée dans ce projet). Sans configuration, le statut est **toujours `Configuration required`** et aucune donnée n'est simulée. En attendant, utilise les **snapshots manuels** (page Réseaux).
> Les procédures Meta évoluent : vérifie chaque étape sur developers.facebook.com au moment de la configuration.

## Ce que fait l'intégration

- Connexion via **OAuth officiel** « Instagram API with Instagram Login ». Aucun mot de passe Instagram n'est demandé ni stocké.
- Échange du code → jeton courte durée → **jeton longue durée** (~60 jours), stocké **chiffré** (AES-256-GCM) en base.
- Synchronisation : `GET https://graph.instagram.com/me?fields=user_id,username,followers_count,media_count` → snapshot `SocialMetric` (source `INSTAGRAM`) avec **uniquement** les valeurs reçues. Vues/likes agrégés non récupérés ⇒ `null` et statut `Partial` (jamais `Connected` si incomplet).
- Code : `src/providers/instagram/provider.ts`, orchestration `src/datahub/social/service.ts`, routes `src/app/api/integrations/[platform]/{connect,callback}`.

## Prérequis

1. Un compte Instagram **professionnel** (Créateur ou Entreprise).
2. Un compte Meta for Developers.

## Configuration Meta

1. developers.facebook.com → **Créer une app** (type Business).
2. Ajouter le produit **Instagram** → « API setup with Instagram login ».
3. Récupérer l'**Instagram App ID** et l'**Instagram App Secret**.
4. **Redirect URI OAuth valide** : `https://<ton-domaine>/api/integrations/instagram/callback` (doit correspondre exactement à `INSTAGRAM_REDIRECT_URI`).
5. Permissions (scopes) demandées : `instagram_business_basic`, `instagram_business_manage_insights`.
6. En mode développement, ajouter ton compte Instagram comme testeur. Pour un usage hors testeurs, Meta exige une **App Review** des permissions.

## Variables d'environnement

| Variable | Valeur |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram App ID |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret (secret serveur, jamais côté client) |
| `INSTAGRAM_REDIRECT_URI` | `https://<ton-domaine>/api/integrations/instagram/callback` |

Redémarrer l'application après modification.

## Procédure de connexion

Réseaux → Instagram → **Connecter (OAuth officiel)** → autorisation chez Instagram → retour sur `/social?connected=instagram`. Un paramètre `state` aléatoire (cookie httpOnly, 10 min) est vérifié au retour (anti-CSRF). « Synchroniser » crée un nouveau snapshot ; « Déconnecter » efface les jetons.

## Limites

- Jeton longue durée ≈ 60 jours : à renouveler (reconnexion) — le rafraîchissement automatique n'est pas encore implémenté.
- Limites de débit de la Graph API ; insights par média non intégrés (prochaine étape : `/{media-id}/insights`).
- Comptes personnels non supportés par l'API.
