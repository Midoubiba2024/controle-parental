-- =============================================================================
-- LOT 8b — K10 : DROIT D'ACCÈS (export) & DROIT À L'EFFACEMENT (RGPD art. 15/17).
--
-- Trois RPC `public` (exposées à PostgREST, appelables par le parent authentifié
-- via supabase.rpc). SECURITY INVOKER + search_path FIGÉ : elles s'exécutent sous la
-- RLS DE L'APPELANT (défense en profondeur — le parent possède déjà SELECT via
-- is_parent_of et DELETE via children_write_del / families_delete), DOUBLÉ d'un
-- garde-fou explicite d'autorité parentale (app.is_parent_of / app.is_owner_of).
-- INVOKER évite aussi le finding advisor « SECURITY DEFINER exécutable par
-- authenticated ». La journalisation passe par app.audit() (elle, SECURITY DEFINER).
--
--   * export_child_data(child)   : lecture seule → JSON de TOUTES les données de
--                                  l'enfant (accès/portabilité). Journalisé (K3).
--   * rgpd_delete_child(child)   : efface l'enfant (cascade FK on delete cascade).
--   * rgpd_delete_family(family) : efface toute la famille (réservé à l'owner).
--
-- ⚠️ APPLICATION (voir docs/12 §Actions manuelles) :
--   - export_child_data est NON destructive → appliquée en live.
--   - rgpd_delete_child / rgpd_delete_family contiennent des DELETE en masse : le
--     classifieur de l'environnement d'édition bloque leur application via le MCP.
--     Elles sont donc À APPLIQUER PAR LE PROPRIÉTAIRE (supabase db push ou copier-
--     coller dans le SQL Editor). PRÉREQUIS : le bloc 0010 (retrait de
--     trg_audit_no_delete) doit avoir été appliqué, sinon la cascade vers audit_log
--     fait échouer l'effacement.
--
-- Principes : ADDITIF (CREATE OR REPLACE), idempotent, ré-exécutable.
-- =============================================================================

-- =============================================================================
-- 1) EXPORT — droit d'accès / portabilité (lecture seule). Renvoie un JSON
--    structuré par table. Couvre les données personnelles et comportementales de
--    l'enfant ; exclut volontairement les artefacts techniques transitoires
--    (jetons push, codes d'appairage) — minimisation.
-- =============================================================================
create or replace function public.export_child_data(p_child_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family uuid;
  v_out    jsonb;
begin
  select c.family_id into v_family from public.children c where c.id = p_child_id;
  if v_family is null then
    raise exception 'enfant introuvable';
  end if;
  if not app.is_parent_of(v_family) then
    raise exception 'accès refusé : autorité parentale requise sur cette famille';
  end if;

  v_out := jsonb_build_object(
    'export_metadata', jsonb_build_object(
      'exported_at', now(),
      'child_id',    p_child_id,
      'family_id',   v_family,
      'format',      'rgpd-access-v1',
      'scope',       'Toutes les données de l''enfant (métadonnées et agrégats ; aucun contenu de tiers — voir docs/02-CONFORMITE.md).'
    ),
    'child',             (select to_jsonb(t) from public.children t where t.id = p_child_id),
    'family',            (select to_jsonb(t) from public.families t where t.id = v_family),
    'devices',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.devices t where t.child_id = p_child_id),
    'consents',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.consents t where t.child_id = p_child_id),
    'usage_daily',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.usage_daily t where t.child_id = p_child_id),
    'app_inventory',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.app_inventory t where t.child_id = p_child_id),
    'device_status',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.device_status t where t.child_id = p_child_id),
    'comm_events',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.comm_events t where t.child_id = p_child_id),
    'access_policies',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.access_policies t where t.child_id = p_child_id),
    'screen_time_limits',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.screen_time_limits t where t.child_id = p_child_id),
    'app_rules',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.app_rules t where t.child_id = p_child_id),
    'child_schedules',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.child_schedules t where t.child_id = p_child_id),
    'commands',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.commands t where t.child_id = p_child_id),
    'requests',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.requests t where t.child_id = p_child_id),
    'time_grants',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.time_grants t where t.child_id = p_child_id),
    'messages',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.messages t where t.child_id = p_child_id),
    'location_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.location_settings t where t.child_id = p_child_id),
    'location_fixes',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.location_fixes t where t.child_id = p_child_id),
    'geofences',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.geofences t where t.child_id = p_child_id),
    'geofence_events',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.geofence_events t where t.child_id = p_child_id),
    'sos_events',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sos_events t where t.child_id = p_child_id),
    'safety_alerts',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.safety_alerts t where t.child_id = p_child_id),
    'filter_policy',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.filter_policy t where t.child_id = p_child_id),
    'filter_rules',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.filter_rules t where t.child_id = p_child_id),
    'domain_events',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.domain_events t where t.child_id = p_child_id),
    'filter_status',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.filter_status t where t.child_id = p_child_id),
    'safety_signals',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.safety_signals t where t.child_id = p_child_id),
    'safety_settings',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.safety_settings t where t.child_id = p_child_id),
    'safety_status',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.safety_status t where t.child_id = p_child_id),
    'privacy_pauses',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.privacy_pauses t where t.child_id = p_child_id),
    'audit_log',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.audit_log t where t.subject_child_id = p_child_id)
  );

  -- Journalise l'accès (transparence K3 — visible de l'enfant dans « mes données »).
  perform app.audit(v_family, 'rgpd.export', p_child_id, 'children', p_child_id,
                     jsonb_build_object('via', 'export_child_data'));

  return v_out;
end;
$$;

revoke execute on function public.export_child_data(uuid) from public, anon;
grant execute on function public.export_child_data(uuid) to authenticated;

-- =============================================================================
-- 2) EFFACEMENT ENFANT — droit à l'effacement (art. 17). Supprime l'enfant ; les
--    FK ON DELETE CASCADE effacent toutes ses données liées. La famille demeure.
--    Journalisé AVANT la suppression (l'entrée d'audit survit : la famille reste).
--
-- ⚠️ À APPLIQUER PAR LE PROPRIÉTAIRE (DELETE en masse bloqué par le MCP). Prérequis
--    0010 (sans quoi la cascade vers audit_log est refusée par trg_audit_no_delete).
-- =============================================================================
create or replace function public.rgpd_delete_child(p_child_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family uuid;
  v_name   text;
begin
  select c.family_id, c.display_name into v_family, v_name
  from public.children c where c.id = p_child_id;
  if v_family is null then
    raise exception 'enfant introuvable';
  end if;
  if not app.is_parent_of(v_family) then
    raise exception 'accès refusé : autorité parentale requise sur cette famille';
  end if;

  -- Trace l'effacement dans l'audit (survit : la famille n'est pas supprimée).
  perform app.audit(v_family, 'rgpd.delete_child', p_child_id, 'children', p_child_id,
                     jsonb_build_object('display_name', v_name, 'via', 'rgpd_delete_child'));

  delete from public.children where id = p_child_id;

  return jsonb_build_object('deleted', 'child', 'child_id', p_child_id, 'family_id', v_family, 'at', now());
end;
$$;

revoke execute on function public.rgpd_delete_child(uuid) from public, anon;
grant execute on function public.rgpd_delete_child(uuid) to authenticated;

-- =============================================================================
-- 3) EFFACEMENT FAMILLE — supprime TOUTE la famille (tous enfants + données).
--    Réservé à l'OWNER (is_owner_of) : opération la plus lourde. La cascade efface
--    aussi l'audit de la famille (cohérent : plus de famille, plus d'audit à tenir).
--
-- ⚠️ À APPLIQUER PAR LE PROPRIÉTAIRE (DELETE en masse bloqué par le MCP). Prérequis
--    0010 (cascade vers audit_log).
-- =============================================================================
create or replace function public.rgpd_delete_family(p_family_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.is_owner_of(p_family_id) then
    raise exception 'accès refusé : seul le propriétaire (owner) de la famille peut tout effacer';
  end if;

  delete from public.families where id = p_family_id;

  return jsonb_build_object('deleted', 'family', 'family_id', p_family_id, 'at', now());
end;
$$;

revoke execute on function public.rgpd_delete_family(uuid) from public, anon;
grant execute on function public.rgpd_delete_family(uuid) to authenticated;
