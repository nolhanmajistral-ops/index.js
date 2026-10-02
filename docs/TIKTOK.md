# TikTok — intégration préparée (inactive par défaut)

> **État : préparé, non activé, non testé contre l'API réelle de TikTok** (aucune application TikTok n'est configurée). Sans configuration : statut **`Configuration required`**, aucune donnée simulée. En attendant : snapshots manuels (page Réseaux).
> Vérifie chaque étape sur developers.tiktok.com au moment de la configuration.

## Ce que fait l'intégration

- OAuth officiel **Login Kit (v2)** — aucun mot de passe TikTok demandé ni stocké.
- Échange du code (`POST https://open.tiktokapis.com/v2/oauth/token/`) → access/refresh tokens stockés **chiffrés**.
- Synchronisation : `GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count` → snapshot (source `TIKTOK`) avec les seules valeurs reçues ; vues non fournies ⇒ `Partial`.
- Code : `src/providers/tiktok/provider.ts`.

## Prérequis

Un compte TikTok et un compte **TikTok for Developers**.

## Application TikTok

1. developers.tiktok.com → **Manage apps** → créer une app.
2. Ajouter les produits **Login Kit** et l'accès aux informations utilisateur (Display API).
3. Scopes : `user.info.basic`, `user.info.stats`, `video.list`.
4. **Redirect URI** : `https://<ton-domaine>/api/integrations/tiktok/callback` (HTTPS obligatoire, correspondance exacte).
5. Renseigner les informations demandées (politique de confidentialité, conditions, description) et **soumettre l'app à validation** ; certains scopes ne sont utilisables qu'après approbation.

## Variables d'environnement

| Variable | Valeur |
|---|---|
| `TIKTOK_CLIENT_KEY` | Client key |
| `TIKTOK_CLIENT_SECRET` | Client secret (serveur uniquement) |
| `TIKTOK_REDIRECT_URI` | `https://<ton-domaine>/api/integrations/tiktok/callback` |

## Procédure

Réseaux → TikTok → **Connecter (OAuth officiel)** → autorisation → retour `/social?connected=tiktok`. Vérification du `state` anti-CSRF.

## Limites

- Access token court (≈ 24 h) : le rafraîchissement automatique via refresh token n'est pas encore implémenté (reconnexion nécessaire).
- Statistiques par vidéo (`video.list`) non encore exploitées.
- Quotas de l'API TikTok.
