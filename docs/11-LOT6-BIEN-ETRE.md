# LOT 6 — Bien-être & sécurité avancée (profil ADO, transparent)

> Module **G** du [cahier des charges](01-CAHIER-DES-CHARGES.md) + **K6/K8**. Dépend de L0 et L4.
> Lire d'abord [`02-CONFORMITE.md`](02-CONFORMITE.md) (la ligne rouge) et [`04-LOTS.md §L6`](04-LOTS.md).

Ce lot ajoute une détection de risque **strictement sur l'appareil** (texte des notifications), qui
produit une **alerte de métadonnées** pour le parent — **jamais** le contenu. Fonction réservée au
profil **ado (preteen/teen)**, transparente, désactivée par défaut, suspendable par l'ado.

---

## 🔴 La ligne rouge (critère d'acceptation n°1) — et sa preuve

> **Le contenu analysé ne quitte JAMAIS le téléphone.** On analyse le texte des notifications
> **sur l'appareil** (moteur Kotlin pur), on en déduit 0..n **signaux** `{catégorie, gravité}`, et on
> ne remonte au backend **que ces signaux de métadonnées**. Aucun upload de texte, d'extrait, de
> capture, ni de contenu de correspondance de tiers (art. 226‑15). Aucun keylogger, aucun enregistrement
> audio/vidéo, aucune capture d'écran. 112/urgences jamais entravés.

### Preuve n°1 — le schéma de données est *incapable* de stocker un contenu

La table `safety_signals` (migration [`0019`](../supabase/migrations/0019_l6_safety_signals.sql)) n'a
**aucune colonne de texte libre de contenu** :

| Colonne | Type | Nature |
|---------|------|--------|
| `id` | uuid | technique |
| `family_id` / `child_id` / `device_id` | uuid (FK) | routage/isolation |
| `category` | `app.safety_category` (enum fermé) | **métadonnée** : `harassment` \| `grooming` \| `sexual_content` \| `self_harm` \| `drugs` |
| `severity` | `app.safety_severity` (enum) | **métadonnée** : `low` \| `medium` \| `high` |
| `source_app` | text (≤200, **nom de paquet/libellé**) | **métadonnée** : quelle app a produit la notification (ex. `com.whatsapp`) |
| `occurrence_count` | smallint (1..100) | **compteur** (nombre de correspondances agrégées) |
| `occurred_at` / `created_at` | timestamptz | horodatage |
| `acknowledged_at` / `acknowledged_by` | timestamptz / uuid | acquittement parent |

Les seuls champs textuels (`source_app`) sont un **identifiant d'application**, borné et typé comme
tel. Il n'existe **pas** de colonne `text`, `body`, `excerpt`, `snippet`, `message`, `content`… — et un
`COMMENT ON TABLE` l'inscrit noir sur blanc. **Ajouter une telle colonne doit être refusé en revue.**

### Preuve n°2 — le flux de données (où le texte vit et meurt)

```
┌─────────────────────────── TÉLÉPHONE DE L'ADO (tout est local) ───────────────────────────┐
│                                                                                             │
│  NotificationListenerService.onNotificationPosted(sbn)                                      │
│     │  extrait title+text+bigText depuis sbn.notification.extras   ← le texte (String local)│
│     ▼                                                                                       │
│  SafetyDetectionEngine.analyze(text, sourceApp): List<SafetySignal>   ← moteur PUR, 0 I/O   │
│     │  (lexique FR par catégorie + heuristiques de motif ; aucun log, aucune écriture)      │
│     ▼                                                                                       │
│  le `text` sort de portée ici → détruit par le GC. JAMAIS persisté, loggé, mis en cache.    │
│     │                                                                                       │
│     ▼  on ne transporte QUE des signaux {category, severity, count}                         │
│  SafetyClient.reportSignals(signals, sourceApp)                                             │
└─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                │  HTTPS — payload = métadonnées uniquement
                                                ▼
                       Supabase: INSERT public.safety_signals (category, severity,
                                 source_app, occurrence_count, occurred_at)    ← 0 contenu
                                                │
                                                ▼
                       Console parent : tableau par CATÉGORIES (G6)    ← 0 contenu
```

Le texte de la notification est une **variable locale transitoire** passée au moteur et aussitôt
abandonnée. Il n'est **jamais** écrit dans `SupervisionStore`, `SafetyCache`, un log, ni un payload.

### Preuve n°3 — grep adverse (à rejouer en revue)

Le périmètre est conçu pour que la recherche suivante ne renvoie **aucun** chemin d'écriture de contenu :

```bash
# Côté Android : le texte analysé ne doit jamais atteindre un sink (réseau/log/stockage).
grep -rnEi '(bigText|extras|EXTRA_TEXT|notification\.tickerText)' apps/child-android/app/src/main \
  | grep -vE 'SafetyDetectionEngine|onNotificationPosted'    # ne doit sortir que du point d'analyse

# Aucune colonne de contenu dans la migration :
grep -nEi '(content|body|excerpt|snippet|message|texte|payload).*text' supabase/migrations/0019_*.sql
```

La catégorie/gravité/compteur/app source sont les **seules** données qui transitent. Le `source_app`
est le `packageName` (métadonnée d'origine, explicitement permise par le cahier).

---

## Architecture

### 1. Moteur de détection on-device — PUR et testable (comme PolicyEngine / DnsFilterEngine)

- `enforce`-style, sans I/O, sans Android, sans log :
  - `safety/SafetyModels.kt` — `enum SafetyCategory`, `enum SafetySeverity`, `data class SafetySignal(category, severity, matchCount)`, `data class SafetyConfig(enabled, …)`.
  - `safety/SafetyLexicon.kt` — `object` de **listes de mots-clés FR par catégorie** + motifs de
    grooming (G1/G2/G4 basiques), avec des matchers purs (normalisation : minuscules, suppression des
    diacritiques, bornes de mots). Framé comme un **lexique de démonstration** à remplacer/maintenir en
    production (même esprit que `DomainLists.kt`).
  - `safety/SafetyDetectionEngine.kt` — `fun analyze(text: String, sourceApp: String?): List<SafetySignal>`.
    Normalise, matche chaque catégorie, agrège par catégorie (compteur), calcule une gravité
    (plus de correspondances / motif de grooming combiné ⇒ gravité plus élevée), **ne renvoie que des
    signaux**. Aucune trace du texte.
- Tests **JVM JUnit4** : `SafetyDetectionEngineTest.kt` (cyberharcèlement, mal-être, grooming combiné,
  négatifs/faux positifs, normalisation accents, texte vide). Noms de tests comportementaux, assertions
  sur `category`/`severity` — **jamais** sur un contenu. Mirroir de `PolicyEngineTest`.

### 2. Capture — `NotificationListenerService` (on-device, événementiel)

- `safety/SafetyNotificationListener : NotificationListenerService`, déclaré dans le manifeste avec
  `android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"` et l'intent-filter
  `android.service.notification.NotificationListenerService`. **Lié par le système** uniquement quand
  l'accès est accordé (on ne le force jamais ; il n'y a pas de permission runtime).
- `onNotificationPosted` : garde-fous (profil ado, `analysis_enabled`, pas de pause active, on ignore sa
  propre app et la notification de supervision) → extrait le texte → `SafetyDetectionEngine.analyze(...)`
  **sur l'appareil** → `SafetyClient.reportSignals(...)` (métadonnées). Le texte n'est ni stocké ni loggé.
- `onListenerConnected` / `onListenerDisconnected` → `SafetyClient.reportStatus(active)` (table
  `safety_status`, mirroir de `filter_status`) : rend **transparent** le fait que l'analyse tourne ou a
  été coupée (y compris quand l'ado révoque l'accès).
- **Piège Android 13+ « paramètres restreints »** : pour une app **sideloadée** (hors store), l'accès
  aux notifications (comme l'accessibilité) est bloqué par *Restricted settings* tant que l'utilisateur
  n'a pas fait « Autoriser les paramètres restreints » depuis l'écran **Infos de l'application**. La
  [notice d'installation](10-INSTALLATION.md) documente cette étape (comme pour les autres accès L8a).

### 3. Backend — tables de métadonnées (migration 0019, additive)

| Table | Rôle | Écriture | Lecture |
|-------|------|----------|---------|
| `safety_signals` | **alerte de métadonnées** (G1/G4/G6) — 0 contenu | appareil (INSERT) ; parent (acquitte) | parent + l'ado concerné |
| `safety_settings` | config « mode ado » par enfant : `analysis_enabled` (OFF par défaut), `mutual_visibility` (K6) | parent | parent + l'ado (transparence) |
| `safety_status` | état de l'analyse par appareil (`analysis_active`, heartbeat) | appareil | parent + l'ado |
| `privacy_pauses` | **pause de confidentialité K8** (non silencieuse) | **l'ado** (ouvre/clôt) | parent + l'ado |

RLS (100 %, mêmes leçons L3/L5) :
- **SELECT** = `app.is_parent_of(family_id) or child_id = app.current_child_id()` (jamais `is_member_of`
  seul → fuite inter-enfants).
- **INSERT appareil** = `child_id = current_child_id()` **et** `device_belongs_to_current_child(device_id)`
  **et** cohérence `family_id ↔ child_id` via sous-requête **qualifiée par le nom de la table**.
- `safety_signals` : INSERT interdit d'auto-acquitter ; UPDATE réservé au parent et **borné par trigger**
  `app.safety_signals_guard_update` (seul `acknowledged_*` modifiable — les faits reportés sont immuables).
- `privacy_pauses` : UPDATE réservé à l'ado, **borné par trigger** (seule la clôture `ended_at` ;
  pas de réouverture ; pas de re-parentage). **Le parent ne peut PAS lever la pause** (K8).
- Realtime activé sur `safety_signals`, `safety_status`, `privacy_pauses` (RLS appliquée au flux).

### 4. Console parent — tableau par CATÉGORIES (G6)

Vue **« Sécurité ado »** (design crème/corail, couleurs CVD-safe `var(--series-N)`) :
- Agrégats de `safety_signals` **par catégorie / gravité / période** (jamais de contenu).
- Réglages : activer l'analyse (co-consentement), visibilité mutuelle (K6).
- Bandeau **pause de confidentialité active** (K8) : « Ton ado a mis une pause — tu vois qu'une pause est
  active, pas ce qu'elle masque. »
- **Ressources d'aide** statiques : **3018** (cyberharcèlement, e-Enfance), **PHAROS**
  (signalement en ligne), **3114** (souffrance/prévention du suicide).

### 5. App ado — transparence (`MyDataScreen`)

En langage clair : « Le texte de tes notifications est analysé **sur ton téléphone** pour repérer des
situations de danger. Tes parents reçoivent seulement une **alerte de catégorie** (ex. "harcèlement"),
**jamais** tes messages. Tu peux **désactiver** cette analyse (retirer l'accès aux notifications) ou
mettre une **pause** — tes parents voient qu'une pause est active, pas son contenu. » + carte
d'autorisation deep-linkant vers `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`.

---

## Modèle de consentement & transparence

- **Privacy by default (art. 25)** : `analysis_enabled = false` par défaut. L'activation suppose le
  **co-consentement** (autorité parentale + **assentiment de l'ado**, art. 8 RGPD / CNIL) et n'est
  proposée **que** pour preteen/teen.
- **Transparence (K2)** : la config et l'état sont **lisibles par l'ado** (RLS `current_child_id`) et
  affichés dans « mes données ». L'analyse est annoncée, pas occulte.
- **Information d'abord l'ado (G2)** : l'ado est informé que la détection tourne ; (tranche 2 : une
  ressource/notification à l'ado lors d'un signal grave).
- **Révocabilité** : l'ado retire l'accès aux notifications → l'analyse s'arrête → `safety_status`
  passe `analysis_active=false` (visible du parent, jamais masqué).

## Gradation par âge (K6/K7)

| Profil | Analyse de notifications | Visibilité |
|--------|--------------------------|------------|
| **young_child (~6 ans)** | **Totalement OFF** : ni service actif, ni demande d'accès, ni option dans la console. | — |
| **preteen / teen (~12  ans+)** | **Activable** en version transparente on-device, après co-consentement ; OFF par défaut. | **Mutuelle** (K6) : l'ado voit ce que le parent voit. |

Source de vérité d'âge : `children.age_profile` (`young_child` \| `preteen` \| `teen`). La console ne
propose/active jamais l'option pour `young_child` ; l'app ne lie pas le listener et ne demande pas
l'accès pour ce profil (défense en profondeur côté client **et** côté UI parent).

## Pause de confidentialité NON silencieuse (K8)

L'ado peut suspendre l'analyse/le partage via `privacy_pauses` : pendant une pause active, l'appareil
**n'analyse plus et n'émet plus** de signaux. Mais la **ligne de pause est visible du parent** (SELECT
parent) : il sait **qu'**une pause est active (et depuis quand / jusqu'à quand), **jamais** ce qui est
masqué. C'est l'ado qui ouvre et **clôt** sa pause ; le parent ne peut pas la lever (garde-fou trigger).
Visibilité mutuelle, symétrique — conforme à l'esprit co-régulation (CNIL) plutôt que surveillance.

## Push best-effort (optionnel, hors socle)

`dispatch-push` existe (infra-flaggé, FCM non configuré — décision du propriétaire). Une alerte de
**gravité haute** *pourrait*, en option, déclencher un push best-effort **contenant uniquement des
métadonnées** (catégorie/gravité/app), **jamais** de contenu. **Le polling de la console reste le
socle** ; aucun push n'est câblé dans cette tranche.

---

## Reporté en tranche 2 (design documenté, non implémenté)

- **G3 — Détection d'image sensible (nudité) + floutage** : nécessite **ML Kit on-device** (classifieur
  d'image), lourd (taille APK, perf, faux positifs). Design : classification **locale** de l'image reçue,
  **floutage** dans l'app + avertissement à l'ado, et — toujours — **seule** une alerte de catégorie
  `sexual_content` remonte (jamais l'image). À isoler derrière un flag et une variante de build.
- **G5 — Réglage fin de sensibilité par niveau d'âge** : seuils/lexiques modulables par `age_profile`
  (comme `FILTER_PRESETS` est calculé côté console puis appliqué en champs concrets par l'appareil).
- **Signalement automatisé aux autorités** (3018/PHAROS) : la tranche 1 se limite à des **liens
  informatifs statiques**. Toute automatisation implique des enjeux juridiques (qualification,
  responsabilité) à cadrer avec un juriste/DPO.
- **G2 complet** : notification in-app à l'ado + ressources contextualisées lors d'un signal grave.

---

## Vérifications effectuées

- Migration **0019 additive** appliquée en live (projet `xjfuaszukuumqxgzitzq`) ; `pg_policies`
  revérifiées (SELECT isolé par enfant, INSERT appareil scindé, sous-requêtes qualifiées, garde-fous
  d'UPDATE) ; `get_advisors(security)` : **aucun nouveau finding** (le seul finding `_l1_write_probe`
  est **pré-existant** à L1, hors périmètre L6).
- `apps/parent-web` : `npm run typecheck` + `npm run build` OK.
- App Android : compilation + lint (CI L8a) ; tests JVM du moteur de détection.
- **Grep adverse ligne rouge** : aucun chemin où un texte de notification serait écrit en base, loggé,
  mis en cache, ou inséré dans un payload — vérifié (voir « Preuve n°3 »).
