# LOT 12 — Contrat d'appairage pour l'app enfant Android (`apps/child-android`)

Source de vérité côté serveur : `supabase/migrations/0031_l12_pairing_complete_rpc.sql`
(RPC `public.pairing_complete`, `public.pairing_start`, `app.pairing_code_normalize`),
banc de test `supabase/tests/run.sh` (201 assertions vertes, dont T16 pour le nouveau code).

Résumé : l'appareil **n'appelle plus aucune Edge Function**. Il ouvre une **session
anonyme** Supabase (GoTrue), puis appelle la RPC PostgREST `pairing_complete` avec
le jeton de cette session. En cas de succès, **cette session anonyme devient la
session de l'appareil** (c'est elle qu'on stocke dans `SupervisionStore.Enrollment`
et qu'on rafraîchit ensuite). Aucun secret dans l'APK hormis la clé **publiable**
(déjà présente : `Config.supabaseAnonKey`, publique par conception).

Notation : `URL` = `Config.supabaseUrl` (`https://xjfuaszukuumqxgzitzq.supabase.co`),
`KEY` = `Config.supabaseAnonKey` (clé publiable `sb_publishable_…`).

---

## 1. Code d'appairage

- **10 caractères** de l'alphabet base32 de Crockford : `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
  (chiffres + lettres **sans I, L, O, U**). Affiché par la console en deux groupes de 5 :
  `7KQ2M-X9D4F`. Valable 10 min, usage unique. Le parent peut le copier sous la forme groupée.
- **Format valide après normalisation** : `^[0-9A-HJKMNP-TV-Z]{10}$`.

### Règles de normalisation (identiques au serveur — `app.pairing_code_normalize`)

Le serveur normalise lui-même toute saisie, dans cet ordre :
1. retrait des **espaces** (dont tabulations, sauts de ligne, espace insécable U+00A0,
   U+2007, U+202F, caractères de largeur nulle U+200B–U+200D, U+2060, U+FEFF) et des
   **tirets** (`-`, U+2010–U+2015, U+2212, U+FE58, U+FE63, U+FF0D) ;
2. passage en **majuscules** ;
3. équivalences Crockford : **`O` → `0`**, **`I` → `1`**, **`L` → `1`**.
4. puis contrôle du format ci-dessus (`U` n'a pas d'équivalent → refusé ; tout autre
   caractère → refusé). La saisie brute est bornée à **64 octets** (au-delà :
   `invalid_code_format`).

Côté appli (confort, le serveur reste l'arbitre) :
- champ texte `KeyboardType.Ascii` (ou `Password` visible), `KeyboardCapitalization.Characters`,
  `autoCorrect = false` ; remplacer le filtre actuel `it.length <= 8 && it.all(Char::isDigit)` ;
- à chaque frappe : garder `[0-9A-Za-z]` (ignorer espaces/tirets), majuscules, appliquer
  `O→0`, `I→1`, `L→1` ; refuser la frappe d'un `U` (ou l'afficher en erreur) ; limiter à
  **10 caractères significatifs** ;
- afficher groupé `XXXXX-XXXXX` (VisualTransformation : tiret après le 5e caractère) ;
- bouton **Valider** actif seulement si la forme normalisée correspond à
  `^[0-9A-HJKMNP-TV-Z]{10}$` ;
- envoyer la **forme normalisée de 10 caractères** (la forme groupée est aussi acceptée) ;
- coller depuis le presse-papiers `7KQ2M-X9D4F` ou `7kq2m x9d4f` doit fonctionner tel quel.

Ne jamais journaliser le code ni les jetons (Logcat, crash reports).

---

## 2. Inscription anonyme (GoTrue)

À faire **une seule fois par tentative d'appairage d'un appareil** (pas une par essai
de code). Conserver la session obtenue tant que l'appairage n'a pas abouti (voir §5).

```
POST {URL}/auth/v1/signup
apikey: {KEY}
Content-Type: application/json

{}
```
- Ne PAS envoyer `Authorization: Bearer {KEY}` (la clé publiable n'est pas un JWT ; l'en-tête
  `apikey` suffit).
- Corps `{}` (aucun e-mail, aucun mot de passe, aucune métadonnée — minimisation). Pas de
  `gotrue_meta_security` / `captcha_token` : **pas de CAPTCHA** (décision LOT 12).

**Réponse 200** (session) :
```json
{
  "access_token": "<JWT, claim is_anonymous=true, role=authenticated>",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1791120000,
  "refresh_token": "<jeton opaque>",
  "user": { "id": "<uuid>", "aud": "authenticated", "role": "authenticated", "is_anonymous": true, "...": "..." }
}
```
À stocker (EncryptedSharedPreferences, comme aujourd'hui) : `access_token`, `refresh_token`,
`expires_at` (secondes epoch), `user.id`.

**Erreurs GoTrue** (corps `{"code": <http>, "error_code": "<code>", "msg": "<texte>"}`) :

| HTTP | `error_code` (exemple) | Cause | Message conseillé pour l'enfant |
|---|---|---|---|
| 422 | `anonymous_provider_disabled` | « Allow anonymous sign-ins » pas activé côté projet | « L'appairage n'est pas encore activé. Préviens ton parent. » |
| 429 | `over_request_rate_limit` | limite d'inscriptions anonymes par IP atteinte (≈ 10/h) | « Trop de tentatives depuis ce réseau. Réessaie dans une heure. » |
| 5xx / réseau | — | indisponibilité | « Connexion impossible pour l'instant. Réessaie dans un moment. » |

---

## 3. Appel RPC `pairing_complete` (PostgREST)

```
POST {URL}/rest/v1/rpc/pairing_complete
apikey: {KEY}
Authorization: Bearer {access_token de la session anonyme}
Content-Type: application/json
Accept: application/json

{
  "p_code": "7KQ2MX9D4F",
  "p_device": {
    "platform": "android",
    "model": "Google Pixel 8",
    "os_version": "Android 14",
    "label": "Pixel 8"
  }
}
```
- Noms des paramètres **exacts** : `p_code` (texte), `p_device` (objet JSON).
- `p_device` : mêmes champs qu'avant, **aucune collecte nouvelle**. `platform` ∈
  `android|ios|web` (défaut `android`), `model` ≤ 120 car., `os_version` ≤ 40, `label` ≤ 80
  (tronqués et nettoyés côté serveur), `public_key` facultatif (≤ 4 096 car.). Objet
  entier ≤ 8 Kio.
- La réponse est **toujours HTTP 200 avec un objet JSON** pour les cas métier (les erreurs
  métier sont **renvoyées**, pas levées, pour que le compteur anti force brute soit
  enregistré). **Tester d'abord la présence de la clé `error`.**

### Succès (HTTP 200)
```json
{ "device_id": "<uuid>", "family_id": "<uuid>", "child_id": "<uuid>", "mode": "standard" }
```
`mode` ∈ `standard|reinforced`. Rejeu par la **même** session déjà appairée (réponse perdue
sur le réseau, double clic) : même objet + `"already_paired": true` → traiter comme un succès.

Après succès : `SupervisionStore.save(Enrollment(deviceId, familyId, childId, mode,
accessToken, refreshToken))` avec les jetons **de la session anonyme** (éventuellement
rafraîchis entre-temps). Facultatif : un rafraîchissement immédiat (§4) donne un JWT
contenant `app_metadata.child_id` / `families` (hook) ; la RLS n'en dépend pas.

### Erreurs métier (HTTP 200, `{"error": "<code>"}`)

| `error` | Signification | Action de l'appli | Libellé conseillé (enfant) |
|---|---|---|---|
| `invalid_code_format` | après normalisation, pas 10 caractères Crockford | rester sur l'écran | « Le code doit comporter 10 caractères (chiffres et lettres), par exemple 7KQ2M-X9D4F. » |
| `code_not_found` | aucun code correspondant | rester sur l'écran | « Code introuvable. Vérifie la saisie. » |
| `code_already_used` | code déjà consommé | rester sur l'écran | « Ce code a déjà été utilisé. Demande un nouveau code à ton parent. » |
| `code_expired` | code expiré (10 min) ou remplacé par un plus récent | rester sur l'écran | « Ce code a expiré. Demande-en un nouveau. » |
| `too_many_attempts` (+ `retry_after_seconds`, entier) | 5 échecs en 15 min pour cette session, ou plafond global | désactiver **Valider** pendant `retry_after_seconds` ; **ne pas** ouvrir une nouvelle session pour contourner | « Trop d'essais. Réessaie dans {n} min. » (n = arrondi supérieur de `retry_after_seconds / 60`) |
| `invalid_device` | `p_device` invalide (bug appli) | signaler (sans données perso) | « L'appareil n'a pas pu être enregistré. Mets l'application à jour ou réessaie. » |
| `device_already_paired` | cette session anonyme est déjà liée à un appareil **retiré** | jeter la session stockée, ouvrir une **nouvelle** session anonyme (§2), refaire l'appel **une fois** | si ça persiste : « Cet appareil doit être appairé à nouveau : demande un nouveau code à ton parent. » |
| `anonymous_session_required` | le jeton n'est pas celui d'une session anonyme (claim `is_anonymous` ≠ true ou compte non anonyme) | jeter la session, nouvelle session anonyme (§2), refaire l'appel **une fois** | « Un problème de connexion est survenu. Réessaie. » |
| `parent_account_forbidden` | compte parent (défense en profondeur, normalement inatteignable) | idem `anonymous_session_required` | idem |
| `not_authenticated` | jeton sans utilisateur | rafraîchir (§4) ou nouvelle session, refaire **une fois** | « Connexion impossible pour l'instant. Réessaie dans un moment. » |
| autre code | inconnu (version serveur plus récente) | rester sur l'écran | « Échec de l'association ({code}). » (chaîne `pairing_error_generic` existante) |

Les échecs `invalid_code_format`, `invalid_device`, `code_not_found`, `code_already_used`,
`code_expired` comptent pour la limite de 5 par session et par 15 min.
`anonymous_session_required` n'est pas compté.

### Erreurs HTTP (hors métier)

| HTTP | Cause probable | Action |
|---|---|---|
| 401 (`PGRST301`/`PGRST303`, JWT expiré/invalide) | jeton expiré | rafraîchir (§4) puis rejouer **une fois** (rejeu idempotent côté serveur) |
| 404 (`PGRST202`) | migration 0031 non appliquée | message générique, réessayer plus tard |
| 401/403 `permission denied for function pairing_complete` | appel sans jeton utilisateur (rôle `anon`) | bug : toujours envoyer `Authorization: Bearer {access_token}` |
| 5xx / délai (dont verrou `55P03` après 3 s) / réseau | indisponibilité, double appel simultané | réessayer **avec la même session** (idempotent) ; ne jamais lancer deux appels en parallèle |

---

## 4. Rafraîchissement de session

Inchangé dans le principe (`Config.tokenRefreshUrl`) :
```
POST {URL}/auth/v1/token?grant_type=refresh_token
apikey: {KEY}
Content-Type: application/json

{ "refresh_token": "<refresh_token stocké>" }
```
Réponse 200 : même forme que §2 (nouvel `access_token`, **nouveau `refresh_token`**,
`expires_at`).
- Les refresh tokens sont **à usage unique** (rotation) : enregistrer le nouveau
  `refresh_token` **avant** d'utiliser l'`access_token` (préférer `commit()` à `apply()`
  pour ce couple), et toujours remplacer l'ancien (ne pas retomber sur
  `optString(..., ancien)`).
- Un seul rafraîchissement à la fois (mutex) : deux workers qui rafraîchissent avec le
  même jeton invalident la session (réutilisation détectée au-delà de ~10 s).
- Rafraîchir de façon proactive si `expires_at - maintenant < 60 s`, et sur tout 401.
- Échec 400 (`refresh_token_not_found`, `refresh_token_already_used`, « Invalid Refresh
  Token ») ou 403 `user_not_found` : la session de l'appareil est **perdue** (compte
  anonyme purgé, session révoquée) → effacer l'enrôlement local et revenir à l'écran
  d'appairage (re-appairage, §5). Message : « La connexion de cet appareil a expiré :
  demande un nouveau code à ton parent. »

---

## 5. Cycle de vie et re-appairage

- **Avant appairage** : si aucune session anonyme « en attente » n'est stockée, en créer
  une (§2) au premier appui sur **Valider** ; la **réutiliser** pour les essais suivants
  (même utilisateur → limites cohérentes, pas d'inscription par essai). Si elle expire,
  la rafraîchir (§4).
- **Succès** : la session en attente devient la session de l'appareil (Enrollment).
- **Retrait par le parent** (révocation) : l'accès est coupé immédiatement côté base,
  même si le JWT est encore valide — lectures vides ; un INSERT ou un upsert est
  refusé (HTTP 403 / `42501` RLS, clause WITH CHECK) ; en revanche un **PATCH** (ex.
  accusé de réception d'une commande) filtré par la clause USING n'échoue PAS : il
  répond 200/204 sans modifier aucune ligne. Détection conseillée : au démarrage,
  après un 403 sur un INSERT/upsert, **et** après tout PATCH n'ayant affecté aucune
  ligne (envoyer `Prefer: return=representation` → corps `[]`, ou
  `Prefer: count=exact` → en-tête `Content-Range: */0`) :
  `GET {URL}/rest/v1/devices?id=eq.{device_id}&select=id,revoked_at` avec le jeton de
  l'appareil → tableau **vide** = appareil retiré (ou supprimé). Alors : effacer
  l'enrôlement **et** la session locale, afficher « Cet appareil a été retiré par ton
  parent. Pour le relier à nouveau, demande un nouveau code. », revenir à l'écran
  d'appairage.
- **Re-appairage** (téléphone réinitialisé, appareil retiré, session perdue) : toujours
  avec une **NOUVELLE session anonyme** (§2) et un **nouveau code**. Une session déjà
  liée à un appareil retiré reçoit `device_already_paired` : ne jamais la réutiliser.
- Le parent voit chaque appairage (`device.enrolled`) et chaque retrait
  (`device.revoked`) dans le journal d'audit ; les comptes anonymes orphelins sont
  purgés côté serveur après 7 jours.

---

## 6. À retirer / modifier dans `apps/child-android`

- `Config.pairingCompleteUrl` (`$supabaseUrl/functions/v1/pairing-complete`) : **supprimer**.
- `PairingClient.complete()` : supprimer l'appel à l'Edge Function `pairing-complete`
  (corps `{code, device}`, en-tête `Authorization: Bearer {KEY}`, lecture de
  `obj.getJSONObject("session")`) ; le remplacer par §2 (session anonyme, si besoin) + §3
  (RPC), les jetons venant de la session anonyme.
- Ajouter dans `Config` : `anonymousSignupUrl = "$supabaseUrl/auth/v1/signup"` et
  `pairingCompleteRpcUrl = "$supabaseUrl/rest/v1/rpc/pairing_complete"` (ou réutiliser
  `restUrl("rpc/pairing_complete")`).
- `PairingScreen` : champ texte alphanumérique (§1) au lieu de 8 chiffres ; `enabled`
  sur la forme normalisée de 10 caractères ; `mapError` complété avec les codes du §3
  (dont `too_many_attempts` + compte à rebours, `device_already_paired`,
  `anonymous_session_required`) et les erreurs GoTrue du §2.
- `strings.xml` : `pairing_error_invalid_format` = « Le code doit comporter 10 caractères
  (chiffres et lettres), par exemple 7KQ2M-X9D4F. » (au lieu de « 8 chiffres ») ; ajouter
  les libellés des tableaux §2/§3/§4/§5 ; texte d'aide du champ : « 10 caractères, avec
  ou sans tiret ».
- `SupabaseClient.refresh()` : rotation stricte du refresh token, mutex, gestion « session
  perdue » (§4).
- Tests JVM : normalisation/validation du code (cas `7kq2m-x9d4f`, `oa-Ib OC-lD 2e` →
  `0A1B0C1D2E`, `U` refusé, 9/11 caractères refusés), analyse des réponses (succès,
  `already_paired`, chaque `error`, `retry_after_seconds`).
- Ne rien ajouter d'autre (aucune collecte nouvelle, aucune clé de service, pas de CAPTCHA).
