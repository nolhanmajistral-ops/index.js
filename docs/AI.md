# NOLHAN AI

Couche IA **indépendante du frontend** : l'interface appelle des services (`askCoach`, `generateContentIdea`, `getNextMove`…) et ne connaît aucun fournisseur LLM.

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
PromptEngine (prompts système stables)  src/ai/prompts/system.ts
AIProvider (interchangeable)            src/ai/providers/{types,anthropic,none,index}.ts
MemoryEngine                            src/ai/memory/memory-engine.ts
```

## Fournisseur IA

| `AI_PROVIDER` | Comportement |
|---|---|
| `none` (défaut) | **Mode déterministe** : réponses construites par règles à partir des données réelles. Aucun appel externe. |
| `anthropic` | Claude via le SDK officiel `@anthropic-ai/sdk`. Modèle `AI_MODEL` (défaut `claude-opus-5-5`), effort `medium`, repli serveur en cas de refus (`fallbacks: "default"`). Requiert `ANTHROPIC_API_KEY`. |

Ajouter un fournisseur = implémenter `AIProvider` (`isConfigured()`, `complete({ system, messages })`) et l'enregistrer dans `getAIProvider()`. En cas d'erreur ou de refus du LLM, le coach renvoie la réponse déterministe et le signale.

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

Uniquement le **contexte résumé** : agrégats (CA, panier moyen, nombres de clients, récurrence, mix de services, CA par canal), statuts des intégrations, titres/formats/hooks des contenus, objectifs, anomalies, prochain move, mémoire, recommandations et expériences passées, ainsi que la question et les 6 derniers messages.
**Jamais** : noms, emails, téléphones ou notes de clients, identifiants internes, jetons, secrets. Testé dans `tests/ai.test.ts` (le payload ne contient pas les données personnelles d'un client existant).

## Garde-fous (prompt système)

Pas de chiffre inventé ; « Données insuffisantes pour conclure. » quand c'est le cas ; faits et hypothèses distingués ; données DEMO signalées ; aucune promesse de résultat ; une recommandation principale.

## Limites

- Le mode déterministe couvre les 8 questions types du cahier des charges ; les questions libres hors périmètre reçoivent le prochain move.
- L'évaluation ne contrôle pas les facteurs externes (saisonnalité…).
- Le coût d'un appel LLM dépend du fournisseur ; aucune clé n'est fournie.
