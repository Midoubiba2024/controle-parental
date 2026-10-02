-- =============================================================================
-- LOT 2 — Commandes à distance (pause / verrouillage instantané), demandes de
-- l'enfant (temps supplémentaire, déblocage) et crédits de temps (bonus).
--
-- Principes (docs/02-CONFORMITE.md & docs/03-ARCHITECTURE.md §5) :
--   * ADDITIF ; RLS 100 % ; search_path figé sur toute fonction.
--   * Co-régulation TRANSPARENTE : l'enfant demande, le parent approuve. Toutes
--     les demandes et décisions sont visibles des deux côtés.
--   * Verrouillage/pause VISIBLE par l'enfant (jamais furtif) ; l'appel
--     d'urgence (112) n'est JAMAIS bloqué (garanti côté app enfant).
--   * Livraison des commandes : l'appareil enfant LIT ses commandes 'pending'
--     (polling WorkManager, repli fiable sous Doze) et les ACQUITTE. FCM
--     n'accélère que la livraison (branché en L5) ; le modèle ci-dessous ne
--     dépend pas de FCM.
--   * Garde-fou : l'enfant ne peut QUE passer une commande à 'delivered'/'acked'
--     (accusé de réception) — jamais l'annuler ni contourner un verrou (trigger).
-- =============================================================================

do $$ begin
  -- lock_now : verrouille l'écran (lockNow via Device Admin/owner) (H1)
  -- pause    : suspend l'usage (overlay/suspend) jusqu'à 'resume' (A8)
  -- resume   : lève une pause en cours
  -- ring     : fait sonner l'appareil même en silencieux (V15)
  -- message  : affiche un message sur l'écran de verrouillage/pause (V16)
  create type app.command_type as enum ('lock_now', 'pause', 'resume', 'ring', 'message');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.command_status as enum ('pending', 'delivered', 'acked', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  -- extra_time  : + de minutes (global ou sur une app) (A9)
  -- unblock_app : débloquer temporairement une app bloquée (H3)
  -- reward      : bonus/récompense proposé (co-régulation) (A10)
  create type app.request_kind as enum ('extra_time', 'unblock_app', 'reward');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.request_status as enum ('pending', 'approved', 'denied', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.grant_source as enum ('request', 'reward', 'manual');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- commands — ordres parent → appareil enfant (A8/H1/V15/V16).
-- =============================================================================
create table if not exists public.commands (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  device_id   uuid not null references public.devices (id)  on delete cascade,
  type        app.command_type not null,
  payload     jsonb not null default '{}'::jsonb,   -- ex. { "message": "À table !" }
  status      app.command_status not null default 'pending',
  created_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '2 hours'),
  delivered_at timestamptz,
  acked_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_commands_device  on public.commands (device_id, status, created_at desc);
create index if not exists idx_commands_family  on public.commands (family_id, created_at desc);
create index if not exists idx_commands_child   on public.commands (child_id, created_at desc);

-- =============================================================================
-- requests — demandes enfant → parent (A9/A10/H3), co-régulation.
-- =============================================================================
create table if not exists public.requests (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  child_id     uuid not null references public.children (id) on delete cascade,
  device_id    uuid references public.devices (id) on delete set null,
  kind         app.request_kind not null,
  -- ex. { "minutes": 15, "package_name": "com.ex.jeu", "scope": "app"|"global" }
  payload      jsonb not null default '{}'::jsonb,
  status       app.request_status not null default 'pending',
  child_note   text check (child_note is null or char_length(child_note) <= 500),
  parent_note  text check (parent_note is null or char_length(parent_note) <= 500),
  created_by   uuid references auth.users (id) on delete set null,
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_requests_family on public.requests (family_id, status, created_at desc);
create index if not exists idx_requests_child  on public.requests (child_id, created_at desc);

-- =============================================================================
-- time_grants — crédits de minutes appliqués aux quotas (A10 + matérialisation
-- d'un extra_time approuvé). Lus par l'appareil enfant pour ajuster les limites.
-- =============================================================================
create table if not exists public.time_grants (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  -- Jour d'application (fuseau famille). Le bonus s'ajoute au quota de CE jour.
  grant_date     date not null default current_date,
  bonus_minutes  integer not null check (bonus_minutes >= 0),
  -- Portée : null = limite globale du jour ; sinon un package (quota d'app).
  scope_package  text check (scope_package is null or char_length(scope_package) between 1 and 255),
  source         app.grant_source not null default 'manual',
  request_id     uuid references public.requests (id) on delete set null,
  granted_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_time_grants_child on public.time_grants (child_id, grant_date desc);
create index if not exists idx_time_grants_family on public.time_grants (family_id, grant_date desc);

-- =============================================================================
-- Garde-fou : un compte ENFANT ne peut modifier une commande que pour en
-- accuser réception (pending → delivered → acked) et estamper les horodatages.
-- Il ne peut JAMAIS l'annuler ni changer son type/charge utile (anti-contournement
-- d'un verrou). Le parent (is_parent_of) n'est pas soumis à ce garde-fou.
-- =============================================================================
create or replace function app.commands_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Si l'acteur est un PARENT de la famille, aucune restriction.
  if app.is_parent_of(new.family_id) then
    return new;
  end if;

  -- Sinon (compte enfant) : seules des transitions d'accusé de réception sont
  -- permises, et uniquement vers l'avant.
  if new.type <> old.type
     or new.payload is distinct from old.payload
     or new.device_id <> old.device_id
     or new.child_id <> old.child_id
     or new.family_id <> old.family_id
     or new.expires_at <> old.expires_at
     or new.created_by is distinct from old.created_by then
    raise exception 'commande : seul l''accusé de réception est permis au compte enfant';
  end if;

  if new.status not in ('delivered', 'acked') then
    raise exception 'commande : statut % interdit au compte enfant', new.status;
  end if;
  if old.status in ('acked', 'cancelled', 'expired') then
    raise exception 'commande : déjà clôturée (%)', old.status;
  end if;

  return new;
end;
$$;
revoke execute on function app.commands_guard_child_update() from public, anon;
create trigger trg_commands_guard_child_update
  before update on public.commands
  for each row execute function app.commands_guard_child_update();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.commands    enable row level security;
alter table public.requests    enable row level security;
alter table public.time_grants enable row level security;

-- commands --------------------------------------------------------------------
-- SELECT : parent (sa famille) + enfant (ses commandes → visibilité/transparence)
create policy commands_select on public.commands
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
-- INSERT : parent uniquement (ordre parent → enfant), appareil de la bonne famille
create policy commands_insert on public.commands
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and exists (select 1 from public.devices d
                          where d.id = device_id and d.child_id = child_id and d.family_id = family_id));
-- UPDATE : parent (annulation, etc.) OU enfant (accusé de réception, borné par
-- le trigger app.commands_guard_child_update).
create policy commands_update_parent on public.commands
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy commands_update_child on public.commands
  for update to authenticated
  using (child_id = app.current_child_id())
  with check (child_id = app.current_child_id());
-- DELETE : parent uniquement.
create policy commands_delete on public.commands
  for delete to authenticated using (app.is_parent_of(family_id));

-- requests --------------------------------------------------------------------
-- SELECT : parent (sa famille) + enfant (ses demandes)
create policy requests_select on public.requests
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
-- INSERT : l'ENFANT crée ses demandes (status forcé 'pending' par le with check) ;
-- le parent peut aussi en créer (ex. proposer une récompense).
create policy requests_insert_child on public.requests
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and status = 'pending'
              and decided_by is null and decided_at is null);
create policy requests_insert_parent on public.requests
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
-- UPDATE : le parent décide (approve/deny) ; l'enfant peut seulement ANNULER sa
-- demande en attente (status pending → cancelled), sans s'auto-approuver.
create policy requests_update_parent on public.requests
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy requests_update_child on public.requests
  for update to authenticated
  using (child_id = app.current_child_id())
  with check (child_id = app.current_child_id()
              and status in ('pending', 'cancelled')
              and decided_by is null);

-- time_grants -----------------------------------------------------------------
-- SELECT : parent + enfant (transparence : l'enfant voit ses bonus)
create policy time_grants_select on public.time_grants
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
-- INSERT : parent uniquement (octroi de bonus / matérialisation d'un extra_time)
create policy time_grants_insert on public.time_grants
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
-- UPDATE/DELETE : parent (correction/retrait d'un bonus octroyé par erreur)
create policy time_grants_update on public.time_grants
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy time_grants_delete on public.time_grants
  for delete to authenticated using (app.is_parent_of(family_id));
