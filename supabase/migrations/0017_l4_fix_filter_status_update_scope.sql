-- =============================================================================
-- LOT 4 — Durcissement RLS : filter_status_update (branche ENFANT).
--
-- 0015 a été appliquée en base live avec un WITH CHECK d'UPDATE dont la branche
-- enfant n'imposait PAS la cohérence family_id ↔ child_id (contrairement à
-- l'INSERT). Un compte enfant pouvait donc re-parenter sa ligne d'état
-- (family_id d'une autre famille) → pollution inter-familles ET possibilité de
-- masquer à son parent la désactivation du VPN (ligne rouge anti-contournement
-- C9). On corrige EN PLACE via ALTER POLICY (aucun DROP). Le fichier 0015 est par
-- ailleurs corrigé pour qu'un déploiement neuf soit correct d'emblée — cet ALTER
-- y est alors un no-op idempotent. Colonne QUALIFIÉE par filter_status (piège de
-- portée, leçon LOT 3). ADDITIF, ré-exécutable.
-- =============================================================================
alter policy filter_status_update on public.filter_status
  with check ((child_id = app.current_child_id()
               and app.device_belongs_to_current_child(device_id)
               and family_id = (select c.family_id from public.children c where c.id = filter_status.child_id))
              or app.is_parent_of(family_id));
