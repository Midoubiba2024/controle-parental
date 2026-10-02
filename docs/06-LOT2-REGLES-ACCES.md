# LOT 2 — Règles d'accès : notes d'implémentation

> Incrément vertical : migrations SQL additives (0007, 0008) + RLS, console parent
> (onglets **Règles** et **Demandes**), moteur d'application Android, écran enfant
> « mes données » enrichi. Respecte la ligne rouge (transparence, pas de furtif,
> urgence 112 jamais bloquée) — voir [`02-CONFORMITE.md`](02-CONFORMITE.md).

## 1. Backend (Supabase)

Migrations **additives** (aucun DROP ; `ALTER POLICY` jamais nécessaire ici car
tout est nouveau) :

- **`0007_l2_access_rules`** : `access_policies` (réglages/enfant : limite
  quotidienne, délai de grâce V6, mode vacances V4, verrou réglages système V5,
  validation d'installation B2, classification d'âge B4), `screen_time_limits`
  (A1, par jour de semaine), `app_rules` (B1/A2/A3/A7, par app ou catégorie),
  `schedules` + `schedule_windows` + `child_schedules` (plannings **réutilisables** :
  horaires A4, Downtime A5, mode École A6). Trigger `app.log_rule_change()` →
  audit de chaque modification (K3, visible par l'enfant).
- **`0008_l2_commands_requests`** : `commands` (A8/H1/V15/V16, ACK enfant encadré
  par `app.commands_guard_child_update()`), `requests` (A9/A10/H3, co-régulation),
  `time_grants` (A10, bonus appliqués aux quotas).

**RLS** (100 % des tables) : parent R/W sa famille ; enfant **lit toutes ses
règles** (transparence) ; l'enfant crée/annule ses demandes et **accuse seulement
réception** des commandes (jamais s'auto-approuver ni lever un verrou — garde-fou
trigger). Helpers réutilisés : `app.is_parent_of`, `app.current_child_id`.
`search_path` figé sur les deux nouvelles fonctions. `get_advisors(security)`
après application : **aucun nouveau finding** (seul reste `_l1_write_probe`,
nettoyage L1 côté utilisateur).

## 2. Application Android (moteur d'enforcement)

- **`PolicyEngine`** (pur, testable, sans dépendance Android) : à partir de l'app
  au premier plan, de l'usage agrégé du jour et des règles, décide blocage + motif.
  Ordre : exemptions urgence → `always_allow` → blocage app → pause → plannings
  (sauf vacances) → blocage catégorie → validation d'installation → quotas
  (app, catégorie, global + bonus).
- **`EnforcementManager`** : détection du 1er plan (UsageStats), agrégation de
  l'usage du jour, liste d'exemption d'urgence (composeur par défaut, télécom,
  lanceur, notre app). **Ne bloque jamais pendant un appel** ni le composeur.
- **`BlockOverlay`** : overlay plein écran **visible** (SYSTEM_ALERT_WINDOW) ;
  boutons « demander plus de temps », « retour accueil », **« appel d'urgence
  (112) »**. N'emprisonne pas l'enfant.
- **`ReinforcedEnforcer`** : en **device owner**, `setPackagesSuspended()` pour les
  blocages statiques + `lockNow()` + restrictions système (date/heure, comptes,
  options dev). `AdminReceiver` (Device Admin) pour le verrouillage.
- **`CommandExecutor`** : applique pause/resume/lock/ring/message, puis acquitte.
- **`SupervisionService`** : boucle unique (une seule notification persistante) —
  évaluation ~3 s, commandes ~15 s, synchro des règles ~5 min. `PolicyCache`
  chiffré pour une application fiable hors ligne.

### Modes d'application

| Mode | Blocage apps | Verrou | Fiabilité | Pré-requis |
|------|--------------|--------|-----------|------------|
| **Standard** | Overlay au-dessus de l'app détectée au 1er plan | lockNow via Device Admin (si activé) | contournable (l'enfant peut tuer l'app / retirer l'autorisation) | SYSTEM_ALERT_WINDOW + accès usage |
| **Renforcé** | `setPackagesSuspended` / restrictions | `lockNow` + user restrictions | inviolable | **device owner** (provisioning dédié) |

### Voie Play & permissions (à préparer en L8)

- **SYSTEM_ALERT_WINDOW** : accordé par l'utilisateur (Réglages → « par-dessus les
  autres apps »). Usage « contrôle parental » documenté dans la fiche Play.
- **PACKAGE_USAGE_STATS** : permission spéciale (déjà L1), redirige vers les Réglages.
- **Device Admin / Device Owner** : activation explicite ; **jamais furtif** ;
  supervision visible (notification persistante). Device owner = provisioning QR
  (hors flux grand public standard) → positionné comme option « entreprise/famille
  dédiée ».
- **`AccessibilityService` = DERNIER RECOURS** : non utilisé ici. Google impose un
  formulaire de déclaration spécifique (justification d'usage, politique
  « IsAccessibilityTool ») et le refuse souvent pour le contrôle parental. On
  privilégie **UsageStats + overlay** (Standard) et **device owner** (Renforcé).
  À n'envisager qu'avec déclaration Play dédiée si la détection du 1er plan devient
  insuffisante sur certaines surcouches OEM.
- **`isMonitoringTool=child_monitoring`** : à régler à la publication (anti-stalkerware).

### Livraison des commandes

Le modèle repose sur le **polling** (boucle service ~15 s + repli WorkManager sous
Doze) — il **ne dépend pas de FCM**. L'accélération par **push FCM high-priority**
(Edge Function `dispatch-push`) est rattachée au **LOT 5** (gestion à distance) ;
elle viendra réduire la latence sans changer le contrat des tables `commands`.

## 3. Console parent (React, identité prototype)

- Onglet **Règles** : temps d'écran (limite globale + par jour + préréglages par
  âge V6 + délai de grâce), pause/verrouillage instantané (+ message, sonner),
  mode vacances / verrous système / validation d'install / classification d'âge,
  règles par catégorie, règles par application (avec filtre « nouvelles apps »
  pour B2), plannings réutilisables (fenêtres par jour, Downtime/École/plages).
- Onglet **Demandes** : approuver/refuser (crée un `time_grant` ou une règle
  `allow`), octroi de bonus manuel, historique.

Vérifs : `npm run typecheck` + `npm run build` OK.

## 4. Points en attente (non bloquants, côté utilisateur)

- Nettoyages L0/L1 déjà signalés : migration 0003 (drop trigger) non appliquée en
  live, table sonde `public._l1_write_probe` à droper, colonne
  `comm_events.counterparty_label` (désormais null, drop optionnel). À faire via
  `supabase db push` / SQL Editor (les DROP timeout par le MCP).
- Tests multi-OEM (Pixel/Samsung/Xiaomi — Doze) et déclarations Play : **L8**.
