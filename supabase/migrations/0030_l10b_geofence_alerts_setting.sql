-- =============================================================================
-- LOT 10b — Réglage « Alertes de zones », indépendant du partage de position.
--
-- Constat (revue de transparence) : les géofences s'enregistraient sur
-- l'appareil dès que la position précise était accordée, QUEL QUE SOIT
-- location_settings.mode. Le parent recevait donc les entrées et sorties de zones
-- même avec le partage de position réglé sur « off ».
--
-- Décision du responsable (04/10/2026) : un réglage SÉPARÉ, visible des deux côtés.
--   * true  (défaut) : comportement actuel conservé (une zone n'existe que si le
--     parent l'a créée) ; l'enfant en est informé dans « Mes données », y compris
--     quand le partage de position est désactivé.
--   * false : l'appareil désenregistre ses géofences et n'envoie plus aucune
--     transition ; « Mes données » l'indique à l'enfant.
--
-- RLS : rien à ajouter. Les politiques location_settings_* (0012, 0014) portent
-- sur la ligne entière, et aucun GRANT par colonne ne restreint cette table.
-- Export RGPD (0022) : inclus automatiquement (to_jsonb de la ligne).
--
-- ADDITIF, sans perte, idempotent.
-- =============================================================================

alter table public.location_settings
  add column if not exists geofence_alerts_enabled boolean not null default true;

comment on column public.location_settings.geofence_alerts_enabled is
  'Alertes d''entrée et de sortie de zones, indépendantes de mode. false = aucune géofence enregistrée sur l''appareil. L''enfant en est informé dans « Mes données ».';
