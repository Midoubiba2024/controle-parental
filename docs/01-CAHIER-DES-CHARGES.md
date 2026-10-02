# Cahier des charges — détail par fonction

**Légende**
- **6a** / **12a** : pertinence pour le profil ~6 ans / ~12 ans — ✓ (oui) · `opt` (optionnel/selon réglage) · — (non pertinent)
- **Prio** : `must` (indispensable) · `should` (important) · `nice` (confort)
- **API / Moyen** : mécanisme Android officiel retenu (voir [`03-ARCHITECTURE.md`](03-ARCHITECTURE.md) pour le backend)
- **Garde-fou** : condition légale/transparence associée (détail dans [`02-CONFORMITE.md`](02-CONFORMITE.md))

Chaque fonction est rattachée à son **lot** (voir [`04-LOTS.md`](04-LOTS.md)).

---

## Module A — Temps d'écran & bien-être numérique  *(Lot L2 ; insights = L1)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| A1 | Limite de temps d'écran quotidienne (globale, par jour de semaine) | ✓ | ✓ | must | `UsageStatsManager` (polling via foreground service) + overlay de blocage | Donnée agrégée, pas de contenu ; action visible |
| A2 | Limites de temps **par application** | ✓ | ✓ | must | Détection app 1er plan (UsageStats) + overlay quand quota atteint | Agrégats seulement |
| A3 | Limites de temps **par catégorie** (jeux, réseaux, vidéo) | opt | ✓ | should | Mapping package→catégorie local + cumul | — |
| A4 | Planning horaire / plages autorisées (devoirs, repas) | ✓ | ✓ | must | `AlarmManager` exact + `WorkManager` ; application via overlay/owner | Réversible, visible |
| A5 | Heure du coucher / **Downtime** | ✓ | ✓ | must | Fenêtre planifiée + `lockNow()`/shield | Appels d'urgence (112) toujours permis |
| A6 | **Mode École** (liste blanche d'apps éducatives) | ✓ | ✓ | should | Profil de règles activé par planning | — |
| A7 | Apps **toujours autorisées** (téléphone, urgences, éducatif) | ✓ | ✓ | should | Liste d'exemption appliquée au blocage | **Jamais bloquer l'appel d'urgence** |
| A8 | **Pause / verrouillage instantané** à distance (« à table ») | ✓ | ✓ | must | Commande FCM → overlay/`lockNow()` | Visible par l'enfant |
| A9 | Demande de **temps supplémentaire** (enfant → parent) | opt | ✓ | should | Table `requests` + Realtime + push | Co-régulation transparente |
| A10 | **Temps bonus / récompense** | opt | ✓ | nice | Crédit de minutes appliqué aux quotas | — |
| A11 | **Recommandations de temps par âge** (repères experts) | ✓ | ✓ | nice | Logique applicative (presets) | Aide à la décision |
| A12 | **Insights d'usage partagés avec l'enfant** (il voit son propre temps) | opt | ✓ | should | Vue côté app enfant | Transparence (favorise l'autorégulation) |

**Limite technique clé** : les *observers* natifs (`registerAppUsageLimitObserver`, API 29+) exigent
la permission système `OBSERVE_APP_USAGE` non accordable aux apps tierces → on utilise un **polling**
depuis un foreground service. Le blocage par overlay est contournable → **réellement fiable seulement
en mode Renforcé** (Device/Profile Owner, `setPackagesSuspended()`).

---

## Module B — Gestion des applications  *(Lot L2 ; inventaire = L1)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| B1 | **Blocage / autorisation** d'apps individuelles | ✓ | ✓ | must | Standard: overlay ; Renforcé: `DevicePolicyManager.setApplicationHidden()`/`setPackagesSuspended()` | Visible |
| B2 | **Validation d'installation** (notifier/bloquer nouvelle app) | ✓ | ✓ | must | Détection via `UsageStats`/`queryIntentActivities` → push parent ; blocage en Renforcé | Natif réservé à Family Link → approche « détecter + notifier + bloquer » |
| B3 | **Approbation des achats** (Ask to Buy) | ✓ | opt | should | Fourni surtout par Google Family Link / Play (hors API tierce) | On s'appuie sur le dispositif OS |
| B4 | Restriction par **classification d'âge** du store (PEGI/ESRB) | ✓ | ✓ | should | Filtrage de l'inventaire + blocage ; natif via Family Link | — |
| B5 | **Gestion des permissions** des apps (caméra/micro/localisation) | opt | ✓ | nice | Renforcé: `DevicePolicyManager` policies ; sinon guidage | Renforce la vie privée de l'enfant |
| B6 | **Inventaire des apps installées** | ✓ | ✓ | should | `LauncherApps.getActivityList` + `<queries>` ciblé (éviter `QUERY_ALL_PACKAGES` si possible) | Liste d'apps = proportionné ; déclaration Play si `QUERY_ALL_PACKAGES` |

---

## Module C — Filtrage web & contenu  *(Lot L4)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| C1 | **Filtrage web par catégories** (adulte, violence, drogue, jeux d'argent…) | ✓ | ✓ | must | `VpnService` **local** on-device : sinkhole DNS des domaines interdits | Trafic **jamais** routé vers un serveur tiers ; **pas de MITM HTTPS** |
| C2 | **Listes blanche / noire** de domaines | ✓ | ✓ | must | Règles locales dans le resolver VPN | — |
| C3 | **SafeSearch forcé** (Google/Bing) | ✓ | ✓ | must | Réécriture DNS → `forcesafesearch.google.com`, `strict.bing.com` | — |
| C4 | **YouTube mode restreint / SafeSearch** | ✓ | ✓ | should | DNS → `restrict(moderate).youtube.com` | — |
| C5 | **Profil de filtrage selon l'âge** (presets ajustables) | ✓ | ✓ | should | Jeux de listes par tranche d'âge | Plus strict à 6 ans |
| C6 | **Ask to Browse** (demander l'accès à un site bloqué) | opt | ✓ | nice | `requests` + Realtime | Co-régulation |
| C7 | **Blocage du contenu explicite / adulte** | ✓ | ✓ | must | Catégorie dédiée (C1) | — |
| C8 | **Filtrage d'images / détection de nudité** (on-device) | opt | ✓ | should | ML Kit on-device (classification locale) | ⚠️ **On-device uniquement**, pas d'upload du contenu brut |
| C9 | **Anti-contournement** (navigation privée, VPN tiers) | opt | ✓ | should | VPN **always-on + lockdown** (device owner), détection d'apps VPN | Fiable seulement en Renforcé |
| C10 | Détection de **sextos sortants** (alerte on-device) | — | opt | nice | ML Kit on-device → **alerte**, pas d'exfiltration | ⚠️ 12a : transparent, scope « alerte » ; voir Module G |

**Limites** : filtrage par **URL complète impossible sous HTTPS/ECH** sans MITM (à proscrire). Un seul
VPN actif à la fois. Verrou efficace seulement si l'enfant ne peut ni couper le VPN ni changer le DNS
→ **always-on + lockdown** en mode Renforcé.

---

## Module D — Localisation & géofencing  *(Lot L3)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| D1 | **Localisation temps réel** (à la demande + périodique) | ✓ | ✓ | must | `FusedLocationProviderClient` + foreground service type `location` | ⚠️ **Notification persistante obligatoire** ; déclaration Play + vidéo ; jamais occulte |
| D2 | **Localisation sur demande / check-in** ponctuel | ✓ | ✓ | should | `getCurrentLocation()` one-shot | Moins intrusif → **activé par défaut** plutôt que 24/7 |
| D3 | **Historique des trajets / lieux** (timeline) | opt | opt | should | Insert *throttlé* en base, partitionné par mois | Rétention courte (30–90 j), réglable |
| D4 | **Geofencing** zones (maison, école) + alertes entrée/sortie | ✓ | ✓ | should | `GeofencingClient` (ENTER/EXIT/DWELL) + `BroadcastReceiver` | Transparent ; ré-enregistrer après reboot |
| D5 | **Lieux favoris / de confiance** | ✓ | ✓ | should | Table `geofences` typées | — |
| D6 | **Check-in automatique « bien arrivé »** | ✓ | ✓ | should | Geofence ENTER → push parent | Au bénéfice de l'enfant |
| D7 | **Alerte batterie faible** + dernière position connue | ✓ | ✓ | should | `BatteryManager` + `ACTION_BATTERY_LOW` (receiver dynamique) | — |
| D8 | **Zones de confidentialité / bubbles** (l'ado masque une zone) | — | ✓ | should | Réglage côté enfant respecté par le partage | **Non silencieux** (le parent voit qu'une zone est privée) — exigence d'autonomie ado |

**Limites** : `ACCESS_BACKGROUND_LOCATION` = permission sensible (formulaire Play + **vidéo de démo**).
Max ~100 geofences/app. Fiabilité dépendante de Doze et des surcouches OEM → intervalles adaptatifs,
ré-enregistrement au boot (`RECEIVE_BOOT_COMPLETED`).

---

## Module E — Urgence & SOS  *(Lot L3)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| E1 | **Bouton SOS / panique** déclenché **par l'enfant** | ✓ | ✓ | must | Foreground service one-shot (position HP) → FCM high priority → parents | Déclenché par l'enfant = transparent par nature |
| E2 | **Diffusion de localisation en direct** pendant un SOS | ✓ | ✓ | must | Realtime Broadcast de positions | Durée bornée à l'épisode |
| E3 | **Contacts d'urgence (ICE)** + fiche médicale | ✓ | ✓ | should | Données famille | Données santé = sensibles (chiffrement) |
| E4 | **SOS silencieux / discret** (sans alerter l'entourage) | — | opt | should | UI discrète côté enfant | Pour l'ado en situation de danger |
| E5 | **Minuteur de sécurité « surveille mon trajet »** (Check-In) | opt | ✓ | should | Timer + escalade si non confirmé | — |
| E6 | **Accusé de réception du SOS** (« aide en route ») | ✓ | ✓ | nice | ACK parent → push enfant | Rassure l'enfant |
| E7 | **Escalade / mise en relation secours** | opt | opt | nice | Lien d'appel 112 ; intégration tierce ultérieure | Pas de substitution aux services officiels |
| E8 | **Détection d'accident** (jeune conducteur) | — | — | nice | Capteurs (futur, hors cible 6/12) | Reporté |

> **Pas de permission SMS** : `SEND_SMS`/`READ_SMS` sont des permissions **restreintes** réservées à
> l'app SMS par défaut → on privilégie **push + backend** (fallback file d'attente `WorkManager` si hors réseau).

---

## Module F — Rapports, activité & tableaux de bord  *(Lot L1)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| F1 | **Tableau de bord d'activité** (temps, apps, catégories) | ✓ | ✓ | must | Agrégation `UsageStatsManager` → sync chiffrée → console parent | **Métadonnées seulement**, jamais de contenu |
| F2 | **Statistiques par application** | ✓ | ✓ | should | idem F1 | — |
| F3 | **Rapports périodiques par email** (hebdo) | opt | ✓ | should | Edge Function + envoi mail | Pas de contenu privé |
| F4 | **Historique de navigation web** (domaines visités) | opt | opt | should | Journal des domaines résolus par le VPN local | ⚠️ 12a : **domaines/métadonnées**, pas le contenu ; afficher à l'enfant |
| F5 | **Historique de recherche** | opt | opt | should | via SafeSearch/logs DNS agrégés | Idem F4 |
| F6 | **Historique vidéo / YouTube** | opt | opt | should | Métadonnées via DNS/app usage | Idem F4 |
| F7 | **Rapport d'usage des réseaux sociaux** (temps, pas contenu) | — | ✓ | should | Temps par app (UsageStats) | **Temps**, pas le contenu des messages |

> ⚠️ Les lignes F4–F7 sont **conditionnelles** : légales uniquement en **métadonnées + transparence**
> (l'enfant/ado le sait, c'est affiché dans son tableau « mes données »). On ne lit **jamais** le
> contenu des pages/messages. L'intrusivité décroît avec l'âge (CNIL).

---

## Module G — Sécurité de contenu & alertes on-device *(profil ado)*  *(Lot L6)*

> **Modèle « Bark transparent »** : détection **sur l'appareil**, qui produit une **alerte** (et des
> ressources pour l'enfant), **sans** exfiltrer ni afficher au parent le contenu brut des messages.
> Déclaré et consenti. Pertinent surtout pour l'**ado (12 ans)** ; désactivé par défaut.

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| G1 | **Détection on-device de mots-clés de risque** (cyberharcèlement, auto-mutilation, prédateurs) | — | ✓ | should | Analyse **locale** du texte accessible à l'app (jamais le contenu de tiers exfiltré) | **Alerte**, pas lecture intégrale ; transparent |
| G2 | **Notification à l'enfant + ressources** lors d'un risque détecté | — | ✓ | must (si G1) | UI enfant + liens lignes d'écoute | L'enfant est informé en premier |
| G3 | **Détection d'image sensible (nudité)** + **floutage** + avertissement | opt | ✓ | should | ML Kit on-device | On-device ; pas d'upload du brut |
| G4 | **Alerte motif de grooming / contact adulte inconnu** | — | ✓ | should | Signaux on-device (métadonnées) | Alerte, pas interception de contenu |
| G5 | **Alertes à plusieurs niveaux selon l'âge** | opt | ✓ | should | Config par profil | Moins intrusif quand l'enfant grandit |
| G6 | **Tableau parent par catégories** (sans contenu brut pour les 15+) | — | ✓ | should | Agrégats de signaux | Respecte la vie privée de l'ado |

> ⚠️ **Ligne rouge** : jamais d'upload du contenu brut (messages/images) vers le cloud, jamais la
> lecture du contenu des correspondances de tiers (le correspondant n'a pas consenti — art. 226‑15).
> Tout reste **on-device + alerte**. Voir [`02-CONFORMITE.md`](02-CONFORMITE.md).

---

## Module H — Gestion à distance & communication  *(Lot L5)*

| # | Fonction | 6a | 12a | Prio | API / Moyen Android | Garde-fou |
|---|----------|----|----|------|---------------------|-----------|
| H1 | **Verrouillage / pause à distance visible** | ✓ | ✓ | must | `DeviceAdminReceiver.lockNow()` (Device Admin) ou owner, déclenché par FCM | **Visible** ; jamais bloquer le 112 ; réversible |
| H2 | **Messagerie interne parent ↔ enfant** | opt | ✓ | should | FCM + backend (`messages`) + `POST_NOTIFICATIONS` | **Messagerie propriétaire uniquement** (pas d'interception d'apps tierces) |
| H3 | **Demandes / approbations** (débloquer app/site, +temps) | opt | ✓ | should | `requests` + Realtime + push | Co-régulation |
| H4 | **Consignes / notes** du parent vers l'enfant | ✓ | ✓ | nice | Messagerie interne | — |

---

## Module I — Gestion familiale & extras  *(Lot L9 — nice-to-have)*

| # | Fonction | 6a | 12a | Prio | Moyen | Garde-fou |
|---|----------|----|----|------|-------|-----------|
| I1 | **Tâches & corvées** | ✓ | ✓ | nice | Backend + UI | — |
| I2 | **Récompenses & points** | ✓ | ✓ | nice | Backend + UI (lié A10) | — |
| I3 | **Argent de poche / allocation** (suivi) | — | ✓ | nice | Backend | Pas de service de paiement réel en v1 |
| I4 | **Calendrier familial partagé** | ✓ | ✓ | nice | Backend + UI | — |
| I5 | **Répertoire de ressources & lignes d'écoute** | opt | ✓ | should | Contenu statique | Utile et sans risque |

---

## Module J — Comptes, famille & administration  *(Lot L0 + L7)*

| # | Fonction | 6a | 12a | Prio | Moyen | Garde-fou |
|---|----------|----|----|------|-------|-----------|
| J1 | **Profils enfants multiples** (un pour le 6 ans, un pour le 12 ans) | ✓ | ✓ | must | Modèle `children`/`memberships` | Réglages par profil/âge |
| J2 | **Groupe familial / comptes liés** | ✓ | ✓ | must | `families` + `memberships` | — |
| J3 | **Co-gestion multi-parents / tuteurs** | opt | opt | nice | rôles `parent`/`guardian` | — |
| J4 | **App parent + app/portail enfant** | ✓ | ✓ | must | 3 clients | — |
| J5 | **Multi-appareils par enfant** | opt | ✓ | must | `devices` | — |
| J6 | **Appairage par code / QR** | ✓ | ✓ | must | Edge Function + code TTL/usage unique | Consentement des deux côtés |
| J7 | **Protection anti-désinstallation (visible)** | ✓ | opt | should | Device Admin / owner | ⚠️ **Jamais furtif** ; alerte transparente, pas blocage abusif |

---

## Module K — Transparence, confiance & confidentialité  *(Lot L7 transversal + L8)*

> **Brique de légalité centrale** — c'est ce qui sort le produit du périmètre stalkerware.

| # | Fonction | 6a | 12a | Prio | Moyen | Garde-fou |
|---|----------|----|----|------|-------|-----------|
| K1 | **Notification persistante « supervision active par X »** côté enfant | ✓ | ✓ | must | Foreground service + notification non effaçable | **Obligatoire** (anti-stalkerware) |
| K2 | **Tableau « mes données »** côté enfant (quoi collecté, pourquoi, rétention) | ✓ | ✓ | must | App enfant + `audit_log` | Langage adapté à l'âge |
| K3 | **Journal d'audit** : qui (quel parent) a consulté quoi, quand — **visible par l'enfant** | opt | ✓ | must | `audit_log` append-only | Accountability RGPD art. 5.2 |
| K4 | **Double onboarding & consentement co-signé** (parent + enfant) | ✓ | ✓ | must | Flux `consents` | Attestation autorité parentale ; assentiment enfant |
| K5 | **Paramètres de confidentialité élevés par défaut** (privacy by default) | ✓ | ✓ | must | Config initiale minimale | Options intrusives **désactivées** par défaut |
| K6 | **Mode « ado »** : autonomie accrue, **visibilité mutuelle** | — | ✓ | must | Profil 12a+ | L'enfant voit le parent aussi |
| K7 | **Autonomie graduée selon l'âge** + allègement auto à l'approche de 15/18 ans | opt | ✓ | should | Logique d'âge + `consents` | Capacités évolutives (CNIL) |
| K8 | **Pause de confidentialité demandée par l'ado** (non silencieuse) | — | ✓ | should | `requests` | Transparente des deux côtés |
| K9 | **Minimisation & contrôle de la rétention** (durées par type, purge auto) | ✓ | ✓ | must | `pg_cron` + partitionnement | RGPD art. 5 ; politique écrite publiée |
| K10 | **Export & suppression RGPD** (accès/rectification/effacement/portabilité) | ✓ | ✓ | must | Edge Functions | Outillé pour enfant et parent |
| K11 | **Fin de surveillance à 18 ans** (ou bascule consentement propre) | — | opt | should | Logique d'âge | Autorité parentale cessée |
| K12 | **Alerte transparente de tentative de désinstallation/altération** | ✓ | ✓ | should | Device Admin + push parent | Transparente, non coercitive |

---

## Fonctions EXCLUES par conception (illégales / stalkerware)

Ces fonctions, présentes chez certains « concurrents » espions, sont **exclues définitivement** —
elles sont illégales (FR : Code pénal **226‑1**, **226‑15** ; US : ECPA/wiretapping) et entraînent le
**bannissement des stores**. Justification complète : [`02-CONFORMITE.md`](02-CONFORMITE.md).

- ❌ Application masquée / mode furtif / icône cachée
- ❌ Activation à distance de la **caméra** à l'insu (y compris téléphone en veille)
- ❌ Activation à distance du **micro** / écoute d'ambiance
- ❌ **Enregistrement des appels** (le correspondant tiers n'a pas consenti)
- ❌ **Interception du contenu** SMS / WhatsApp / messageries de tiers
- ❌ **Keylogger** / capture d'identifiants et mots de passe
- ❌ **Captures ou enregistrement d'écran furtifs**
- ❌ Upload du **contenu brut** (images/messages) vers le cloud pour analyse
- ❌ Géolocalisation **occulte** (sans information de l'enfant)
- ❌ Revente / publicité ciblée / partage tiers des données de l'enfant
- ❌ Conservation **indéfinie** sans politique de rétention
- ❌ Poursuite de la surveillance **après 18 ans** sans consentement propre
- ❌ Collecte **biométrique** sans régime renforcé

> Pour le besoin réel derrière ces demandes (sécurité de l'enfant en cas de danger), les **réponses
> légales** sont : bouton **SOS** (E1), **localisation temps réel transparente** (D1), **geofencing +
> check-in** (D4/D6), **alertes on-device** (G1–G4), **contacts ICE** (E3). Elles protègent aussi
> efficacement, sans exposer le parent à des poursuites pénales.

---

## Ajouts issus de la veille concurrentielle (v2)

Fonctions `must`/`should` récupérées de la veille (liste exhaustive : [`05-VEILLE-CONCURRENTIELLE.md`](05-VEILLE-CONCURRENTIELLE.md)). Elles complètent les modules ci-dessus.

### Nouveautés indispensables (`must`)
| # | Fonction | Module / Lot | Note légale |
|---|----------|--------------|-------------|
| V1 | **Contacts autorisés** (appels & SMS natifs) + demande d'ajout par l'enfant | H / **L5** | Gestion de l'appareil ; transparent. Liste blanche pour le 6 ans. |
| V2 | **Code parent temporaire hors-ligne** (déverrouiller / accorder du temps sans réseau) | H / **L5** | Équivalent du Parent Access Code (Family Link) / code Temps d'écran (Apple). |
| V3 | **Gestion des assistants IA génératifs** (Gemini / Siri / chatbots), filtrage par âge | C / **L4** | Enjeu 2026 ; bloquer à 6 ans, encadrer à 12 ans. |

### Nouveautés importantes (`should`)
| # | Fonction | Module / Lot |
|---|----------|--------------|
| V4 | **Mode vacances / pause de planning** temporaire (reprise auto) | A / L2 |
| V5 | **Verrouillage des réglages système** (anti-triche : date/heure, compte, dév.) | B / L2 |
| V6 | **Préréglages de temps par âge** (par catégorie) + **délai de grâce « encore 1 min »** | A / L2 |
| V7 | **Restrictions de médias explicites** (musique, podcasts, actualités, livres) | C / L4 |
| V8 | **Contrôles sociaux de jeu** (multijoueur, ajout d'amis, chat in-game, enregistrement) | C / L4 |
| V9 | **Expérience YouTube supervisée** (Kids vs supervisé, niveaux par âge) | C / L4 |
| V10 | **Journal d'appels & SMS — métadonnées seulement** (qui/quand/durée, jamais le contenu), visible par l'enfant | F / L1 |
| V11 | **Blocage de contacts** (appels + SMS, listes allow/block) | H / L5 |
| V12 | **Signalement aux autorités** (grooming) : 3018 e-Enfance, PHAROS + **ressources prévention suicide 3114** | G / L6 |
| V13 | **Portefeuille familial** (dépenses réelles, plafonds, historique d'achats) | I / L9 |
| V14 | **Automatisation de mode par géofence** (École/Downtime déclenchés par lieu) | D / L3 |
| V15 | **Faire sonner l'appareil** (buzz, même en silencieux) | D-E / L3 |
| V16 | **Verrouillage avec message personnalisé** sur l'écran | H / L5 |
| V17 | **Batterie & stockage** de l'appareil dans la console | F / L1 |
| V18 | **Rapport de conduite** (profil ado conducteur) | E / L3 |

### Confort (`nice`, extraits)
Plannings réutilisables (L2) · délai de grâce (L2) · tendances/comparaisons dans les rapports (L1) · masquer des apps intégrées (L2) · verrouillage/effacement anti-vol (L5) · **toggle « je choisis de ne pas voir X »** (minimisation RGPD, L8) · suivi data mobile (L1).

### Design/UX (intégrés au prototype ou backlog)
Visualisations de **temps d'écran** (anneau du jour, barres 7 jours, répartition par app) ✅ · **carte de localisation** + zones de sécurité ✅ · **batterie/stockage** dans l'en-tête ✅ · à venir : onboarding guidé, états vides pédagogiques, gamification douce (récompenses), notifications groupées. Liste complète : [`05-VEILLE-CONCURRENTIELLE.md`](05-VEILLE-CONCURRENTIELLE.md) §2.
