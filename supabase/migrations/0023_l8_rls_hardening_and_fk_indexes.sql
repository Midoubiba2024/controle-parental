-- =============================================================================
-- LOT 8b — DURCISSEMENT FINAL : correction RLS additive + index couvrants de FK.
--
-- Revue adverse de la RLS (0001→0020) + advisors Supabase (sécurité & perf).
-- Tout est ADDITIF : ALTER POLICY (réécrit la seule clause WITH CHECK fautive, sans
-- DROP de policy) et CREATE INDEX IF NOT EXISTS. Aucune régression de comportement
-- attendu — on resserre deux WITH CHECK d'INSERT qui contenaient une TAUTOLOGIE.
--
-- Contexte revue (voir docs/12 §Durcissement) :
--   * get_advisors(security) : 1 seul finding résiduel, public._l1_write_probe
--     (table sonde sans RLS) — retirée par le bloc 0010 (action propriétaire).
--     Aucune autre table publique sans RLS.
--   * Motif d'isolation SELECT « app.is_parent_of(family_id) OR child_id =
--     app.current_child_id() » vérifié sur toutes les tables à portée enfant.
--     Les tables au périmètre FAMILLE (children, devices, consents, schedules)
--     conservent volontairement « app.is_member_of(family_id) » (visibilité
--     familiale partagée, pas du contenu de tiers) — revu, intentionnel.
-- =============================================================================

-- --- 1) commands_insert : sous-requête d'appartenance appareil TAUTOLOGIQUE -----
-- AVANT : EXISTS (… WHERE d.id = commands.device_id AND d.child_id = d.child_id
--                       AND d.family_id = d.family_id)  ← « d.x = d.x » toujours vrai.
-- Effet du bug : un parent pouvait insérer une commande pointant un device_id d'une
-- AUTRE famille (le contrôle d'appartenance ne vérifiait rien). APRÈS : on exige que
-- l'appareil appartienne BIEN à l'enfant ET à la famille de la commande.
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

-- --- 2) child_schedules_insert : sous-requête planning TAUTOLOGIQUE -------------
-- AVANT : EXISTS (… WHERE s.id = child_schedules.schedule_id AND s.family_id =
--                       s.family_id)  ← « s.family_id = s.family_id » toujours vrai.
-- Effet du bug : un parent pouvait lier son enfant à un planning d'une AUTRE famille.
-- APRÈS : le planning doit appartenir à la famille du child_schedule.
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

-- =============================================================================
-- 3) INDEX COUVRANTS DE CLÉS ÉTRANGÈRES (advisor perf : unindexed_foreign_keys).
--    Bénéfice direct pour LOT 8b : les cascades ON DELETE (effacement RGPD K10) et
--    les purges de rétention (K9) retrouvent les lignes dépendantes par index au
--    lieu d'un seq scan. Idempotent.
-- =============================================================================
create index if not exists idx_app_inventory_device       on public.app_inventory (device_id);
create index if not exists idx_audit_log_actor            on public.audit_log (actor_id);
create index if not exists idx_child_schedules_family      on public.child_schedules (family_id);
create index if not exists idx_child_schedules_schedule    on public.child_schedules (schedule_id);
create index if not exists idx_commands_created_by         on public.commands (created_by);
create index if not exists idx_consents_family             on public.consents (family_id);
create index if not exists idx_consents_granted_by         on public.consents (granted_by);
create index if not exists idx_device_status_child         on public.device_status (child_id);
create index if not exists idx_domain_events_device        on public.domain_events (device_id);
create index if not exists idx_families_created_by         on public.families (created_by);
create index if not exists idx_filter_rules_created_by     on public.filter_rules (created_by);
create index if not exists idx_filter_status_family        on public.filter_status (family_id);
create index if not exists idx_geofence_events_device      on public.geofence_events (device_id);
create index if not exists idx_geofence_events_geofence    on public.geofence_events (geofence_id);
create index if not exists idx_geofences_created_by        on public.geofences (created_by);
create index if not exists idx_messages_created_by         on public.messages (created_by);
create index if not exists idx_pairing_codes_child         on public.pairing_codes (child_id);
create index if not exists idx_pairing_codes_created_by    on public.pairing_codes (created_by);
create index if not exists idx_privacy_pauses_created_by   on public.privacy_pauses (created_by);
create index if not exists idx_requests_created_by         on public.requests (created_by);
create index if not exists idx_requests_decided_by         on public.requests (decided_by);
create index if not exists idx_requests_device             on public.requests (device_id);
create index if not exists idx_safety_alerts_ack_by        on public.safety_alerts (acknowledged_by);
create index if not exists idx_safety_alerts_device        on public.safety_alerts (device_id);
create index if not exists idx_safety_alerts_location_fix  on public.safety_alerts (location_fix_id);
create index if not exists idx_safety_signals_ack_by       on public.safety_signals (acknowledged_by);
create index if not exists idx_safety_signals_device       on public.safety_signals (device_id);
create index if not exists idx_safety_status_family        on public.safety_status (family_id);
create index if not exists idx_schedules_created_by        on public.schedules (created_by);
create index if not exists idx_screen_time_limits_family   on public.screen_time_limits (family_id);
create index if not exists idx_sos_events_acked_by         on public.sos_events (acked_by);
create index if not exists idx_sos_events_device           on public.sos_events (device_id);
create index if not exists idx_time_grants_granted_by      on public.time_grants (granted_by);
create index if not exists idx_time_grants_request         on public.time_grants (request_id);
create index if not exists idx_usage_daily_device          on public.usage_daily (device_id);
