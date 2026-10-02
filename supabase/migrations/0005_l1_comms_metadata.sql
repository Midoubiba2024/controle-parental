-- =============================================================================
-- LOT 1 — Journal d'appels : MÉTADONNÉES UNIQUEMENT (veille v2 — V10).
--
-- LIGNE ROUGE (docs/02-CONFORMITE.md §2.1) : AUCUN enregistrement d'appel,
-- AUCUN contenu de message. On conserve seulement QUI / QUAND / COMBIEN DE TEMPS,
-- et le numéro du correspondant est HACHÉ (jamais stocké en clair) afin de
-- limiter l'exposition d'un tiers non consentant. Visible par l'enfant (K2).
--
-- Risque Play : la lecture du journal d'appels exige la permission sensible
-- READ_CALL_LOG. Côté app enfant, la collecte est DERRIÈRE UN FLAG (désactivée
-- par défaut en release). Justification de déclaration Play à documenter
-- (usage « core » de supervision parentale transparente, métadonnées seules).
-- =============================================================================

do $$ begin
  create type app.comm_kind as enum ('call');          -- SMS = extension future (READ_SMS très restreint Play)
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.comm_direction as enum ('incoming', 'outgoing', 'missed', 'rejected', 'blocked');
exception when duplicate_object then null; end $$;

create table if not exists public.comm_events (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families (id) on delete cascade,
  child_id           uuid not null references public.children (id) on delete cascade,
  device_id          uuid not null references public.devices (id)  on delete cascade,
  kind               app.comm_kind not null default 'call',
  direction          app.comm_direction not null,
  -- Numéro du correspondant HACHÉ (SHA-256 + pepper côté appareil). Jamais en
  -- clair. Permet de regrouper par correspondant sans exposer le numéro.
  counterparty_hash  text,
  -- Nom affiché du contact si résolu localement (optionnel, aide à la lecture).
  counterparty_label text,
  duration_ms        bigint check (duration_ms is null or duration_ms >= 0),
  occurred_at        timestamptz not null,
  created_at         timestamptz not null default now(),
  -- Idempotence : un même évènement (appareil + instant + correspondant + sens)
  -- n'est inséré qu'une fois, même si la collecte repasse dessus.
  unique (device_id, occurred_at, counterparty_hash, direction)
);
create index if not exists idx_comm_events_family on public.comm_events (family_id, occurred_at desc);
create index if not exists idx_comm_events_child  on public.comm_events (child_id, occurred_at desc);

alter table public.comm_events enable row level security;

create policy comm_events_select on public.comm_events
  for select to authenticated using (app.is_member_of(family_id));
create policy comm_events_insert on public.comm_events
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));
