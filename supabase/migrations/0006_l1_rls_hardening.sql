-- =============================================================================
-- LOT 1 — Durcissement RLS des tables d'observation (usage_daily, app_inventory,
-- device_status, comm_events).
--
-- Contexte revue de code :
--   * LECTURE : les policies SELECT de 0004/0005 autorisent TOUT membre de la
--     famille (app.is_member_of) à lire les lignes. Un compte « enfant » pouvait
--     donc lire les métriques d'un AUTRE enfant de la même famille. On resserre
--     pour que l'enfant ne lise que SES lignes (le parent continue de tout voir).
--   * ÉCRITURE : les policies INSERT/UPDATE valident child_id = enfant courant et
--     l'appartenance de l'appareil, mais PAS la cohérence family_id ↔ child_id.
--     Un compte enfant pouvait insérer une ligne avec un family_id arbitraire
--     (p. ex. celui d'une autre famille) tout en gardant son propre child_id.
--     On ajoute la validation family_id = famille du child_id.
--
-- Méthode : ALTER POLICY (et non DROP/CREATE) pour éviter tout gating destructif
-- et préserver les policies en place. Rien n'est supprimé.
-- =============================================================================

-- --- LECTURE (SELECT) : enfant → seulement SES lignes ; parent → toute la famille
alter policy usage_daily_select on public.usage_daily
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy app_inventory_select on public.app_inventory
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy device_status_select on public.device_status
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

alter policy comm_events_select on public.comm_events
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

-- --- ÉCRITURE (INSERT/UPDATE) : valider family_id ↔ child_id -----------------
-- On reprend la condition existante de 0004/0005 et on ajoute la cohérence
-- family_id = famille déclarée du child_id, pour empêcher l'écriture de lignes
-- rattachées à une famille qui n'est pas celle de l'enfant.

alter policy usage_daily_insert on public.usage_daily
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );

alter policy usage_daily_update on public.usage_daily
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );

alter policy app_inventory_insert on public.app_inventory
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );

alter policy app_inventory_update on public.app_inventory
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );

alter policy device_status_insert on public.device_status
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );

alter policy comm_events_insert on public.comm_events
  with check (
    child_id = app.current_child_id()
    and app.device_belongs_to_current_child(device_id)
    and family_id = (select c.family_id from public.children c where c.id = child_id)
  );
