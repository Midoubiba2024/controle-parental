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
Temps d'écran (UsageStats), blocage/filtrage, localisation + géofencing, SOS, verrouillage
à distance — chacun affiché dans « mes données » avant activation. Voir `../../docs/04-LOTS.md`.

> Le binaire `gradle/wrapper/gradle-wrapper.jar` n'est pas commité (généré par
> `gradle wrapper` ou Android Studio à la première ouverture).
