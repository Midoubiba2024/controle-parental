# Mise en route (SETUP)

## Projet Supabase

| Clé | Valeur |
|-----|--------|
| Région | `eu-west-3` (Paris — résidence des données en UE) |
| URL | `https://xjfuaszukuumqxgzitzq.supabase.co` |
| Clé publiable (client) | `sb_publishable_BJow0lDQQdmoiiDE1JUXYg_9Dw_DnBI` |
| Project ref | `xjfuaszukuumqxgzitzq` |

> La clé **publiable/anon** est publique par conception (destinée au client). La clé
> **service_role** et le mot de passe de la base ne doivent JAMAIS être commités ni exposés
> côté client — ils vivent dans l'environnement serveur / les secrets des Edge Functions.

## Étapes manuelles à faire dans le dashboard Supabase

Certaines opérations ne passent pas par les migrations SQL :

1. **Activer le hook de claims JWT** (indispensable pour enrichir le token avec
   `app_metadata.families` et `child_id`) :
   `Authentication` → `Hooks` → **Custom Access Token** → sélectionner la fonction
   `public.custom_access_token_hook` → activer.
   > La RLS ne dépend PAS de ce hook (les helpers lisent `memberships` en direct), mais
   > le client et la Realtime Authorization en ont besoin.

2. **MFA parent** : `Authentication` → `Multi-Factor` → activer TOTP (obligatoire pour les
   comptes parents, cf. conformité).

3. **Appairage des appareils enfant (LOT 12)** : voir la section
   [« Déploiement du LOT 12 »](#déploiement-du-lot-12--appairage-par-session-anonyme)
   ci-dessous (étapes à suivre dans l'ordre).

4. **FCM (push)** — à l'arrivée des notifications (lot ultérieur) : stocker la clé de
   service Google dans Supabase Vault, jamais en clair.

## Déploiement du LOT 12 — appairage par session anonyme

L'appareil enfant n'utilise plus d'Edge Function : il ouvre une **session anonyme**
Supabase, puis appelle la fonction de base de données `public.pairing_complete` avec le
code affiché dans la console. Le code d'appairage fait désormais **10 caractères**
(chiffres et lettres, par exemple `7KQ2M-X9D4F`), ce qui rend les essais au hasard
inutiles. **Aucun CAPTCHA n'est nécessaire** (il reste possible, mais nous ne le
recommandons pas : service tiers, données personnelles transmises, intégration lourde
dans l'appli enfant).

Faites les étapes **dans cet ordre** :

**a) Appliquer la migration `0031_l12_pairing_complete_rpc.sql`.**
   `supabase db push` (ou coller le fichier dans le SQL Editor). Elle peut être rejouée
   sans risque. Conséquences immédiates :
   - les nouveaux codes générés par la console font 10 caractères ; un ancien code à
     8 chiffres encore affiché ne marche plus → en générer un nouveau ;
   - le « sel » secret des codes est créé automatiquement **dans la base** (rien à
     saisir, rien à copier). Pour le changer plus tard : `select app.rotate_pairing_pepper();`
     dans le SQL Editor (les codes en cours restent valables 10 min ; ne pas le refaire
     deux fois en moins de 10 min).

**b) Activer les sessions anonymes et limiter leur nombre.**
   - `Authentication` → `Sign In / Providers` → activer **Allow anonymous sign-ins**.
     Sans cela, l'appli enfant ne peut pas ouvrir de session et l'appairage échoue.
   - `Authentication` → `Rate Limits` → **Rate limit for anonymous users** : régler une
     limite basse par adresse IP, par exemple **10 par heure** (30 par défaut). Une
     famille n'en consomme qu'une par appareil appairé.
   - Optionnel, non nécessaire : CAPTCHA (`Authentication` → `Attack Protection`).
     Ne pas l'activer sans adapter d'abord l'appli enfant, sinon l'appairage échoue.

**c) Planifier la purge des comptes anonymes orphelins** (sessions d'appareils retirés
   ou jamais appairés, effacées au bout de 7 jours). Dans le SQL Editor, extension
   `pg_cron` activée :
   ```sql
   select cron.schedule('purge-orphan-device-users', '30 3 * * *',
     $cron$ select app.purge_orphan_device_users(); $cron$);
   ```
   Vérifier : `select jobname, schedule from cron.job;`

**d) Retirer les Edge Functions devenues inutiles** : `create-family`, `pairing-start`
   et `pairing-complete` (remplacées par les fonctions de base `public.create_family`,
   `public.pairing_start` et `public.pairing_complete`). L'ancienne `pairing-complete`
   répondait sans session et sans limite d'essais : elle ne doit pas rester en ligne.
   ```bash
   supabase functions delete pairing-complete --project-ref xjfuaszukuumqxgzitzq
   supabase functions delete pairing-start    --project-ref xjfuaszukuumqxgzitzq
   supabase functions delete create-family    --project-ref xjfuaszukuumqxgzitzq
   ```
   Variante si l'on préfère une réponse explicite aux anciennes versions de l'appli
   pendant la transition : déployer à la place les bouchons du dépôt (réponse 410,
   aucune clé, aucun accès à la base), puis les supprimer plus tard.
   Supprimer aussi le secret Edge `PAIRING_PEPPER` s'il existe :
   `supabase secrets unset PAIRING_PEPPER --project-ref xjfuaszukuumqxgzitzq`.
   `dispatch-push` reste en place.

**Ensuite** : l'appairage fonctionnera dès que l'appli enfant Android utilisera la
session anonyme et la fonction `pairing_complete` (mise à jour de l'appli à part).

## Edge Functions déployées

| Fonction | `verify_jwt` | Rôle |
|----------|:---:|------|
| `create-family` | ✅ | **À supprimer** (étape d) → RPC `public.create_family` |
| `pairing-start` | ✅ | **À supprimer** (étape d) → RPC `public.pairing_start` |
| `pairing-complete` | ❌ (public) | **À supprimer** (étape d) → session anonyme + RPC `public.pairing_complete` |
| `dispatch-push` | ✅ | Réveil push des appareils |

Le dépôt ne garde de ces trois fonctions que des bouchons inertes (réponse 410, aucune
clé ni accès à la base), au cas où on les redéploierait par erreur.

## État de la base (note technique)

Le correctif `supabase/migrations/0003_audit_allow_delete.sql` (retrait du trigger qui
bloquait les DELETE sur `audit_log`, nécessaire à l'effacement RGPD) est **versionné** ;
son application sur la base distante était en attente d'un incident transitoire du canal
d'écriture Supabase MCP au moment du commit. À rejouer si besoin :
```bash
supabase db push   # applique les migrations en attente
```
