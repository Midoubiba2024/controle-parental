-- =============================================================================
-- LOT 10b — Appels anonymes : idempotence avec un hash NULL.
--
-- Contexte :
--   * 0005 crée comm_events avec unique (device_id, occurred_at, counterparty_hash,
--     direction), en NULLS DISTINCT (comportement par défaut de Postgres).
--   * 0009 contournait le problème côté appareil : un hash SENTINELLE stable
--     (« __no_number__ ») pour les numéros absents. Défaut constaté en revue :
--     tous les appels anonymes de l'enfant partageaient alors un faux
--     « correspondant » commun dans la console, au lieu de « Numéro masqué ».
--
-- Correctif :
--   * L'appareil envoie désormais counterparty_hash = NULL pour un numéro absent,
--     vide, privé, masqué, payphone ou inconnu (CounterpartyHash.of).
--   * Le sentinel « __no_number__ » est ABANDONNÉ.
--   * La contrainte d'unicité passe en NULLS NOT DISTINCT (Postgres ≥ 15) :
--     deux appels anonymes au même instant et dans le même sens restent UNE seule
--     ligne au rejeu. L'upsert de l'appareil (on_conflict=device_id,occurred_at,
--     counterparty_hash,direction & ignore-duplicates) est inchangé : PostgREST
--     infère cette contrainte.
--
-- ADDITIF et sans perte : aucune donnée supprimée. La contrainte remplacée porte
-- sur les mêmes colonnes. Son nom auto-généré en 0005 est tronqué à 63 caractères.
-- Idempotent : rejouable sans erreur.
-- =============================================================================

alter table public.comm_events
  drop constraint if exists comm_events_device_id_occurred_at_counterparty_hash_directi_key;

do $$
begin
  alter table public.comm_events
    add constraint comm_events_dedup_key
    unique nulls not distinct (device_id, occurred_at, counterparty_hash, direction);
exception
  when duplicate_object or duplicate_table then null;
end $$;

comment on constraint comm_events_dedup_key on public.comm_events is
  'Idempotence du journal d''appels (NULLS NOT DISTINCT) : un hash NULL = numéro masqué ou absent ; remplace le sentinel « __no_number__ » de 0009.';
