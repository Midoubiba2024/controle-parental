# Contrôle Parental — Documentation projet

Application de **contrôle parental transparent et légal** pour Android, conçue pour couvrir
deux profils : un **jeune enfant (~6 ans)** et un **adolescent (~12 ans)**, avec un niveau
d'intrusivité adaptatif selon l'âge.

> **Principe fondateur, non négociable : transparence.** L'application est visible, déclarée,
> consentie, et ne capte jamais le contenu privé des correspondances ni n'enregistre à l'insu.
> C'est ce qui sépare un contrôle parental **légal** d'un *stalkerware* (illégal et bannissable).
> Voir [`02-CONFORMITE.md`](02-CONFORMITE.md).

## Sommaire

| Doc | Contenu |
|-----|---------|
| [`00-PLAN-ACTION.md`](00-PLAN-ACTION.md) | Vision, stack technique, phases, séquencement, décisions à trancher |
| [`01-CAHIER-DES-CHARGES.md`](01-CAHIER-DES-CHARGES.md) | Spécification **détaillée fonction par fonction** (description, 6 ans / 12 ans, API Android, garde-fou légal, priorité) |
| [`02-CONFORMITE.md`](02-CONFORMITE.md) | Cadre juridique (RGPD/CNIL, COPPA), ligne rouge, garde-fous obligatoires, fonctions **exclues** |
| [`03-ARCHITECTURE.md`](03-ARCHITECTURE.md) | Composants, modèle de données, Supabase, sécurité (RLS, chiffrement) |
| [`04-LOTS.md`](04-LOTS.md) | Découpage en **lots** (work packages), dépendances, ordre d'attaque |

## État du projet

- **Dépôt** : greenfield (vierge au démarrage — aucun legacy, architecture propre).
- **Cible** : Android (natif Kotlin pour l'app enfant), console parent web + app parent mobile.
- **Backend** : Supabase (Postgres + Auth + Realtime + Edge Functions + Storage).
- **Phase actuelle** : cadrage terminé → prêt à attaquer le **LOT 0 (Socle & Conformité)**.

## Avertissement

Ce dossier décrit des exigences techniques et une analyse de conformité à titre d'ingénierie.
Il **ne constitue pas un avis juridique**. Avant mise en service, faire valider l'AIPD/DPIA et
la politique de confidentialité par un juriste / DPO (contexte CNIL pour la France).
