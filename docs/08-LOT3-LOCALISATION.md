# LOT 3 — Localisation & Sécurité : notes d'implémentation (tranche 1)

> Incrément vertical : migrations SQL additives (0012, 0013) + RLS, console parent
> (onglets **Localisation** et **Sécurité / SOS**), modules Android de localisation /
> geofencing / SOS, écran enfant « mes données » enrichi (position + SOS).
> Respecte scrupuleusement la ligne rouge **anti-stalkerware** — voir
> [`02-CONFORMITE.md`](02-CONFORMITE.md) : **aucune géolocalisation occulte**,
> positions de **notre app uniquement**, **112 jamais entravé**, **minimisation**
> (précision/rétention bornées, SOS borné à l'épisode), **graduation par âge**.

## 1. Lignes rouges appliquées

- **Jamais occulte** : la localisation ne fonctionne que pendant que la
  **notification de supervision persistante** (K1) est affichée ; l'écran enfant
  « mes données » explique **quand et comment** la position est partagée et
  propose d'accorder/refuser les permissions. Déclenchement du SOS **par l'enfant**.
- **Notre app uniquement** : positions issues de `FusedLocationProviderClient` ;
  aucun contenu de tiers, aucune caméra/micro.
- **112 jamais entravé** : aucun blocage d'appel ; le SOS est un **plus**, pas un
  substitut aux secours (un lien 112 reste disponible côté enfant/overlay).
- **Minimisation RGPD** : coordonnées arrondies à 5 décimales (~1 m) avant envoi,
  **pas de vitesse ni de cap** ; rétention bornée (`location_settings.retention_days`,
  défaut 30 j ; purge auto planifiée en **L8**) ; diffusion SOS **bornée à 15 min**
  côté appareil puis arrêtée (l'épisode reste clôturable).
- **Graduation par âge** : `location_settings.mode` (`off` | `on_demand` |
  `periodic`), **défaut `on_demand`** (privacy by default, art. 25). Jeune enfant →
  `periodic` adapté ; (pré)ado → check-in **à la demande** privilégié. Les **bulles
  de confidentialité ado** (D8) sont **reportées en tranche 2** (design ci-dessous).

## 2. Backend (Supabase) — migrations additives

- **`0012_l3_location_security`** :
  - `location_settings` (réglage/enfant : mode, cadence périodique bornée,
    rétention, haute précision) — pilote l'appareil + la transparence.
  - `location_fixes` (positions : `periodic` | `on_demand` | `sos` ; précision
    bornée ; unique `device_id, captured_at` → remontées idempotentes). **D1/D2/D3/E2**.
  - `geofences` (zones `home`/`school`/`custom`, rayon borné 80 m–10 km,
    `notify_enter`/`notify_exit`) — **lisibles par l'appareil enfant** (il doit les
    enregistrer). **D4/D5**.
  - `geofence_events` (transitions `enter`/`exit`/`dwell`, snapshot du nom). **D4/D6**.
  - `sos_events` (`active`/`acked`/`resolved`, `acked_by`) + garde-fou
    `app.sos_guard_child_update()` (l'enfant ne peut que **clôturer** son SOS,
    jamais s'auto-acquitter). **E1/E2/E6**.
  - `safety_alerts` (`low_battery` + niveau) — **D7**.
  - **Realtime** : `location_fixes`, `sos_events`, `geofence_events`, `safety_alerts`
    ajoutés à la publication `supabase_realtime` (diffusion live du SOS, E2). La RLS
    s'applique au flux (Realtime Authorization) — chaque parent ne reçoit que sa famille.
- **`0013_l3_locate_command`** : ajoute la valeur `locate` à l'enum
  `app.command_type` (check-in ponctuel à la demande, **D2**).

**RLS** (100 % des tables), helpers réutilisés (`app.is_parent_of`,
`app.current_child_id`, `app.device_belongs_to_current_child`) ; `family_id ↔ child_id`
validé en `WITH CHECK` ; `search_path` figé sur la nouvelle fonction. Modèle d'accès :

| Table | Enfant (compte child) | Parent |
|-------|-----------------------|--------|
| `location_settings` | **lecture** (transparence) | lecture + écriture |
| `location_fixes` | **insert** (ses positions, son appareil) + lecture | lecture |
| `geofences` | **lecture** (pour enregistrer) | lecture + écriture |
| `geofence_events` | **insert** + lecture | lecture |
| `sos_events` | **insert** (active) + **clôture** seule | lecture + ack/clôture |
| `safety_alerts` | **insert** + lecture | lecture + acquittement |

`get_advisors(security)` après application : **aucun nouveau finding** — seul
subsiste `public._l1_write_probe` (sonde L1 à droper, **nettoyage côté utilisateur**,
hors périmètre L3 ; les DROP passent par le SQL Editor car ils *timeout* via le MCP).

## 3. Application Android

Package `fr.controleparental.child.location` :

- **`LocationClient`** — `FusedLocationProviderClient`. Relevés **ponctuels**
  (`getCurrentLocation` one-shot, borné en durée) plutôt qu'un flux continu : plus
  économe, plus résistant à Doze, plus respectueux de la minimisation. Gère les
  permissions (fine/coarse/arrière-plan).
- **`LocationRepository`** — lectures/écritures PostgREST sous la session enfant
  (RLS). Arrondit les coordonnées (5 décimales) ; relevés idempotents (upsert
  ignore-duplicates sur `device_id, captured_at`).
- **`GeofenceManager`** — (ré)enregistre les zones dans `GeofencingClient` depuis la
  base (défini par le parent). **Ré-enregistré après reboot** (les geofences OS ne
  survivent pas au redémarrage) via le démarrage du service.
- **`GeofenceBroadcastReceiver`** — reçoit ENTER/EXIT/DWELL → insère un
  `geofence_event` (check-in « bien arrivé », D6).
- **`LocationCoordinator`** — orchestré par la boucle du service : relevé
  **périodique** (si `mode=periodic`, cadence adaptative pilotée par le parent),
  **diffusion SOS live bornée** (15 min), **check-in à la demande** (commande
  `locate`), **batterie faible** (dernière position + `safety_alert`).
- **`SupervisionService`** — type de service de premier plan calculé **à l'exécution** :
  `dataSync` toujours, `location` **uniquement si la permission est accordée**
  (Android 14 exige la permission au démarrage pour le type `location`, sinon crash).
  Après l'octroi, l'app relance le service pour activer le type `location`. Receiver
  dynamique `ACTION_BATTERY_LOW`.
- **`CommandExecutor`** — commande `locate` → check-in ponctuel.
- **Bouton SOS** (écran « mes données ») — **déclenché par l'enfant** : insère
  `sos_events(active)` + une première position `source=sos` ; le service diffuse
  ensuite en direct (borné). V15 **« faire sonner »** : déjà implémenté en L2
  (commande `ring` : alarme + vibration même en silencieux) — vérifié, inchangé.

### Permissions & cadence

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE_LOCATION`.
- `ACCESS_BACKGROUND_LOCATION` : demandée **seulement** si
  `BuildConfig.FEATURE_BACKGROUND_LOCATION` (flag Gradle, défaut `true`) **et** après
  l'octroi de la position fine ; sur Android 11+ l'utilisateur choisit « Toujours »
  dans les réglages.
- Cadence périodique **adaptative/Doze** : le coordinateur borne ses cadences
  (relevé périodique au plus tôt toutes les `periodic_interval_sec`, poll SOS ~15 s,
  diffusion SOS ~12 s). Repli hors service via le socle existant.

### Flags de compilation

| Propriété Gradle | Effet | Défaut |
|---|---|---|
| `-PfeatureBackgroundLocation=false` | ne demande jamais la localisation en arrière-plan (variante « sans background » si refus Play) | `true` |

## 4. Console parent (React, identité prototype)

- **Localisation** : carte **Leaflet + tuiles OpenStreetMap** (MIT, sans clé API —
  meilleur choix archi vs Google Maps : respectueux de la vie privée, pas de
  dépendance propriétaire). Dernière position, précision, zones dessinées,
  **historique de trajets** par jour, arrivées/départs, bouton **« Demander un
  check-in »** (commande `locate`). Marqueurs **CVD-safe** (palette validée,
  identité portée aussi par l'icône/le libellé, jamais la couleur seule).
- **Sécurité / SOS** : bandeau **SOS actif** avec position **live** (Realtime) +
  **« Aide en route »** (ACK E6) + clôture ; réglage du **partage par âge** ; édition
  des **zones de sécurité** (placement sur la carte, rayon, alertes) ; alertes
  **batterie faible**. Live via Supabase Realtime (**polling = socle de repli**).
- Navigation branchée dans `Dashboard.tsx` (`NAV`, `VIEW_TITLE`, type `View`).
- Leaflet isolé en chunk dédié (Vite `manualChunks`). Vérifs : `npm run typecheck`
  + `npm run build` OK.

## 5. Déclaration Google Play (à préparer, finalisée en L8)

- **`ACCESS_BACKGROUND_LOCATION`** = permission **sensible** → formulaire Play +
  **vidéo de démonstration** montrant : la notification de supervision permanente,
  l'écran « mes données », le consentement, l'usage **child_monitoring**. Justification :
  sécurité de l'enfant (localisation transparente, geofencing « bien arrivé », SOS).
- **Divulgation bien visible** (prominent disclosure) dans l'app **avant** toute
  collecte en arrière-plan (déjà couverte par « mes données » + onboarding L0).
- `isMonitoringTool = child_monitoring` dans la Play Console.
- **Plan B refus** : publier la variante `-PfeatureBackgroundLocation=false`
  (check-in à la demande + SOS fonctionnels ; suivi périodique app ouverte).
- Fiche **Data safety** : ajouter « localisation précise », finalité sécurité,
  partagée uniquement avec le parent du foyer, non vendue, rétention bornée.

## 6. Reporté en tranche 2 (design documenté)

- **D8 — Bulles de confidentialité ado** : l'ado masque une zone (domicile d'un ami…).
  Design : table `location_privacy_zones(child_id, center, radius, label)` ; côté
  appareil, si une position tombe dans une bulle, on remonte **non pas la position**
  mais un marqueur **« zone privée »** (non silencieux — le parent voit qu'une zone
  est privée, exigence d'autonomie ado, K8). Jamais une suppression occulte.
- **E3 — Contacts ICE + fiche médicale** : données **santé = sensibles** →
  chiffrement applicatif (clé non détenue par le serveur) ; table dédiée + écran.
- **E4 — SOS discret** : UI discrète côté enfant (sans alerter l'entourage) pour
  l'ado en danger ; même backend `sos_events` (un flag `discreet`).
- **E5 — « Surveille mon trajet »** (minuteur de sécurité, escalade si non confirmé).
- **V14 — Automatisation de mode par géofence** (École/Downtime déclenchés par lieu)
  et **V18 — rapport de conduite** (profil ado conducteur).
- **`dispatch-push`** : accélération push best-effort (infra-flaggée, L5) — non
  présente dans ce lot ; le **polling + Realtime** restent le socle.
