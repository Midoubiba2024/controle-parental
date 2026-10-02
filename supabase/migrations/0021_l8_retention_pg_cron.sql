-- =============================================================================
-- LOT 8b — K9 : RÉTENTION & PURGE AUTOMATIQUE (RGPD art. 5‑1‑e).
--
-- Objectif : conservation BORNÉE par type de donnée, purge quotidienne
-- automatique. Politique écrite et publiée : docs/12-RETENTION-RGPD.md.
--
-- Principes de migration (comme L3→L6) :
--   * ADDITIF : aucun DROP ; CREATE OR REPLACE ; ré-exécutable.
--   * Fonction de purge SECURITY DEFINER, search_path FIGÉ à '' (noms qualifiés),
--     EXECUTE révoqué à public/anon (seuls postgres/cron l'appellent).
--   * Minimisation : on PURGE des métadonnées/agrégats anciens. Aucune donnée de
--     contenu n'existe dans le schéma (ligne rouge L6) — rien à « anonymiser »
--     côté contenu. L'audit_log est conservé le PLUS LONGTEMPS (traçabilité K3).
--
-- ⚠️ PLANIFICATION pg_cron = ACTION MANUELLE DU PROPRIÉTAIRE (voir docs/12 §Actions
--    manuelles). L'activation de l'extension `pg_cron` (CREATE EXTENSION) est une
--    opération privilégiée que l'outil MCP refuse/time-out ; elle se fait via
--    Dashboard → Database → Extensions, puis on planifie le job avec un SELECT
--    cron.schedule(...) dans le SQL Editor. La FONCTION ci-dessous contient des
--    DELETE en masse : son application est également une action propriétaire
--    (docs/12 §3-C) — testable ensuite via `select app.run_data_retention();`.
--
-- ⚠️ AUDIT_LOG : cette fonction NE purge PAS audit_log (table d'audit sensible,
--    conservée le plus longtemps). Sa purge éventuelle (défaut 730 j) est une action
--    propriétaire séparée (docs/12 §3-E). Elle requiert de toute façon le retrait
--    préalable du trigger résiduel trg_audit_no_delete (BEFORE DELETE), qui bloque
--    aujourd'hui tout delete sur audit_log — retrait inclus dans le bloc 0010
--    (docs/12 §3-A). Ce même retrait conditionne l'effacement RGPD en cascade (K10).
--    L'immutabilité du CONTENU reste assurée par trg_audit_no_update ; la protection
--    contre un DELETE direct d'un utilisateur vient de la RLS (aucune policy DELETE
--    pour 'authenticated').
-- =============================================================================

-- =============================================================================
-- 1) Fonction de purge — une passe quotidienne, toutes les durées documentées.
--    Retourne un JSON {table: lignes_supprimées} pour l'observabilité (visible
--    dans cron.job_run_details). SECURITY DEFINER : s'exécute avec les droits du
--    propriétaire (postgres) → ignore la RLS pour la maintenance, jamais exposée
--    aux clients.
--
-- Durées de conservation PAR TYPE (justification : docs/12-RETENTION-RGPD.md) :
--   location_fixes   : location_settings.retention_days par enfant (défaut 30 j)
--   domain_events    : filter_policy.retention_days par enfant   (défaut 30 j)
--   device_status    : 30 j   (relevés batterie/stockage, fort volume)
--   comm_events      : 90 j   (métadonnées d'appels/SMS — jamais de contenu)
--   geofence_events  : 90 j   (transitions de zones)
--   safety_signals   : 90 j   (alertes de métadonnées on-device L6)
--   safety_alerts    : 90 j   (batterie faible, etc.)
--   usage_daily      : 180 j  (agrégats journaliers de temps d'écran)
--   time_grants      : 180 j  (bonus de temps accordés)
--   commands         : 30 j   (commandes transitoires, souvent déjà expirées)
--   messages         : 365 j  (messagerie interne — conservation d'un an)
--   sos_events       : 365 j  (épisodes de sécurité — conservés un an)
--   privacy_pauses   : 90 j après clôture (ended_at)
--   audit_log        : 730 j  (traçabilité K3 — conservé LE PLUS LONGTEMPS) — purge
--                      laissée à une ACTION PROPRIÉTAIRE (docs/12), hors de cette
--                      fonction (table d'audit sensible ; requiert le retrait de
--                      trg_audit_no_delete via 0010).
-- =============================================================================
create or replace function app.run_data_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  n bigint;
begin
  -- location_fixes : rétention paramétrée PAR ENFANT (défaut 30 j si non réglée).
  delete from public.location_fixes lf
   where lf.captured_at < now() - make_interval(days => coalesce(
           (select ls.retention_days from public.location_settings ls
             where ls.child_id = lf.child_id), 30));
  get diagnostics n = row_count; r := jsonb_set(r, '{location_fixes}', to_jsonb(n));

  -- domain_events : rétention paramétrée PAR ENFANT (défaut 30 j si non réglée).
  delete from public.domain_events de
   where de.occurred_at < now() - make_interval(days => coalesce(
           (select fp.retention_days from public.filter_policy fp
             where fp.child_id = de.child_id), 30));
  get diagnostics n = row_count; r := jsonb_set(r, '{domain_events}', to_jsonb(n));

  delete from public.device_status where captured_at < now() - interval '30 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{device_status}', to_jsonb(n));

  delete from public.comm_events where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{comm_events}', to_jsonb(n));

  delete from public.geofence_events where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{geofence_events}', to_jsonb(n));

  delete from public.safety_signals where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{safety_signals}', to_jsonb(n));

  delete from public.safety_alerts where created_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{safety_alerts}', to_jsonb(n));

  delete from public.usage_daily where day < (now() - interval '180 days')::date;
  get diagnostics n = row_count; r := jsonb_set(r, '{usage_daily}', to_jsonb(n));

  delete from public.time_grants where grant_date < (now() - interval '180 days')::date;
  get diagnostics n = row_count; r := jsonb_set(r, '{time_grants}', to_jsonb(n));

  delete from public.commands where created_at < now() - interval '30 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{commands}', to_jsonb(n));

  delete from public.messages where created_at < now() - interval '365 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{messages}', to_jsonb(n));

  delete from public.sos_events where started_at < now() - interval '365 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{sos_events}', to_jsonb(n));

  -- privacy_pauses : seules les pauses CLOSES anciennes sont purgées (on ne touche
  -- jamais une pause encore ouverte — K8, elle doit rester visible du parent).
  delete from public.privacy_pauses
   where ended_at is not null and ended_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{privacy_pauses}', to_jsonb(n));

  -- NB : audit_log (conservé LE PLUS LONGTEMPS — traçabilité K3, défaut 730 j) n'est
  -- PAS purgé ici. Sa purge est une opération SENSIBLE (table d'audit) laissée à une
  -- action explicite du propriétaire — cf. docs/12 §Actions manuelles (elle requiert
  -- d'abord le retrait de trg_audit_no_delete via le bloc 0010).
  return r;
end;
$$;

revoke execute on function app.run_data_retention() from public, anon;

-- =============================================================================
-- 2) PLANIFICATION — À EXÉCUTER PAR LE PROPRIÉTAIRE (docs/12 §Actions manuelles)
--    une fois l'extension pg_cron activée via le Dashboard. Laissé en commentaire
--    ici car CREATE EXTENSION / cron.schedule sont des opérations privilégiées non
--    applicables via le MCP. Idempotent (cron.schedule remplace le job de même nom) :
--
--    create extension if not exists pg_cron;   -- Dashboard → Database → Extensions
--    select cron.schedule(
--      'data-retention-daily', '15 3 * * *',
--      $cron$ select app.run_data_retention(); $cron$
--    );
-- =============================================================================
