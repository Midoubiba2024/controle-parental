# LOT 4 — Filtrage réseau & contenu : notes d'implémentation (tranche 1)

> Incrément vertical : migrations SQL additives (0015, 0016) + RLS, console parent
> (onglet **Filtrage**), module Android de **filtrage DNS local** (`VpnService` +
> resolver userspace), écran enfant « mes données » enrichi (filtrage + journal de
> domaines). Respecte scrupuleusement la ligne rouge **anti-stalkerware** — voir
> [`02-CONFORMITE.md`](02-CONFORMITE.md) et [`01-CAHIER-DES-CHARGES.md`](01-CAHIER-DES-CHARGES.md)
> module C.

## 1. Lignes rouges appliquées

- **VpnService LOCAL = sinkhole DNS, rien d'autre.** On n'intercepte que le trafic
  **DNS (port 53)** vers un résolveur virtuel ; on décide allow/block/réécriture par
  **nom de domaine** ; on transfère les requêtes autorisées à un résolveur public.
  **JAMAIS** de MITM, **jamais** de déchiffrement TLS, **jamais** d'inspection de
  contenu/payload, **jamais** de proxy distant propriétaire. Un VPN qui déchiffrerait
  HTTPS serait un spyware → **exclu par conception**.
- **Journal = métadonnées de domaines seulement** : `domain` (hostname) + `category`
  + `action` + `occurred_at`. **Jamais** d'URL complète, de requête DNS brute, ni de
  contenu. Rétention bornée (`filter_policy.retention_days`, défaut 30 j ; purge auto
  planifiée en **L8**). Par défaut on ne journalise **que** les blocages/réécritures
  (minimisation art. 5-1-c) ; `log_allowed` étend aux résolutions autorisées (option).
- **Transparence** : le VPN est **visible** (icône clé Android + notification de
  supervision dédiée) ; l'écran enfant « mes données » (`MyDataScreen.kt`) annonce le
  filtrage DNS, le journal de domaines et **ce qui n'est pas collecté** (pages, contenu).
- **112 / urgences & essentiels jamais entravés** : seule l'adresse du résolveur virtuel
  (`10.111.0.1/32`) est routée dans le tunnel — **tout le reste du trafic est inchangé**.
  `DnsFilterEngine` applique une **liste blanche système/essentielle** inviolable
  (connectivité, heure, store, backend, cibles SafeSearch). Le 112 passe par le réseau
  **téléphonique**, hors DNS : il n'est de toute façon jamais concerné.
- **Anti-contournement (C9) TRANSPARENT** : `onRevoke()` (VPN coupé par l'utilisateur ou
  remplacé) **signale** la coupure au parent (`filter_status.vpn_active=false`) **et** à
  l'enfant (notification visible). Jamais en cachette. Le verrouillage « dur »
  (always-on + lockdown en device owner) est **reporté tranche 2**.
- **Graduation par âge** : jeune enfant → **liste blanche stricte** (`whitelist_only`) ;
  (pré)ado → **catégories + Ask-to-Browse** (C6). Presets dans la console.

## 2. Backend (Supabase) — migrations additives

- **`0015_l4_network_filtering`** :
  - `filter_policy` (réglage/enfant : `enabled`, `age_preset`, `blocked_categories[]`,
    `safe_search`, `youtube_restriction`, `whitelist_only`, `ask_to_browse`,
    `log_allowed`, `retention_days`). Privacy by default : filtrage **ON**, SafeSearch
    **ON**, YouTube **modéré** par défaut. **C1/C3/C4/C5/C7.**
  - `filter_rules` (listes blanche/noire : `domain`, `action allow|block`, par enfant,
    unique `(child_id, domain)`). Suffix match (domaine + sous-domaines) côté app. **C2.**
  - `domain_events` (journal **métadonnées** : `domain`, `category`, `action`,
    `occurred_at`) pour les rapports parent (F4-F6). Alimenté par l'appareil enfant.
  - `filter_status` (état VPN reporté par l'appareil : `vpn_active`, `last_active_at`,
    `last_revoked_at`, unique `device_id`) → anti-contournement **transparent** (C9).
  - Types : `app.filter_category`, `app.filter_rule_action`, `app.youtube_mode`,
    `app.domain_event_action`.
  - Audit (K3) : `filter_policy` et `filter_rules` journalisent chaque changement via le
    trigger existant `app.log_rule_change()` (visible par l'enfant).
- **`0016_l4_browse_request`** : ajoute la valeur `browse` à l'enum `app.request_kind`
  (Ask-to-Browse C6) — **réutilise** la table `public.requests` de L2 (co-régulation).
  `payload = { "domain": "ex.com" }`. L'approbation parent crée une règle `filter_rules`
  `allow` ; le refus laisse bloqué.

**RLS** (100 % des nouvelles tables), helpers réutilisés (`app.is_parent_of`,
`app.current_child_id`, `app.device_belongs_to_current_child`). Modèle d'accès :

| Table | Enfant (compte child) | Parent |
|-------|-----------------------|--------|
| `filter_policy` | **lecture** (transparence + application) | lecture + écriture |
| `filter_rules`  | **lecture** (pour appliquer) | lecture + écriture |
| `domain_events` | **insert** (son appareil) + lecture | lecture + suppression (RGPD) |
| `filter_status` | **insert/update** (son appareil) + lecture | lecture + update |

- **Leçon LOT 3 appliquée** : tous les SELECT scindés par enfant utilisent
  `app.is_parent_of(family_id) or child_id = app.current_child_id()` (jamais
  `is_member_of` seul → fuite inter-enfants). `family_id ↔ child_id` validé en
  `WITH CHECK`. Dans les sous-requêtes corrélées, **colonnes qualifiées** par le nom de
  la table de la policy (ex. `domain_events.child_id`) — pas de tautologie no-op.
- `get_advisors(security)` après application : **aucun nouveau finding** — seul subsiste
  `public._l1_write_probe` (sonde L1 à droper, nettoyage côté utilisateur, hors périmètre).
  Policies vérifiées manuellement (`pg_policies`) : aucun SELECT en `is_member_of` seul.

## 3. Application Android

Package `fr.controleparental.child.filter` :

- **`DnsFilterEngine`** (PUR, testable, sans dépendance Android — à l'image de
  `PolicyEngine` en L2) : décide `Allow` / `Block(category)` / `Rewrite(target)` pour un
  nom d'hôte. Ordre : essentiels/système → filtrage désactivé → liste noire → réécriture
  SafeSearch/YouTube → liste blanche → liste blanche stricte → catégorie bloquée → défaut.
- **`DomainLists`** : listes de domaines **embarquées** par catégorie (graines de
  démonstration), liste blanche système/essentielle, réécritures SafeSearch (Google/Bing/
  DuckDuckGo) et YouTube (`restrict(moderate).youtube.com`). ⚠️ Graines à compléter par
  un flux de listes maintenu en production (reporté tranche 2) — la ligne rouge reste
  identique quelle que soit la taille des listes.
- **`DnsPacket` / `IpUdp`** : encodage/décodage **minimal** DNS (lecture du nom demandé,
  construction NXDOMAIN pour un blocage, CNAME pour une réécriture) et enveloppe
  **IPv4/UDP** (parsing + fabrication de réponse, checksum IP). Périmètre tranche 1 :
  IPv4 + UDP/53 + question unique (cas ultra-majoritaire) ; le reste **fail-open** (jamais
  de coupure de connectivité).
- **`LocalDnsVpnService`** (`extends VpnService`) : établit le tunnel
  (`addAddress 10.111.0.2/32`, `addDnsServer 10.111.0.1`, `addRoute 10.111.0.1/32` →
  **seul le DNS** entre dans le tunnel, `allowBypass`), lit les paquets, applique le
  moteur, **transfère les requêtes autorisées** via un **socket protégé** (`protect()`,
  donc hors tunnel — pas de boucle) vers le résolveur public, et réinjecte la réponse.
  Service de premier plan **`specialUse`** + notification de supervision (transparence),
  `startForeground` entouré d'un try/catch (leçon L3). Boucle de synchro (~2 min) +
  heartbeat `filter_status` + flush périodique (~30 s) du journal de domaines.
- **`FilterClient` / `FilterCache`** : sync `filter_policy`+`filter_rules` (cache chiffré
  pour l'hors-ligne), écriture du journal (batch), report de `filter_status`, création des
  demandes Ask-to-Browse (`requests` kind `browse`). Réutilise `SupabaseClient` (session
  enfant, RLS) et le schéma `EncryptedSharedPreferences` existant.
- **`MyDataScreen`** : carte de consentement « Filtrage du web » (`VpnService.prepare` géré
  proprement — pas de crash si refus), résumé de la politique active, et deux lignes de
  transparence (ce qui est journalisé = métadonnées de domaines ; ce qui n'est **jamais**
  collecté = pages/contenu). Le filtrage est gaté par `Config.featureNetworkFilter`.

### Permissions & compat
- `FOREGROUND_SERVICE_SPECIAL_USE` (type du service de filtrage — pas de type `vpn`
  dédié) ; `VpnService` protégé par `BIND_VPN_SERVICE` + **consentement runtime**
  `VpnService.prepare` (toujours visible).
- minSdk 26 / targetSdk 35. `onRevoke()` géré ; `startForeground` en try/catch.
- **Non auto-démarré au boot** en tranche 1 (le VPN requiert le consentement ; s'appuyer
  sur le réglage système **always-on VPN** ou la réouverture de l'app). Le verrouillage
  always-on + lockdown (device owner) est reporté tranche 2.

## 4. Console parent (React, identité prototype)

- Nouvel onglet **Filtrage** (`FilteringView`, branché dans `Dashboard.tsx`) :
  interrupteur général + **état de la protection par appareil** (C9 transparent),
  **presets par âge** (C5), **catégories** à bloquer (C1/C7, CVD-safe : identité par
  libellé + icône, jamais la couleur seule), **SafeSearch** + **YouTube** + **liste
  blanche stricte** + **Ask-to-Browse** + rétention/journalisation, **listes blanche/
  noire** éditables (C2), **file Ask-to-Browse** à approuver (C6), **journal de domaines**
  (métadonnées). Lecture via `lib/filter.ts` (`useFilter`), **polling** (socle ; Realtime
  non requis ici).
- L'approbation d'une demande `browse` (onglet Filtrage **ou** Demandes) crée une règle
  `filter_rules` `allow`. `lib/rules.ts` + `RequestsView` gèrent le libellé/effet `browse`.
- Vérifs : `npm run typecheck` + `npm run build` **OK**.

## 5. Déclaration Google Play (à préparer, finalisée en L8)

- **`VpnService`** = usage **« core »** (le VPN est la fonctionnalité principale : filtrage
  de contenu par contrôle parental). Déclarer dans la Play Console : **trafic LOCAL**,
  **aucun MITM**, aucun déchiffrement, aucun serveur distant. Politique VPN de Google :
  le service doit être au premier plan, **visible**, et ne pas collecter de données de
  navigation — conforme ici (métadonnées de domaines uniquement, journal borné).
- **`FOREGROUND_SERVICE_SPECIAL_USE`** : justification renseignée aussi dans le manifeste
  (`PROPERTY_SPECIAL_USE_FGS_SUBTYPE`).
- **Divulgation bien visible** (prominent disclosure) : écran « mes données » (filtrage +
  journal) + onboarding (L0).
- `isMonitoringTool = child_monitoring` dans la Play Console.
- **Plan B refus** : compiler avec `-PfeatureNetworkFilter=false` (le `VpnService` n'est
  plus exposé par l'UI). Variante/flavor dédié possible si besoin d'en **retirer** la
  déclaration du manifeste fusionné (même principe que `noBgLocation` en L3) — non créé en
  tranche 1 pour éviter une 2ᵉ dimension de flavors (4 variantes).
- Fiche **Data safety** : ajouter « activité d'applications / historique de navigation »
  au sens **métadonnées de domaines filtrés** — finalité sécurité/contrôle parental,
  partagée uniquement avec le parent du foyer, non vendue, rétention bornée.

## 6. Reporté en tranche 2 (design documenté)

- **C8 — Filtrage d'images / détection de nudité on-device** (ML Kit) : classification
  **locale**, **alerte** uniquement, jamais d'upload du contenu brut (voir module G/L6).
- **C9 « dur » — always-on + lockdown** (device owner) : VPN non contournable + détection
  d'apps VPN tierces. Fiable seulement en mode Renforcé ; nécessite le provisioning
  device owner (L2). En Standard, C9 reste **transparent** (alerte de coupure).
- **C10 — détection de sextos sortants (ado)** : on-device → alerte, pas d'exfiltration
  (module G).
- **Veille v2** : réglages **assistants IA** (Gemini/Siri) et **YouTube supervisé** fin
  (au-delà de la réécriture DNS « restricted ») — dépendent de réglages compte/appareil
  non pilotables au seul niveau DNS → à instruire tranche 2.
- **Listes de domaines maintenues** : remplacer les graines embarquées par un flux de
  listes catégorisées synchronisé périodiquement (toujours filtrage DNS, aucun MITM).
- **IPv6 / DNS-over-HTTPS / DNS-over-TLS** : le sinkhole couvre IPv4/UDP:53. Le DoH/DoT
  (navigateur) et l'IPv6 peuvent contourner le filtrage DNS classique → à traiter
  tranche 2 (blocage des résolveurs DoH connus par domaine, désactivation du DNS privé en
  device owner). En l'état : **fail-open** (jamais de coupure), documenté.
- **`dispatch-push`** : accélération push best-effort (infra-flaggée, L5) — non présente ;
  **polling + cache** restent le socle.
