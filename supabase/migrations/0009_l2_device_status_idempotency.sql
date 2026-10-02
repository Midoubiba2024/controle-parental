-- =============================================================================
-- LOT 2 (correctif revue) — Idempotence de device_status.
--
-- device_status est une série temporelle insérée par l'appareil enfant. Sans clé
-- d'unicité, une réponse réseau perdue puis ré-émise au rejeu (WorkManager)
-- crée des doublons et fait grossir la table sans borne. On ajoute un index
-- UNIQUE (device_id, captured_at) : combiné au filigrane captured_at réutilisé
-- côté appareil (SupervisionStore.pendingStatusCapturedAt) et à l'upsert
-- ON CONFLICT ... DO NOTHING (ignore-duplicates), le rejeu devient idempotent.
--
-- ADDITIF : aucun DROP. Création d'index seulement.
--
-- NB (comm_events, NULLS DISTINCT) : le doublon possible pour un correspondant
-- sans numéro (counterparty_hash NULL ⇒ la contrainte unique ne matche pas) est
-- corrigé CÔTÉ APPAREIL — CallLogCollector n'émet plus jamais NULL mais un hash
-- SENTINELLE stable pour « numéro absent ». La contrainte existante
-- (device_id, occurred_at, counterparty_hash, direction) redevient donc
-- idempotente sans modification destructive du schéma.
-- =============================================================================

create unique index if not exists uq_device_status_device_captured
  on public.device_status (device_id, captured_at);
