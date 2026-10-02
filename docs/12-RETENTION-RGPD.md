# LOT 8b — Rétention des données & droits RGPD (K9/K10)

> Politique **écrite et publiée** de conservation et d'exercice des droits
> (RGPD art. 5‑1‑e, 15, 17). Analyse d'ingénierie — **pas un avis juridique** :
> à faire valider par le DPO/juriste (voir [`02-CONFORMITE.md`](02-CONFORMITE.md)).

Rappel des lignes rouges (inchangées) : **métadonnées/agrégats uniquement**, jamais
de contenu de tiers ; transparence ; minimisation ; conservation **bornée**.

---

## 1. Politique de rétention (K9)

Les données anciennes sont **purgées automatiquement** par type, par une fonction
Postgres `app.run_data_retention()` déclenchée **quotidiennement** via `pg_cron`
(03:15 UTC). La fonction est `SECURITY DEFINER`, `search_path` figé, `EXECUTE`
révoqué à `public`/`anon`. Source : [`../supabase/migrations/0021_l8_retention_pg_cron.sql`](../supabase/migrations/0021_l8_retention_pg_cron.sql).

| Donnée (table) | Conservation | Base / justification |
|----------------|--------------|----------------------|
| `location_fixes` | **réglable par enfant** (`location_settings.retention_days`, défaut **30 j**) | Données sensibles ; durée choisie par le parent, courte par défaut. |
| `domain_events` | **réglable par enfant** (`filter_policy.retention_days`, défaut **30 j**) | Journal de domaines (métadonnées de filtrage). |
| `device_status` | **30 j** | Relevés batterie/stockage, fort volume, faible valeur dans le temps. |
| `comm_events` | **90 j** | Métadonnées d'appels/SMS (jamais de contenu, ni de nom en clair). |
| `geofence_events` | **90 j** | Transitions de zones. |
| `safety_signals` | **90 j** | Alertes de métadonnées on‑device (ado). |
| `safety_alerts` | **90 j** | Batterie faible, etc. |
| `usage_daily` | **180 j** | Agrégats journaliers de temps d'écran (tendances). |
| `time_grants` | **180 j** | Bonus de temps accordés. |
| `commands` | **30 j** | Commandes transitoires (souvent déjà expirées). |
| `messages` | **365 j** | Messagerie interne parent↔enfant. |
| `sos_events` | **365 j** | Épisodes de sécurité — conservés un an. |
| `privacy_pauses` | **90 j après clôture** | Métadonnées de durée (K8). |
| `audit_log` | **730 j** | **Conservé le plus longtemps** : traçabilité (K3), responsabilité RGPD. Purgé hors de la fonction (table sensible — voir §3‑E). |

**Observabilité** : `app.run_data_retention()` renvoie un JSON
`{table: lignes_supprimées}` ; l'historique des exécutions planifiées est visible
dans `cron.job_run_details`.

> Les durées ci‑dessus sont des **choix d'ingénierie raisonnables** à faire
> confirmer par le DPO. Les deux durées « localisation » et « filtrage » sont déjà
> **réglables par le parent** depuis la console (onglets Localisation / Filtrage).

---

## 2. Droits d'accès et d'effacement (K10)

Exposés dans la console, onglet **Confidentialité** (par enfant). Trois RPC
`public` (SECURITY **INVOKER** — s'exécutent sous la RLS de l'appelant, doublées
d'un contrôle explicite d'autorité parentale). Source :
[`../supabase/migrations/0022_l8_rgpd_export_erase.sql`](../supabase/migrations/0022_l8_rgpd_export_erase.sql).

- **Export (droit d'accès / portabilité)** — `export_child_data(child)` : renvoie
  **tout** l'enregistrement de l'enfant en JSON (toutes les tables le concernant).
  La console télécharge le fichier côté navigateur. L'accès est **journalisé**
  (`audit_log`, action `rgpd.export`) — visible de l'enfant (« mes données »).
  *Déjà appliqué en live.*
- **Effacement enfant (droit à l'effacement)** — `rgpd_delete_child(child)` :
  supprime l'enfant ; les FK `ON DELETE CASCADE` effacent toutes ses données. La
  famille demeure. **Double confirmation** dans la console (saisie du prénom).
- **Effacement famille** — `rgpd_delete_family(family)` : supprime toute la famille
  (réservé à l'`owner`). **Double confirmation** (saisie du nom du foyer).

> L'effacement repose sur les cascades FK. **DEUX prérequis** (bloc **§3‑A**
> ci‑dessous) conditionnent son fonctionnement, à appliquer avant toute suppression :
> **(1)** retirer le trigger résiduel `trg_audit_no_delete` (il bloque la cascade
> `ON DELETE CASCADE` vers `audit_log`) ; **(2)** remplacer la fonction
> `app.audit_log_immutable` (migration 0025) car la FK `subject_child_id … ON DELETE
> SET NULL` déclenche un UPDATE interne d'`audit_log` refusé par `trg_audit_no_update`.
> Sans ces deux étapes, l'effacement RGPD avorte systématiquement.

---

## 3. Actions manuelles du propriétaire (SQL Editor / `supabase db push`)

Ces opérations sont **privilégiées ou destructives** : elles ne peuvent pas être
appliquées par l'outil d'édition automatisé (garde‑fous anti‑mass‑delete /
anti‑altération d'audit / IaC). Le propriétaire les exécute lui‑même dans
**Supabase → SQL Editor** (ou via `supabase db push` depuis le dépôt). Tout est
**idempotent** et ré‑exécutable sans risque.

Déjà en live (appliqué automatiquement) : la fonction d'export `export_child_data`
et les **index couvrants de clés étrangères** (migration 0023, partie index).
Il reste à appliquer, dans l'ordre :

### A. Nettoyage des résidus L0/L1 + déblocage de l'audit — **à faire en premier**

Retire la table sonde sans RLS (seul finding de sécurité restant), la colonne de
nom de contact en clair (minimisation), le trigger qui bloque la cascade DELETE, et
remplace la fonction d'immuabilité pour tolérer la seule action `ON DELETE SET NULL`.

```sql
-- 1) Sonde d'écriture L1 (table sans RLS — finding get_advisors(security)).
drop table if exists public._l1_write_probe;
-- 2) Colonne de nom de contact (toujours NULL depuis le durcissement L1).
alter table public.comm_events drop column if exists counterparty_label;
-- 3) Trigger anti-DELETE résiduel sur audit_log (débloque la cascade K9/K10).
--    L'immutabilité du CONTENU reste assurée par trg_audit_no_update (BEFORE UPDATE)
--    et la RLS (aucune policy DELETE pour 'authenticated').
drop trigger if exists trg_audit_no_delete on public.audit_log;

-- 4) (migration 0025) Fonction d'immuabilité tolérant la SEULE action référentielle
--    ON DELETE SET NULL sur subject_child_id (sinon l'UPDATE interne déclenché par
--    l'effacement d'un enfant est refusé par trg_audit_no_update → l'effacement RGPD
--    avorte). Tout autre UPDATE reste interdit (append-only du CONTENU préservé).
create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $func$
begin
  if tg_op = 'UPDATE'
     and old.subject_child_id is not null
     and new.subject_child_id is null
     and (to_jsonb(new) - 'subject_child_id') = (to_jsonb(old) - 'subject_child_id')
  then
    return new;
  end if;
  raise exception 'audit_log est append-only : % interdit', tg_op;
end;
$func$;
```

Effet : `get_advisors(security)` ne remonte **plus aucun finding** ; l'effacement
RGPD (K10) et la purge d'`audit_log` (§3‑E) deviennent réellement possibles (les deux
triggers d'audit sont désormais compatibles avec les actions de suppression légitimes,
tout en gardant le journal append-only pour le contenu).

### B. Corrections RLS additives (migration 0023, partie policies)

Corrige deux `WITH CHECK` d'INSERT qui contenaient une **tautologie** (`x = x`),
laissant référencer une entité d'une **autre famille**. Purement un resserrement.

```sql
alter policy commands_insert on public.commands
  with check (
    app.is_parent_of(family_id)
    and family_id = (select c.family_id from public.children c where c.id = commands.child_id)
    and exists (
      select 1 from public.devices d
      where d.id = commands.device_id
        and d.child_id = commands.child_id
        and d.family_id = commands.family_id
    )
  );

alter policy child_schedules_insert on public.child_schedules
  with check (
    app.is_parent_of(family_id)
    and family_id = (select c.family_id from public.children c where c.id = child_schedules.child_id)
    and exists (
      select 1 from public.schedules s
      where s.id = child_schedules.schedule_id
        and s.family_id = child_schedules.family_id
    )
  );
```

### C. Fonctions K9/K10 (migrations 0021 et 0022)

Appliquer les deux fichiers de migration (ils ne contiennent que des
`create or replace function` + `revoke`/`grant`, idempotents) :

- [`supabase/migrations/0021_l8_retention_pg_cron.sql`](../supabase/migrations/0021_l8_retention_pg_cron.sql) → crée `app.run_data_retention()`.
- [`supabase/migrations/0022_l8_rgpd_export_erase.sql`](../supabase/migrations/0022_l8_rgpd_export_erase.sql) → crée les 3 RPC RGPD (l'export est déjà en live ; le `create or replace` est sans effet, les fonctions d'effacement sont ajoutées).

Le plus simple : copier‑coller chaque fichier entier dans le SQL Editor.

### D. Activer pg_cron et planifier la purge quotidienne

1. **Dashboard → Database → Extensions** : activer **`pg_cron`**.
2. Puis, dans le SQL Editor (idempotent — `cron.schedule` remplace le job de même nom) :

```sql
create extension if not exists pg_cron;
select cron.schedule(
  'data-retention-daily', '15 3 * * *',
  $cron$ select app.run_data_retention(); $cron$
);
```

Vérifier : `select jobname, schedule, active from cron.job;` puis, après le premier
déclenchement, `select * from cron.job_run_details order by start_time desc limit 5;`.
Test immédiat possible : `select app.run_data_retention();` (renvoie le JSON des
compteurs ; `0` partout sur une base sans données anciennes).

### E. (Optionnel) Purge de `audit_log` au‑delà de 730 j

Volontairement **hors** de `app.run_data_retention()` (table d'audit sensible).
À planifier séparément si souhaité, **après** le §3‑A :

```sql
select cron.schedule(
  'audit-retention-daily', '30 3 * * *',
  $cron$ delete from public.audit_log where created_at < now() - interval '730 days'; $cron$
);
```

---

## 4. Vérifications post‑application (checklist propriétaire)

- `get_advisors(security)` → **0 finding** (la sonde `_l1_write_probe` a disparu).
- `select app.run_data_retention();` → renvoie un JSON de compteurs (pas d'erreur).
- `select jobname, active from cron.job;` → `data-retention-daily` actif.
- Console → onglet **Confidentialité** : l'export télécharge un JSON ; la
  suppression (après double confirmation) retire bien l'enfant **sans erreur**
  (valide que le déblocage §3‑A — trigger DELETE retiré + fonction 0025 — est en place ;
  avant, l'effacement avortait sur `audit_log est append-only`).
- `pg_policies` : `commands_insert` et `child_schedules_insert` ne contiennent plus
  de `x = x`.
