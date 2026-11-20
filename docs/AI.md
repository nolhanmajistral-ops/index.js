# NOLHAN AI

Couche IA **indépendante du frontend** : l'interface appelle des services (`askCoach`, `runStudio`, `getNextMove`…) et ne connaît aucun fournisseur LLM.

## Architecture

```text
Données internes (repositories)
   ↓ loadDataset()                      src/repositories/analytics.ts
AnalyticsEngine  buildSnapshot()        src/domain/analytics/snapshot.ts  (métriques à définition unique)
                 detectAnomalies()      src/domain/analytics/anomalies.ts
   ↓
RecommendationEngine (déterministe)     src/domain/recommendations/{rules,engine}.ts
   ↓  pondéré par LearningEngine        src/ai/learning/learning-engine.ts
TON PROCHAIN MOVE + missions (≤ 5)      src/ai/recommendations/service.ts, src/domain/missions/generator.ts
   ↓
ContextBuilder (résumé, sans PII)       src/ai/context/context-builder.ts
PromptEngine (prompts système stables)  src/ai/prompts/system.ts (coach), src/ai/studio/methods.ts (Studio)
Style humain (règles + nettoyage)       src/ai/style/humanize.ts
Studio contenu                          src/ai/studio/{modes,methods,studio}.ts → /studio, /api/ai/studio
AIProvider (interchangeable)            src/ai/providers/{types,anthropic,none,index}.ts
MemoryEngine                            src/ai/memory/memory-engine.ts
```

## Fournisseur IA

| `AI_PROVIDER` | Comportement |
|---|---|
| `none` (défaut) | **Mode déterministe** : réponses construites par règles à partir des données réelles. Aucun appel externe. |
| `anthropic` | Claude via le SDK officiel `@anthropic-ai/sdk`, **en flux** (affichage progressif). Modèle `AI_MODEL` (défaut `claude-opus-5-5`), effort `medium`, prompt système mis en cache, repli serveur en cas de refus (`fallbacks: "default"`). Recherche web (`web_search_20260209`, 3 recherches max, localisée à Lausanne) si `AI_WEB_SEARCH=true` : sources affichées ; si le compte la refuse, nouvelle tentative sans recherche. Requiert `ANTHROPIC_API_KEY`, sinon mode sans IA. |

Ajouter un fournisseur = implémenter `AIProvider` (`isConfigured()`, `complete(request)`, optionnellement `stream(request, handlers)`) et l'enregistrer dans `getAIProvider()`. En cas d'erreur ou de refus du LLM, le coach renvoie la réponse déterministe et le signale.

## Coach IA (`/ai`, `/api/ai/coach`)

Prompt d'**expert de la niche barber** (`COACH_SYSTEM_PROMPT`) : acquisition locale (Google Business Profile, Planity, contenu local, collaborations, parrainage), formats vidéo qui marchent, remplissage de l'agenda, panier moyen, prix, fidélisation. Les chiffres de Nolhan viennent uniquement du bloc `<donnees_nolhan_os>` ; le savoir-faire est présenté comme bonne pratique ; les tendances passent par la recherche web avec sources. Il répond à **la** question posée (pas toujours au prochain move), en 120-250 mots, et finit par « Action du jour ». Réponse en flux NDJSON (`status`, `text`, `done`, `error`).

Sans clé : `deterministicAnswer()` reconnaît 17 sujets (brief du jour, créneaux vides, tendances, lapins, avis Google, prix, relances, DM, stories, panier, CA, clients, contenu…) et répond avec les chiffres réels ; les idées de vidéos/stories varient selon le jour. Les tendances ne sont jamais inventées sans recherche web.

## Studio contenu (`/studio`, `/api/ai/studio`)

11 modes inspirés des skills de création de contenu de Nolhan, réécrits en français et adaptés au barber : script Reel/TikTok (14 formules d'accroche notées sur 10, cartons écran séparés, plans, relance, boucle), légende (rôle A/B, 5 hashtags max, mots recherchés), stories du jour (sticker, créneaux libres), plan de la semaine, carrousel, messages/DM/avis (jamais de prospection de masse), commentaire chez un autre compte, audit des contenus (multiple de la médiane), note de profil sur 100, recyclage d'un long contenu, tendances (recherche web obligatoire, sources). Rien n'est publié automatiquement. Sans clé : trames à compléter et audit calculé.

## Style humain

`STYLE_RULES` (mots et tournures typiques d'IA en français à éviter, pas de tiret long, pas d'appâts creux) est inclus dans tous les prompts ; `cleanText()` retire ensuite les caractères invisibles, tirets longs, apostrophes courbes.

## RecommendationEngine

Règles déterministes (`rules.ts`) : import Planity manquant, snapshot Instagram périmé, clients réguliers en retard, upsell barbe, écart à l'objectif de CA, publication du meilleur format, pipeline de contenu vide, analyse du meilleur contenu, leads en attente, attribution inconnue, avis Google, taux d'absence, file de revue. Chaque candidat contient : action, **pourquoi** (faits chiffrés), **données utilisées**, **résultat attendu** (formulé comme objectif/hypothèse), **confiance**, métrique d'évaluation.

Priorité (§57) : lié à un objectif (30) > données réelles (25) > réalisable (15) > mesurable (15) > apprentissage (10) + urgence (0-25), × poids appris par règle (0,6–1,4), × 0,5 si la mission a été ignorée ≥ 2 fois en 7 jours.

## Learning loop

Observation → Recommandation (persistée avec sa **baseline**) → Action (Done / Partially done / Skipped, via le dashboard ou une mission) → Résultat → **Évaluation** (même métrique, même durée, avant vs après ; seuil ±5 % ; `INCONCLUSIVE` sans données) → **Mémoire** (`RECOMMENDATION_OUTCOME`, `DECISION`) → poids des règles pour les recommandations futures. L'évaluation est une **corrélation**, explicitement signalée comme telle. Déclenchement : bouton « Évaluer les résultats maintenant » (page Coach IA) ou `runLearningCycle(userId)`.

## Expériences

`AiExperiment` : hypothèse, action, durée, résultat attendu, métriques suivies, résultat réel, conclusion, verdict. Les conclusions sont ajoutées à la mémoire et au contexte du coach.

## Mémoire

`AiMemory` : objectifs, préférences, formats préférés/évités, expériences, décisions, résultats. Alimentée par l'onboarding, les objectifs, les missions, les évaluations ; éditable (ajout/suppression) sur `/ai`.

## Données envoyées au modèle (si `AI_PROVIDER=anthropic`)

Uniquement le **contexte résumé** : agrégats (CA, panier moyen, nombres de clients, récurrence, mix de services, CA par canal), statuts des intégrations, titres/formats/hooks des contenus, objectifs, anomalies, prochain move, mémoire, recommandations et expériences passées, habitudes du planning (jours/tranches remplis, charge des 7 prochains jours), tarifs, contenus récents mesurés (Studio), ainsi que la question et les 8 derniers messages.
**Jamais** : noms, emails, téléphones ou notes de clients, identifiants internes, jetons, secrets. Testé dans `tests/ai.test.ts` (le payload ne contient pas les données personnelles d'un client existant).

## Garde-fous (prompt système)

Pas de chiffre inventé ; « Données insuffisantes pour conclure. » quand c'est le cas ; faits et hypothèses distingués ; données DEMO signalées ; aucune promesse de résultat ; une recommandation principale.

## Limites

- Sans clé, les questions hors des 17 sujets reconnus reçoivent un menu de ce que le coach sait faire, avec un résumé chiffré.
- L'évaluation ne contrôle pas les facteurs externes (saisonnalité…).
- Coût : facturé par Anthropic à l'usage (≈ 0,05-0,10 $ par réponse avec Opus 5.5, plus la recherche web) ; limite de 30 requêtes IA par heure et par utilisateur. Aucune clé n'est fournie.
