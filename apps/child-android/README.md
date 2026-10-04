# App enfant (Android)

App installée sur l'appareil de l'enfant. **Visible et transparente** par conception :
une notification de supervision persistante indique en permanence que l'accompagnement
parental est actif (garde-fou anti-stalkerware, cf. `../../docs/02-CONFORMITE.md`).

## Stack
Kotlin + Jetpack Compose (Material3), OkHttp, EncryptedSharedPreferences. AGP 8.7 / Kotlin 2.0.

## Ce que fait le squelette (LOT 0)
- **Écran d'appairage** (refondu au LOT 12, contrat [`../../docs/14-APPAIRAGE.md`](../../docs/14-APPAIRAGE.md)) :
  saisie du code à **10 caractères** affiché par la console parent (ex. `7KQ2M-X9D4F`,
  avec ou sans tiret, minuscules acceptées, `O`/`I`/`L` lus `0`/`1`/`1`) → l'appareil
  ouvre une **session anonyme** Supabase puis appelle la RPC `pairing_complete` ;
  cette session devient la **session de l'appareil**, stockée chiffrée et rafraîchie
  (rotation du refresh token). Aucune clé secrète dans l'APK : seule la clé publiable.
  Si le parent **retire l'appareil** ou si la session est perdue, l'appli efface son
  enrôlement et revient d'elle-même à cet écran (nouveau code nécessaire).
- **Service de supervision** : notification de premier plan **persistante** (non balayable),
  relancée au démarrage (`BootReceiver`).
- **Écran « mes données »** : transparence — ce qui est partagé, niveau de supervision.

## Observation transparente (LOT 1)
Collecte d'**agrégats / métadonnées uniquement** (jamais le contenu), remontés chiffrés
(HTTPS) vers Supabase sous la session enfant, puis affichés dans « mes données » :
- **Temps d'écran** — `UsageStatsManager` (agrégat par app/jour). Permission **spéciale**
  `PACKAGE_USAGE_STATS` accordée via *Réglages → Accès aux données d'usage* (l'app y
  redirige ; elle ne peut pas l'obtenir au runtime).
- **Inventaire des apps** — `LauncherApps` (apps lançables) + `<queries>` ciblé, pour
  **éviter** `QUERY_ALL_PACKAGES`.
- **Batterie & stockage** — `BatteryManager` + `StatFs`.
- **Journal d'appels (métadonnées)** — *qui (numéro **haché**, jamais en clair) / quand /
  durée*, jamais le contenu. Fonction **sensible** : `READ_CALL_LOG`.

La collecte est planifiée par `MetricsWorker` (WorkManager, ~horaire + passage immédiat au
démarrage du service `dataSync`), résistant à Doze.

## Localisation & Sécurité (LOT 3)
Positions de **notre app uniquement**, **jamais occultes** (notification de supervision
toujours affichée + écran « mes données »). Détails : [`../../docs/08-LOT3-LOCALISATION.md`](../../docs/08-LOT3-LOCALISATION.md).
- **Localisation** — `FusedLocationProviderClient` (relevés **ponctuels** one-shot :
  minimisation + résistance Doze). Service de premier plan de type `location` activé
  **uniquement si la permission est accordée** (exigence Android 14). Coordonnées
  arrondies (~1 m), ni vitesse ni cap ; rétention bornée (purge L8).
- **Geofencing** — `GeofencingClient` depuis les zones définies par le parent,
  **ré-enregistrées après reboot**. Alertes « bien arrivé » (D6).
- **SOS** — **déclenché par l'enfant** (écran « mes données ») → `sos_events` +
  diffusion de position **en direct bornée** (15 min). Le 112 reste joignable à part.
- **Batterie faible** (D7) — receiver `ACTION_BATTERY_LOW` → dernière position + alerte.
- **Check-in à la demande** (D2) — commande parent `locate` → un relevé ponctuel.

### Flags de compilation
| Propriété Gradle | Effet | Défaut |
|---|---|---|
| `-PfeatureCallLog=true` | active le journal d'appels (métadonnées) | `false` |
| `-PcommHashPepper=…` | poivre de hachage des numéros (à définir en release) | `dev-pepper-change-me` |

**Localisation en arrière-plan** — pilotée par un **product flavor** (dimension `backgroundLocation`),
pas un `-P` : le flavor `noBgLocation` **retire** `ACCESS_BACKGROUND_LOCATION` du manifeste fusionné
(overlay `tools:node="remove"`), `withBgLocation` (défaut) la conserve. Voir
[`../../docs/08-LOT3-LOCALISATION.md`](../../docs/08-LOT3-LOCALISATION.md).

### Déclaration Play (à fournir à la publication)
- `PACKAGE_USAGE_STATS` : usage « core » de supervision parentale transparente (temps d'écran).
- `READ_CALL_LOG` (si `FEATURE_CALL_LOG`) : métadonnées d'appels pour la supervision
  parentale, **sans contenu**. Si risque de refus Play, laisser la fonction **désactivée**
  (flag off) — l'observation du temps d'écran et de l'inventaire ne dépend pas de ce flag.
- `ACCESS_BACKGROUND_LOCATION` (flavor `withBgLocation`) : permission **sensible**
  → formulaire Play + **vidéo de démo** « child_monitoring » (montrer notification de
  supervision, écran « mes données », consentement). En cas de refus : publier la
  variante **`noBgLocation`** (permission absente du manifeste ; check-in à la demande
  + SOS restent fonctionnels). Détails : [`../../docs/08-LOT3-LOCALISATION.md`](../../docs/08-LOT3-LOCALISATION.md) §5.
- `isMonitoringTool = child_monitoring` à cocher dans la Play Console.

## Filtrage réseau & contenu (LOT 4)
Filtrage par **nom de domaine (DNS)** via un **`VpnService` LOCAL** (sinkhole). Détails :
[`../../docs/09-LOT4-FILTRAGE.md`](../../docs/09-LOT4-FILTRAGE.md).
- **LIGNE ROUGE** : VPN **strictement local**. On n'intercepte que le **DNS** (port 53)
  vers un résolveur virtuel, on décide allow/block/réécriture par **nom de domaine**, puis
  on transfère les requêtes autorisées à un résolveur public (Quad9 par défaut).
  **Aucun MITM, aucun déchiffrement TLS, aucune inspection de contenu, aucun proxy distant.**
- **Transparence** : le VPN est **visible** (icône clé Android + notification de supervision
  dédiée) ; l'écran « mes données » annonce le filtrage DNS et le **journal de domaines**
  (métadonnées : domaine + catégorie + action + heure, **jamais** d'URL ni de contenu).
- **Essentiels & urgences jamais entravés** : seule l'adresse du résolveur virtuel est
  routée dans le tunnel (tout le reste du trafic est inchangé) ; `DnsFilterEngine` tient
  une **liste blanche système/essentielle** inviolable. Le 112 passe par le réseau
  téléphonique, hors DNS.
- **Graduation par âge** : jeune enfant → **liste blanche stricte** ; (pré)ado →
  **catégories + Ask-to-Browse** (C6). Presets dans la console parent.
- **Anti-contournement transparent (C9)** : `onRevoke()` signale toute coupure au parent
  (`filter_status`) **et** à l'enfant (notification) — jamais en cachette.
- Cœur **pur et testable** : `DnsFilterEngine` + `DnsPacket`/`IpUdp` (décision et
  encodage DNS/IPv4-UDP), indépendants d'Android.

Permissions ajoutées : `FOREGROUND_SERVICE_SPECIAL_USE` (le service de filtrage est de
type `specialUse` — il n'existe pas de type `vpn` dédié) ; le `VpnService` est protégé par
`BIND_VPN_SERVICE` et exige le **consentement runtime** `VpnService.prepare` (toujours
visible). Flag `FEATURE_NETWORK_FILTER` (ON par défaut, `-PfeatureNetworkFilter=false`
pour une soumission Play sans VPN).

## Construire

**Le plus simple : le CI.** Chaque push / PR lance `.github/workflows/android.yml` :
tests JVM (`testWithBgLocationDebugUnitTest`) + Android Lint + APK debug
(`withBgLocation`, et `noBgLocation` compilée pour vérification). L'APK **release signé**
n'est construit que dans un contexte de confiance (push sur `main` ou tag `v*`, job
rattaché à l'environnement GitHub `release`). Les APK sont publiés en artefacts (onglet
Actions) ; un tag `v*` publie une Release GitHub (APK release signé uniquement — le job
échoue sans signature).
Installation sur le téléphone : **[`../../docs/10-INSTALLATION.md`](../../docs/10-INSTALLATION.md)**.

En local (JDK 17 + Android SDK 35 requis ; le wrapper Gradle 8.9 est commité) :
```bash
cd apps/child-android
./gradlew :app:testWithBgLocationDebugUnitTest     # tests JVM (PolicyEngine, DNS…)
# Un flavor de localisation doit être choisi (LOT 3) :
./gradlew :app:assembleWithBgLocationDebug   # avec localisation en arrière-plan (défaut)
./gradlew :app:assembleNoBgLocationDebug      # variante sans arrière-plan
# Filtrage réseau activé par défaut ; pour le retirer :
./gradlew :app:assembleWithBgLocationDebug -PfeatureNetworkFilter=false
# Résolveur amont surchargeable : -PdnsUpstream=1.1.1.1
```
URL/clé Supabase par défaut déjà dans `app/build.gradle.kts` ; surchargeables :
```bash
./gradlew :app:assembleWithBgLocationDebug -PsupabaseUrl=... -PsupabaseAnonKey=...
```

### Signature release & versions (LOT 8a)
Une mise à jour sideloadée ne s'installe par-dessus que si elle est signée avec la
**même clé**. `app/build.gradle.kts` lit 4 valeurs (propriété Gradle `-P…` ou variable
d'environnement) : `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Si l'une manque, aucune signature release
n'est configurée. En CI, le keystore vient du secret `ANDROID_KEYSTORE_BASE64` de
l'environnement `release` (procédure : `docs/10-INSTALLATION.md` §0). **Ne jamais
commiter de keystore** (`*.keystore`, `*.jks`, `*.p12`, `*.b64*` sont ignorés par Git).
`versionCode` = `-PversionCode=<n>` (numéro de run CI ; défaut 1) pour qu'il croisse ;
`versionName` = `<-PversionName, défaut 0.1.0> (build <n>)` (le tag `v*` fournit la version).

## À venir (lots suivants)
Verrouillage/messagerie à distance (L5), bien-être & détection on-device ado (L6),
durcissement & publication (L8) — chacun affiché dans « mes données » avant activation.
Voir `../../docs/04-LOTS.md`.

