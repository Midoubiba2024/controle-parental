-- =============================================================================
-- LOT 6 — Durcissement RLS (retours de revue code-review high de la PR #14).
--
-- 0019 est déjà appliquée en live → corrections EN PLACE via ALTER POLICY (aucun
-- DROP), idempotentes et ré-exécutables. 0019 est par ailleurs corrigée pour qu'un
-- déploiement neuf soit correct d'emblée (ces ALTER y sont alors des no-op).
--
-- #6 (LOW)  privacy_pauses INSERT : épingler created_by à l'utilisateur courant
--           (l'ado ne peut pas ouvrir une pause au nom d'un autre compte).
-- #10 (NIT) safety_settings : QUALIFIER la sous-requête corrélée par le nom de la
--           table (c.id = safety_settings.child_id) — cohérence leçon L3 (piège de
--           portée), même si children n'a pas de colonne child_id ici.
-- =============================================================================

-- #6 — privacy_pauses : created_by = auth.uid() (ou null).
alter policy privacy_pauses_insert on public.privacy_pauses
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = privacy_pauses.child_id)
              and ended_at is null
              and (created_by is null or created_by = (select auth.uid())));

-- #10 — safety_settings : sous-requêtes qualifiées.
alter policy safety_settings_insert on public.safety_settings
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = safety_settings.child_id));

alter policy safety_settings_update on public.safety_settings
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = safety_settings.child_id));
