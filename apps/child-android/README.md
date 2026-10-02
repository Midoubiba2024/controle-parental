# App enfant (Android)

App installée sur l'appareil de l'enfant. **Visible et transparente** par conception :
une notification de supervision persistante indique en permanence que l'accompagnement
parental est actif (garde-fou anti-stalkerware, cf. `../../docs/02-CONFORMITE.md`).

## Stack
Kotlin + Jetpack Compose (Material3), OkHttp, EncryptedSharedPreferences. AGP 8.5 / Kotlin 2.0.

## Ce que fait le squelette (LOT 0)
- **Écran d'appairage** : saisie du code à 8 chiffres → appelle l'Edge Function
  `pairing-complete` → enrôle l'appareil et stocke la **session enfant chiffrée**.
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
| `-PfeatureBackgroundLocation=false` | ne demande jamais la localisation en arrière-plan (variante « sans background » si refus Play) | `true` |

### Déclaration Play (à fournir à la publication)
- `PACKAGE_USAGE_STATS` : usage « core » de supervision parentale transparente (temps d'écran).
- `READ_CALL_LOG` (si `FEATURE_CALL_LOG`) : métadonnées d'appels pour la supervision
  parentale, **sans contenu**. Si risque de refus Play, laisser la fonction **désactivée**
  (flag off) — l'observation du temps d'écran et de l'inventaire ne dépend pas de ce flag.
- `ACCESS_BACKGROUND_LOCATION` (si `FEATURE_BACKGROUND_LOCATION`) : permission **sensible**
  → formulaire Play + **vidéo de démo** « child_monitoring » (montrer notification de
  supervision, écran « mes données », consentement). En cas de refus : publier la
  variante `-PfeatureBackgroundLocation=false` (check-in à la demande + SOS restent
  fonctionnels). Détails : [`../../docs/08-LOT3-LOCALISATION.md`](../../docs/08-LOT3-LOCALISATION.md) §5.
- `isMonitoringTool = child_monitoring` à cocher dans la Play Console.

## Construire
```bash
cd apps/child-android
# Android Studio génère le wrapper et le dossier gradle/ ; sinon :
gradle wrapper --gradle-version 8.9
./gradlew :app:assembleDebug
```
URL/clé Supabase par défaut déjà dans `app/build.gradle.kts` ; surchargeables :
```bash
./gradlew :app:assembleDebug -PsupabaseUrl=... -PsupabaseAnonKey=...
```

## À venir (lots suivants)
Blocage/filtrage, localisation + géofencing, SOS, verrouillage à distance — chacun affiché
dans « mes données » avant activation. Voir `../../docs/04-LOTS.md`.

> Le binaire `gradle/wrapper/gradle-wrapper.jar` n'est pas commité (généré par
> `gradle wrapper` ou Android Studio à la première ouverture).
