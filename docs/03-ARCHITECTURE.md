# Architecture technique

## 1. Vue d'ensemble

```
┌─────────────────────┐        ┌──────────────────────────────┐        ┌─────────────────────┐
│   APP ENFANT        │        │        BACKEND (Supabase)      │        │  CONSOLE / APP      │
│  Android natif      │        │                                │        │  PARENT             │
│  Kotlin + Jetpack   │        │  Postgres (RLS) ── source de   │        │  Web React (+ RN)   │
│                     │◄──────►│   vérité                       │◄──────►│                     │
│  • UsageStats       │ Realtime│  Auth (GoTrue) + MFA parent   │Realtime│  • Gestion famille  │
│  • FusedLocation    │  + FCM │  Realtime (live + commandes)   │ + push │  • Règles/policies  │
│  • Geofencing       │        │  Edge Functions (Deno)         │        │  • Carte live       │
│  • VpnService local │        │  Storage (privé + URLs signées)│        │  • SOS / alertes    │
│  • Overlay / Device │        │  pg_cron (rétention)           │        │  • Messagerie       │
│    Admin / Owner    │        │  Vault (clés FCM/APNs)         │        │  • Audit            │
└─────────────────────┘        └──────────────────────────────┘        └─────────────────────┘
```

**Pourquoi natif pour l'app enfant** : les API de supervision (UsageStats, DevicePolicyManager,
VpnService, Geofencing) **ne sont pas accessibles en cross-platform** (Flutter/RN). Le cœur de
supervision **doit** être en Kotlin. La console parent, elle, n'utilise aucune API OS sensible →
cross-platform OK (React / React Native).

## 2. Stack retenue

| Couche | Techno | Notes |
|--------|--------|-------|
| App enfant | **Kotlin + Jetpack** (Compose, WorkManager, Room, foreground services) | Modules par lot ; Room pour le cache local des règles |
| Console parent | **React** (Next.js ou Vite) + `supabase-js` | **Jamais** la `service_role` côté client |
| App parent mobile | **React Native** | Push, carte live, approbations |
| Backend | **Supabase** : Postgres + Auth + Realtime + Edge Functions + Storage + pg_cron | Edge Functions (Deno) pour toute logique privilégiée |

## 3. Modèle de données (centré `family_id`)

Toutes les tables métier portent `family_id` pour l'isolation RLS.

| Table | Rôle |
|-------|------|
| `families` | Le foyer |
| `memberships(user_id, family_id, role)` | Rôle **porté par l'appartenance** : `owner`/`parent`/`guardian`/`child` (jamais un rôle global côté client) |
| `children` | Profil enfant (âge, préférences, curseur d'intrusivité) |
| `devices(family_id, child_id, platform, push_token, public_key, enrolled_at)` | Appareils appairés ; clé publique par appareil |
| `device_push_tokens` | Tokens FCM/APNs |
| `consents(child_id, purpose, basis, granted_by, version, ts)` | Consentement **par finalité** |
| `policies` | Règles : `screen_time`, `app_rules`, `web_rules`, `schedules` |
| `locations` *(partitionnée/mois)* | Historique de positions |
| `geofences`, `geofence_events` | Zones + transitions |
| `commands(device_id, type, payload, status, expires_at)` | Commandes parent→enfant + ACK |
| `alerts` | SOS, batterie, risques on-device (signaux, pas contenu) |
| `requests` | Demandes enfant→parent (temps, déblocage) + approbations |
| `messages` | Messagerie **interne** parent↔enfant |
| `audit_log` *(append-only)* | Qui a consulté/modifié quoi, quand — **lisible par l'enfant** |

## 4. Sécurité

- **Auth** : MFA obligatoire pour les parents. Compte enfant **provisionné par le parent** via Admin
  API (Edge Function), sans exiger d'email perso. Claims JWT enrichis via **custom access token hook**
  (`family_ids`, `role`) — jamais depuis `user_metadata` (modifiable par l'utilisateur). Sessions
  courtes côté enfant ; **device-binding** (clé privée en **Keystore**).
- **RLS sur 100 % des tables** : fonctions `SECURITY DEFINER` `is_member_of(family_id)` /
  `has_role(family_id, role)`. Parent = R/W sur sa famille ; enfant = lecture de **ses** données + de
  ce que le parent voit (transparence), écriture limitée (SOS, requests) ; **jamais** d'accès à une
  autre famille. `service_role` **confinée** aux Edge Functions. **Realtime Authorization** (RLS sur
  `realtime.messages`) pour fermer les canaux privés. **Tests RLS automatisés en CI**.
- **Chiffrement** : au repos par défaut ; secrets (FCM/APNs) dans **Vault** (jamais en clair) ;
  Storage privé + URLs signées à TTL court ; pour les données ultra-sensibles, **chiffrement applicatif
  côté client** (clé non détenue par le serveur). **Ne jamais déchiffrer le HTTPS de l'enfant.**
- **Appairage** (LOT 12) : code de **10 caractères base32 Crockford** (`7KQ2M-X9D4F`, ≈ 10^15
  combinaisons) généré par le parent via la RPC `pairing_start`, **TTL 10 min, usage unique, stocké
  haché**. L'appareil enfant ouvre une **session anonyme** Supabase puis appelle la RPC
  `pairing_complete` (limites anti force brute en base) ; sa session devient celle de l'appareil.
- **Audit** : `audit_log` **append-only** (trigger refusant UPDATE/DELETE) ; `pgAudit` niveau base.
- **Advisors Supabase** (sécurité/perf) suivis en continu.

## 5. Temps réel & commandes

- **Localisation live** : Realtime **Broadcast** éphémère (haut débit) + insert *throttlé* en base
  pour l'historique (préférer Broadcast à Postgres Changes pour le flux de positions).
- **Commandes parent→enfant** (`commands` + Broadcast pour livraison immédiate) ; l'appareil **ACK**
  en repassant `status=done`. **Repli par polling/WorkManager** si le push high-priority est rétrogradé
  par Doze.

## 6. Pièges Android (13/14/15) à gérer

- Déclarer les `foregroundServiceType` (`location`, `dataSync`, `specialUse`) requis depuis Android 14.
- `POST_NOTIFICATIONS` (Android 13+).
- **Doze / App Standby** : FCM high-priority parfois rétrogradés → repli polling ; re-enregistrer
  **geofences et VPN après reboot** (`RECEIVE_BOOT_COMPLETED`).
- `ACCESS_BACKGROUND_LOCATION`, `QUERY_ALL_PACKAGES`, `AccessibilityService` → **formulaires de
  déclaration Play** + justification (vidéo de démo pour la localisation en arrière-plan).
- **Family Link** : aucune API/SDK publique → se positionner en **complément/alternative**, ne pas en dépendre.

## 7. Découpage en services (logiques)

`Identity & Family` · `Device & Pairing` · `Policy` · `Realtime & Commands` · `Location & Geofencing`
· `Notifications` · `Transparency & Audit` · `Privacy Ops`. Chaque service = tables + policies RLS +
Edge Functions + UI parent + module natif enfant + tests. Correspondance avec les **lots** :
[`04-LOTS.md`](04-LOTS.md).
