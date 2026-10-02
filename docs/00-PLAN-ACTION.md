# Plan d'action

## 1. Vision produit

Une suite de contrôle parental **transparente, familiale et évolutive**, qui égale ou dépasse les
leaders du marché (Google Family Link, Apple Screen Time, Qustodio, Bark, Norton Family, Life360,
Kaspersky Safe Kids, Mobicip) **sur le terrain légal uniquement** — et se différencie par :

1. **La transparence comme fonctionnalité** (pas juste une contrainte) : tableau de bord « mes
   données » côté enfant, journal d'audit des actions parent visible, visibilité mutuelle. C'est un
   argument de confiance qu'aucun stalkerware ne peut offrir, et c'est ce qui rend l'app publiable.
2. **Deux profils dans une même app** : curseur d'intrusivité dégressif avec l'âge (6 ans = cadre
   fort ; 12 ans = autonomie + transparence accrue).
3. **Co-régulation** : l'enfant demande (plus de temps, débloquer un site), le parent approuve —
   plutôt que surveillance unilatérale.

### Ce qu'on NE fait pas (par conception)
Caméra/micro à distance à l'insu, enregistrement d'appels, interception du contenu SMS/WhatsApp,
keylogger, captures d'écran furtives, mode caché. **Illégal** (Code pénal art. 226‑1 / 226‑15,
ECPA/wiretapping) **et** bannissable des stores. Détail et base légale dans [`02-CONFORMITE.md`](02-CONFORMITE.md).

## 2. Architecture cible (3 composants)

| Composant | Rôle | Techno recommandée |
|-----------|------|--------------------|
| **App ENFANT** | Collecte usage/localisation, applique blocage/filtrage/verrouillage, affiche la notification de supervision | **Android natif — Kotlin + Jetpack** (obligatoire : les API de supervision ne sont pas cross-platform) |
| **Console / App PARENT** | Gère la famille, les règles, les tableaux de bord, la carte, le SOS, la messagerie | **Console web React** (Next/Vite) + **app mobile parent** (React Native) |
| **BACKEND** | Appairage des comptes, synchro temps réel chiffrée, push, conformité | **Supabase** : Postgres + Auth + Realtime + Edge Functions (Deno) + Storage + pg_cron |

Détails (modèle de données, RLS, sécurité) : [`03-ARCHITECTURE.md`](03-ARCHITECTURE.md).

## 3. Deux modes de déploiement (décision à trancher)

Le **blocage/filtrage réellement inviolable** dépend du niveau de privilèges accordé à l'app enfant :

| Mode | Comment | Robustesse | Friction d'installation |
|------|---------|-----------|-------------------------|
| **Standard** | Sans enrôlement : `UsageStatsManager` (polling) + overlay + `VpnService` local + Device Admin pour `lockNow()` | Blocage **contournable** (écran récents, reboot, sans-échec) | Faible — installation classique |
| **Renforcé** | **Device Owner** (provisioning par QR après reset usine) ou Profile Owner → `DevicePolicyManager` | Blocage/filtrage/verrouillage **inviolables** | Élevée — reset de l'appareil enfant |

> **Recommandation** : construire le **mode Standard d'abord** (valeur immédiate, publication plus
> simple), puis ajouter le **mode Renforcé** en option pour les parents qui veulent un verrou
> incontournable — particulièrement pertinent pour le **jeune enfant (6 ans)**, dont l'appareil peut
> être entièrement dédié/managé. Pour l'ado (12 ans), le mode Standard transparent suffit et respecte
> mieux l'autonomie exigée par la CNIL.

## 4. Phases

| Phase | Objectif | Lots | Durée indicative |
|-------|----------|------|------------------|
| **P0 — Cadrage & conformité** | Specs (ce dossier), schéma SQL, AIPD/DPIA squelette, politique de confidentialité, Data safety, maquettes | — | ✅ en cours |
| **P1 — Socle** | Famille, appairage, backend+FCM, onboarding permissions, transparence minimale | **L0** | 1er livrable |
| **P2 — Observation** | Temps d'écran, rapports, inventaire apps | **L1** | valeur immédiate, faible risque Play |
| **P3 — Contrôle** | Blocage par app + planning horaire | **L2** | |
| **P4 — Localisation & sécurité** | Temps réel, geofencing, SOS, batterie | **L3** | ⚠️ déclaration Play « background location » (+ vidéo) |
| **P5 — Filtrage réseau** | VpnService local DNS + SafeSearch | **L4** | ⚠️ déclaration Play « VpnService » |
| **P6 — Gestion à distance & bien-être** | Verrouillage visible, messagerie interne, alertes sécurité on-device (ado) | **L5, L6** | |
| **P7 — Durcissement & publication** | Rétention, export/suppression RGPD, tests multi-OEM, formulaires Play | **L8** | |
| *Transversal* | Transparence & audit (démarre dès L0) | **L7** | tout du long |

## 5. Séquencement conseillé (ordre d'attaque)

```
L0 Socle&Conformité  ─┬─►  L1 Observation  ──►  (1re version publiable Play)
                      │
   (L7 Transparence démarre ici et continue partout)
                      │
                      ├─►  L2 Contrôle d'accès
                      ├─►  L3 Localisation & Sécurité   (permissions sensibles → déclarations Play)
                      ├─►  L4 Filtrage réseau            (déclaration VpnService)
                      ├─►  L5 Gestion à distance & messagerie
                      └─►  L6 Bien-être & sécurité avancée (profil ado)
                                        │
                                        └─►  L8 Privacy Ops & Publication
```

**Logique** : livrer vite L0+L1 (socle transparent + observation) → publier une 1re version à faible
risque de review → puis ajouter les lots à permissions sensibles (L3, L4) qui déclenchent les
formulaires Google et rallongent la validation.

## 6. Décisions à trancher avant d'attaquer (pour toi)

1. **Mode de déploiement de départ** : Standard (recommandé) ou directement Renforcé (device owner) ?
2. **Priorité d'interface parent** : console **web** d'abord (recommandé, plus rapide) ou **app mobile** parent d'abord ?
3. **Création du projet Supabase** : je le crée via l'intégration MCP dès le top départ du L0 — OK ?
4. **Périmètre L6 (profil ado)** : on inclut dès maintenant les alertes de sécurité on‑device
   (mots‑clés/image) en version transparente, ou on le garde pour une v2 ?

Réponds à ça et **on attaque le L0**. Détail des lots : [`04-LOTS.md`](04-LOTS.md).
