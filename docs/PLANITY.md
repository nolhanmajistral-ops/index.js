# Planity

> **Planity ne propose pas d'API publique documentée.** NOLHAN OS n'invente aucune API et ne simule aucune synchronisation. La seule source réelle est l'**export CSV/XLSX** que tu télécharges depuis ton espace Planity. Statut affiché : `Configuration required` tant qu'aucun import n'a réussi, puis `Connected (import)`.

## Import (page `/planity`)

1. **Upload** (`.csv` ou `.xlsx`, `IMPORT_MAX_FILE_MB` Mo max, défaut 5). Contrôles : extension, type MIME, signature binaire (un `.xlsx` doit être un zip, un `.csv` ne doit pas contenir d'octets binaires), taille.
2. **Parsing** côté serveur (PapaParse pour CSV — séparateur `;`, `,` ou tabulation détecté, UTF-8 ou Latin-1 ; exceljs pour XLSX, première feuille).
3. **Détection de la ligne d'en-tête** : première ligne (parmi les 15 premières) contenant ≥ 2 colonnes reconnues (un bandeau au-dessus est donc toléré).
4. **Mapping** automatique (synonymes FR/EN ci-dessous), modifiable dans l'interface.
5. **Aperçu** : tout le pipeline est exécuté dans une transaction **annulée** (dry-run) → rapport exact, aucune écriture.
6. **Import** transactionnel → **déduplication** → **matching clients** → **rapport**.

### Colonnes reconnues (insensible à la casse/aux accents)

| Champ | Synonymes |
|---|---|
| Date * | Date, Date RDV, Date du rendez-vous, Appointment date, Jour, Date et heure, Début, Start |
| Heure | Heure, Time, Heure RDV, Start time, Horaire |
| Client | Client, Nom client, Customer, Customer name, Nom complet, Full name, Name, Nom* |
| Prénom / Nom | Prénom, First name / Nom de famille, Last name, Surname (*« Nom » = nom de famille si une colonne Prénom existe, sinon nom complet) |
| Email | Email, E-mail, Mail, Courriel |
| Téléphone | Téléphone, Tel, Phone, Mobile, Portable, Natel |
| Prestation * | Prestation(s), Service(s), Soin |
| Prix | Prix, Price, Montant, Amount, Total, Tarif |
| Statut | Statut, Status, État |
| ID | ID, ID RDV, Booking ID, Appointment ID, Référence |
| Source déclarée | Comment nous as-tu trouvé ?, Source, How did you find us, Canal, Provenance |
| Notes | Notes, Commentaire, Comment, Remarques |

Statuts : Honoré/Terminé/Effectué/Completed/Done → réalisé ; Annulé/Cancelled → annulé ; Absent/No show → absent ; Confirmé/Réservé/Booked/Upcoming → réservé. Statut **absent** : passé ⇒ supposé réalisé, futur ⇒ réservé (signalé dans le rapport). Statut **inconnu** ⇒ ligne en erreur.
Formats de date : `JJ/MM/AAAA`, `JJ.MM.AA`, `AAAA-MM-JJ`, avec heure optionnelle ; dates Excel natives. Interprétées dans le fuseau **Europe/Zurich**.
Prix : `55`, `55.50`, `55,50`, `CHF 55.-`, `1'250.00`. Prix absent ⇒ prix catalogue, revenu marqué **estimé**.

## Déduplication

- Rendez-vous : `source + externalId` si l'export fournit un ID, sinon clé métier déterministe `client + minute + prestation` (`datahub/deduplication/keys.ts`). Réimporter le même fichier ⇒ **0 nouvelle ligne** (testé en CSV puis XLSX).
- Doublons dans le fichier (même ID) ⇒ comptés comme doublons.
- **Anti double-comptage avec les saisies manuelles** : si un revenu manuel existe le même jour pour le même client et le même montant, il passe en `Doublon ignoré` (le revenu Planity fait foi) ; si c'est ambigu ⇒ `À vérifier`. Ces modifications sont annulées par le rollback.

## Matching clients

| Niveau | Règle | Effet |
|---|---|---|
| CERTAIN | email identique, téléphone identique, ou même fiche source (client créé par un import Planity précédent avec le même nom et sans contact) | Rattachement automatique |
| PROBABLE | nom + prénom normalisés identiques | Nouveau client + entrée dans la file **À vérifier** |
| À VÉRIFIER | similarité Jaro-Winkler ≥ 0,90 | Nouveau client + entrée dans la file |
| UNKNOWN | aucune correspondance | Nouveau client |

Dans un même fichier, les lignes d'une même personne (même email/téléphone, ou même nom sans contact) sont regroupées. File de revue : `/clients/review` (Fusionner / Ignorer / détails), décisions tracées dans l'audit.

## Rollback (« Annuler cet import »)

Chaque écriture est journalisée (`ImportChange`). Le rollback rejoue le journal à l'envers : supprime ce que l'import a créé (revenus, rendez-vous, revues, attributions, identifiants, clients, prestations non utilisées ailleurs) et restaure ce qu'il a modifié (statut des revenus manuels). Un import ne peut être annulé qu'une fois ; après annulation, le fichier peut être réimporté.

## Traçabilité

`ImportBatch` (lignes, importées, ignorées, doublons, erreurs, mapping, rapport), `ImportRowError` (ligne, valeur, erreur, correction suggérée), `SyncJob`/`SyncLog` (début, fin, enregistrements, erreurs, durée, statut).

## Fichiers de test

`docs/samples/planity-sample.csv` (colonnes FR, `;`) et `docs/samples/planity-sample.xlsx` (colonnes EN) — **DONNÉES FICTIVES — TEST UNIQUEMENT** : 24 lignes avec doublon, 4 lignes erronées volontaires, clients récurrents, prix manquant, statuts variés, nom proche (Dupont/Dupond). Régénération : `npm run samples`.

## Intégration officielle future

Si Planity publie une API partenaire : implémenter `connect()/sync()` dans `src/providers/planity/provider.ts` en renvoyant les mêmes modèles externes ; le DataHub (matching, déduplication, rollback) reste inchangé.
