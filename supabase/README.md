# Backend Supabase

## Migrations (`migrations/`)

| Fichier | Contenu |
|---------|---------|
| `0001_init_family_core.sql` | Schéma famille (`families`, `memberships`, `children`, `devices`, `device_push_tokens`, `consents`, `pairing_codes`, `audit_log`), enums, helpers RLS (`app.is_member_of/is_parent_of/is_owner_of/current_child_id`), `app.audit()`, RLS sur 100 % des tables, trigger d'immutabilité d'`audit_log`, hook `custom_access_token_hook` |
| `0002_harden_function_search_path.sql` | Fige le `search_path` des fonctions trigger/hook (durcissement sécurité) |
| `0003_audit_allow_delete.sql` | Retire le blocage DELETE sur `audit_log` (nécessaire à l'effacement RGPD ; l'immutabilité du contenu reste via le trigger UPDATE + RLS) |

Appliquer : `supabase db push` (hébergé) ou `supabase db reset` (local).

## Modèle de sécurité (RLS)

- **Isolation par `family_id`**, RLS active partout.
- Helpers `SECURITY DEFINER` (contournent la RLS des tables lues → pas de récursion).
- **Parent** (`owner`/`parent`/`guardian`) : R/W sur sa famille.
- **Enfant** (`child`) : lecture de sa famille (transparence) + audit le concernant ;
  écritures sensibles (famille, règles) interdites.
- Écritures privilégiées (création de famille, appairage, enrôlement) via **Edge
  Functions** (`service_role`), jamais en direct depuis le client.

## Edge Functions (`functions/`)

Voir `../SETUP.md` pour les `verify_jwt` et secrets. `_shared/cors.ts` est la version de
référence des en-têtes CORS (chaque fonction en embarque une copie pour rester autonome
au déploiement).
