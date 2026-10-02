# Découpage en lots (work packages)

Chaque lot livre un **incrément complet et vertical** : schéma SQL + policies RLS + Edge Functions +
UI parent + module natif enfant + tests. Un lot est « fini » quand il est testé sur **≥ 3 surcouches
OEM** (Pixel / Samsung / Xiaomi — différences Doze) et que la fiche **Data safety** est à jour.

## Vue d'ensemble

| Lot | Nom | Objet | Dépend de | Risque Play |
|-----|-----|-------|-----------|-------------|
| **L0** | Socle & Conformité | Famille, appairage, auth, backend+FCM, onboarding permissions, transparence minimale | — | faible |
| **L1** | Observation transparente | Temps d'écran, rapports, inventaire apps | L0 | faible |
| **L2** | Règles d'accès | Blocage par app, limites, planning, Downtime, pause | L0, L1 | moyen (overlay / owner) |
| **L3** | Localisation & Sécurité | Temps réel, geofencing, SOS, batterie, ICE | L0 | ⚠️ élevé (background location + vidéo) |
| **L4** | Filtrage réseau & contenu | VpnService local DNS, SafeSearch, catégories, anti-contournement | L0 | ⚠️ élevé (déclaration VpnService) |
| **L5** | Gestion à distance & communication | Verrouillage visible, messagerie interne, demandes/approbations | L0, L2 | moyen (Device Admin) |
| **L6** | Bien-être & sécurité avancée (ado) | Alertes on-device mots-clés/image, mode ado, catégories de signaux | L0, L4 | moyen |
| **L7** | Transparence & Audit *(transversal)* | `audit_log`, tableau « mes données », visibilité mutuelle, anti-désinstallation visible | démarre **dès L0** | faible |
| **L8** | Privacy Ops & Publication | Rétention pg_cron, export/suppression RGPD, allègement par âge, hardening, formulaires Play | tous | — |
| **L9** | Famille & extras *(nice)* | Tâches, récompenses, allocation, calendrier, ressources | L0 | faible |

## Détail des lots

### L0 — Socle & Conformité  *(1er à attaquer)*
**Livrables**
- Projet **Supabase** créé ; migration SQL initiale : `families`, `memberships`, `children`,
  `devices`, `device_push_tokens`, `consents`, `audit_log`.
- **RLS** + fonctions helper `is_member_of()` / `has_role()` ; **custom access token hook** (claims).
- Edge Function **d'appairage** (code/QR, TTL, usage unique, haché).
- **Auth** : MFA parent, provisioning compte enfant, device-binding (Keystore).
- Squelette **app enfant** Kotlin : foreground service + **notification de supervision persistante** (K1).
- Squelette **console parent** React : création famille, appairage d'un appareil.
- **Onboarding permissions** guidé + **double consentement** (K4).
- Intégration **FCM** (Edge Function `dispatch-push`, clés en Vault).
- Base conformité : politique de confidentialité + notice enfant, fiche Data safety initiale, `isMonitoringTool=child_monitoring`.

**Critère d'acceptation** : un parent crée une famille, appaire un appareil enfant **visible et
transparent**, l'enfant voit la notification de supervision et un écran « mes données » minimal.

### L1 — Observation transparente
- `UsageStatsManager` (polling via foreground service `dataSync`) → temps d'écran global/app/catégorie.
- **Rapports / tableaux de bord** parent (F1, F2) + rapports email (F3).
- **Inventaire des apps** (`LauncherApps` + `<queries>` ciblé) (B6).
- Sync chiffrée des **agrégats** (jamais de contenu).
**Fonctions** : A1–A3 (mesure), A12, F1–F3, F7 (temps), B6.

### L2 — Règles d'accès
- Blocage par app (overlay en Standard ; `setPackagesSuspended()` en Renforcé) (B1).
- Limites de temps par app/catégorie (A2, A3), planning (A4), Downtime/coucher (A5), mode École (A6),
  liste blanche (A7), pause instantanée (A8), demandes de temps + récompenses (A9, A10).
- Validation d'installation (B2), restriction par classification d'âge (B4).

### L3 — Localisation & Sécurité  ⚠️ *permissions sensibles*
- `FusedLocationProviderClient` + foreground service `location` → temps réel (D1) & à la demande (D2).
- Historique trajets (D3), **geofencing** + alertes (D4–D6), batterie faible + dernière position (D7).
- **Bouton SOS** + diffusion live (E1, E2), contacts ICE + fiche médicale (E3), SOS discret (E4),
  « surveille mon trajet » (E5), ACK (E6).
- **Préparer la déclaration Play** (background location + **vidéo de démo**).

### L4 — Filtrage réseau & contenu  ⚠️ *déclaration VpnService*
- `VpnService` **local** (sinkhole DNS) : catégories (C1), listes blanche/noire (C2), SafeSearch
  (C3, C4), profils par âge (C5), Ask to Browse (C6), blocage adulte (C7), anti-contournement (C9).
- Journal des **domaines** (métadonnées) pour F4–F6 (transparent).
- **Préparer la déclaration Play** VpnService (rôle « core », pas de MITM, trafic local).

### L5 — Gestion à distance & communication
- Verrouillage/pause visible `lockNow()` via Device Admin/owner + FCM (H1).
- **Messagerie interne** parent↔enfant (H2, H4), demandes/approbations (H3, C6, A9).
- Notifications d'installation d'app (B2).

### L6 — Bien-être & sécurité avancée (profil ado, transparent)
- Détection **on-device** mots-clés de risque → alerte (G1, G2), image sensible + floutage (G3),
  motif grooming (G4), alertes par niveau d'âge (G5), tableau parent par **catégories** (G6).
- **Mode ado** (K6), visibilité mutuelle, pause de confidentialité non silencieuse (K8).
- ⚠️ **Strictement on-device + alertes**, jamais d'upload de contenu brut (voir [`02-CONFORMITE.md`](02-CONFORMITE.md)).

### L7 — Transparence & Audit  *(transversal, démarre dès L0)*
- `audit_log` append-only (K3), tableau « mes données » enfant (K2), notification persistante (K1),
  visibilité mutuelle, alerte transparente de tentative de désinstallation (K12), paramètres élevés par défaut (K5).

### L8 — Privacy Ops & Publication
- Rétention **pg_cron** (durées par type, purge/anonymisation) (K9), **export & suppression RGPD** (K10),
  allègement par âge + fin à 18 ans (K7, K11).
- **Hardening** : pentest RLS, advisors Supabase, chiffrement applicatif des données sensibles.
- Tests **multi-OEM**, **formulaires Play** (background location + vidéo, VpnService, QUERY_ALL_PACKAGES),
  AIPD finale, politique de rétention publiée.

### L9 — Famille & extras *(nice-to-have)*
- Tâches/corvées (I1), récompenses/points (I2), allocation (I3), calendrier partagé (I4),
  répertoire de ressources & lignes d'écoute (I5).

## Graphe de dépendances

```
L0 ──┬── L1 ──► (publication v1 : socle transparent + observation)
     │
     ├── L2 ──► L5
     ├── L3
     ├── L4 ──► L6
     ├── L7  (transversal, dès L0)
     └── L9
        tous ──► L8 (durcissement + publication finale)
```

## Ordre d'attaque recommandé

1. **L0** → **L1** → publier une **v1** à faible risque de review.
2. **L2** (contrôle) + **L7** (transparence, en continu).
3. **L3** et **L4** (déclarations Play — anticiper les délais Google).
4. **L5**, puis **L6** (profil ado).
5. **L8** avant chaque soumission majeure ; **L9** au fil de l'eau.
