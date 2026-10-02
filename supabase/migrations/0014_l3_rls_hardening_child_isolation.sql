-- =============================================================================
-- LOT 3 — Durcissement RLS : ISOLATION INTER-ENFANTS (anti-stalkerware + RGPD).
--
-- Correctif d'une régression de type 0006 : les policies SELECT de 0012 avaient
-- été écrites avec `app.is_member_of(family_id)`. Or un compte enfant est membre
-- de la famille → dans un foyer à plusieurs enfants, l'un pouvait lire les
-- données de localisation de l'autre (positions, zones, transitions, alertes,
-- réglages), y compris via Realtime. On restreint à parent OU l'enfant lui-même
-- (même motif que sos_events_select).
--
-- 0012 a DÉJÀ été appliquée en base live ; on corrige donc EN PLACE via
-- `ALTER POLICY` (aucun DROP). Le fichier 0012 a par ailleurs été corrigé pour
-- qu'un déploiement neuf soit correct d'emblée — ces ALTER y sont alors des
-- no-op idempotents. ADDITIF, ré-exécutable.
-- =============================================================================

alter policy location_settings_select on public.location_settings
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy location_fixes_select on public.location_fixes
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy geofences_select on public.geofences
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy geofence_events_select on public.geofence_events
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy safety_alerts_select on public.safety_alerts
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

-- Renforce l'insert des transitions : la zone visée doit appartenir au MÊME
-- enfant (et pas seulement à la même famille) — anti-usurpation. Colonnes
-- QUALIFIÉES par geofence_events : dans la sous-requête `from geofences g`, un
-- family_id/child_id nu se lierait à g (portée interne) → tautologie no-op.
alter policy geofence_events_insert on public.geofence_events
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = geofence_events.child_id)
              and (geofence_id is null
                   or exists (select 1 from public.geofences g
                              where g.id = geofence_events.geofence_id
                                and g.family_id = geofence_events.family_id
                                and g.child_id = geofence_events.child_id)));
