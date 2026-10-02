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

3. **Secret serveur d'appairage** (poivre de hachage des codes) — à définir pour les
   Edge Functions :
   ```bash
   supabase secrets set PAIRING_PEPPER="<chaîne aléatoire longue>" --project-ref xjfuaszukuumqxgzitzq
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont injectés
   automatiquement dans les Edge Functions.)

4. **FCM (push)** — à l'arrivée des notifications (lot ultérieur) : stocker la clé de
   service Google dans Supabase Vault, jamais en clair.

## Edge Functions déployées

| Fonction | `verify_jwt` | Rôle |
|----------|:---:|------|
| `create-family` | ✅ | Le parent crée un foyer + son appartenance `owner` (atomique) |
| `pairing-start` | ✅ | Le parent génère un code d'appairage (haché, TTL 10 min, usage unique) |
| `pairing-complete` | ❌ (public) | L'appareil enfant échange le code contre un enrôlement + session |

## État de la base (note technique)

Le correctif `supabase/migrations/0003_audit_allow_delete.sql` (retrait du trigger qui
bloquait les DELETE sur `audit_log`, nécessaire à l'effacement RGPD) est **versionné** ;
son application sur la base distante était en attente d'un incident transitoire du canal
d'écriture Supabase MCP au moment du commit. À rejouer si besoin :
```bash
supabase db push   # applique les migrations en attente
```
