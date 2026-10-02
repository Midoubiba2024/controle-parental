-- =============================================================================
-- LOT 8b — Signalement TRANSPARENT du retrait d'une autorisation clé (report L8a).
--
-- Quand l'enfant révoque une permission essentielle (accès à l'usage, superposition,
-- notifications, localisation), une protection est désactivée. On le remonte au
-- parent de façon transparente — JAMAIS de contenu, seulement un booléen d'état.
--
-- Choix d'architecture : on RÉUTILISE la table de statut existante `device_status`
-- (relevé périodique batterie/stockage) plutôt que d'ajouter une table. Chaque
-- relevé porte désormais l'état des permissions au moment de la capture ; la console
-- lit le dernier relevé par appareil et affiche « une protection est désactivée ».
-- Les autres protections (VPN de filtrage, analyse ado) ont déjà leur état dédié
-- (filter_status.vpn_active, safety_status.analysis_active).
--
-- ADDITIF : colonnes NULLABLES (null = non renseigné par un ancien client). La RLS
-- de device_status (INSERT par l'enfant propriétaire, SELECT parent+enfant) couvre
-- déjà ces colonnes — aucune policy à modifier.
-- =============================================================================

alter table public.device_status
  add column if not exists perm_usage_access boolean,
  add column if not exists perm_overlay       boolean,
  add column if not exists perm_notifications  boolean,
  add column if not exists perm_location       boolean;

comment on column public.device_status.perm_usage_access is
  'Accès aux stats d''usage accordé (temps d''écran). null = non renseigné.';
comment on column public.device_status.perm_overlay is
  'Autorisation superposition (écran de pause) accordée. null = non renseigné.';
comment on column public.device_status.perm_notifications is
  'Notifications autorisées (l''enfant reçoit messages/alertes). null = non renseigné.';
comment on column public.device_status.perm_location is
  'Permission de localisation accordée (fine ou approchée). null = non renseigné.';
