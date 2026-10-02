# LOT 5 — Gestion à distance & communication (tranche 1)

> Suite de L2. Cette tranche livre la **messagerie interne** parent↔enfant et
> l'**accélération FCM** des commandes. Le **verrouillage/pause visible** (H1) et
> les **demandes/approbations** (H3) sont déjà livrés en L2 (`commands`,
> `requests`). Respecte la ligne rouge : messagerie propriétaire uniquement,
> jamais d'interception d'apps tierces ; urgence 112 jamais entravée.

## 1. Livré dans cette tranche

### Backend (migration additive `0011`)
- `messages` — fil parent↔enfant par enfant (`sender` contraint à `parent`/`child`
  pour empêcher l'usurpation), `read_at` (accusé de lecture). RLS 100 % : parent
  R/W sa famille, enfant lit/écrit **son** fil. Pas de contenu de tiers, pas de
  pièces jointes dans cette tranche.

### Edge Function `dispatch-push` (FCM HTTP v1)
- Envoie un push **data-only** `{type:"sync"}` aux appareils actifs de l'enfant
  pour déclencher une synchro immédiate (commandes + messages). **N'embarque aucun
  contenu** : l'action visible vient du contenu lu ensuite sous RLS.
- **Infra-flaggé** : actif seulement si les secrets `FCM_PROJECT_ID`,
  `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (compte de service, Vault/env) sont
  définis ; sinon `reason:"fcm_not_configured"` (non bloquant). Côté app enfant,
  nécessite `google-services.json` + un `FirebaseMessagingService` (branchement
  réception → déclenche la boucle de synchro). **À finaliser en L8** (secrets +
  déclaration). Le polling (SupervisionService ~15 s + WorkManager) reste le socle.

### Console parent
- Onglet **Messages** : fil de discussion (bulles), envoi, accusé de lecture des
  messages de l'enfant, appel best-effort de `dispatch-push` après envoi. `rules.ts`
  appelle aussi `dispatch-push` après chaque commande (pause/verrouillage) pour la
  réactivité. `typecheck` + `build` OK.

### Application enfant (relue, non compilable ici)
- `SupervisionService` récupère les nouveaux messages du parent au même rythme que
  les commandes et affiche une **notification visible** (canal « Messages des
  parents »), puis marque lu + avance un filigrane (`SupervisionStore.messageWatermark`).
  `PolicyClient.newParentMessages` / `markMessagesRead`.

### Durcissement attaché
- Tests unitaires JVM du **`PolicyEngine`** (L2) : exemption 112, always_allow,
  pause, Downtime/plages/École, vacances, blocages app/catégorie, quotas
  (app/catégorie/global + bonus), fenêtres franchissant minuit. (Non exécutés ici :
  pas de SDK/Gradle — à lancer en CI/Android Studio.)
- Migration `0010_cleanup_l1_residuals.sql` : nettoyage des résidus L0/L1 (sonde
  `_l1_write_probe`, colonne `comm_events.counterparty_label`, trigger 0003). ⚠️
  **DESTRUCTIF → à appliquer via SQL Editor / `supabase db push`** (les DROP
  timeout par le MCP). Idempotent (IF EXISTS).

## 2. Tranches L5 suivantes (non livrées ici)

- **Code parent hors-ligne (V2)** : déverrouiller/accorder du temps sans réseau.
  Nuance de sécurité à traiter : la vérification hors-ligne exige le hash du code
  sur l'appareil, or l'enfant peut lire ses propres lignes (RLS) et brute-forcer
  un code court. Design retenu pour la prochaine tranche : hash **non exposé au
  compte enfant** (lecture via Edge Function réservée à l'appareil enrôlé, ou
  distribution chiffrée liée à l'appareil), codes courts à **usage unique + TTL**,
  robustesse réelle en mode **Renforcé** (stockage non lisible par l'enfant).
- **Contacts autorisés / blocage de contacts (V1/V11)** : nécessite une approche
  call-screening/`RoleManager` + listes ; déclaration Play. À cadrer séparément.
- **Compose côté enfant** d'une réponse dans le fil (actuellement : notification
  de réception ; le sens enfant→parent existe en base/RLS).
- **Verrouillage avec message personnalisé** (V16) : déjà possible via la commande
  `message` (L2) ; une surcouche écran de verrouillage dédiée viendra avec le code
  hors-ligne.
