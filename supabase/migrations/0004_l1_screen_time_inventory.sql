-- =============================================================================
-- LOT 1 — Observation transparente : temps d'écran, inventaire d'apps,
-- état de l'appareil (batterie & stockage).
--
-- Principe NON NÉGOCIABLE (voir docs/02-CONFORMITE.md) : MÉTADONNÉES / AGRÉGATS
-- uniquement. Jamais le CONTENU. Tout est visible par l'enfant (RLS de lecture).
--
-- Modèle d'écriture : l'appareil enfant agit sous le compte auth « child »
-- (voir pairing-complete). Il écrit donc SES propres lignes via PostgREST, sous
-- RLS. Le parent lit (tableaux de bord) ; l'enfant lit aussi (transparence K2).
-- RLS sur 100 % des tables ; helpers SECURITY DEFINER avec search_path figé.
-- =============================================================================

-- --- Helper : l'appareil appartient-il à l'enfant courant ? -------------------
-- Évite qu'un compte enfant écrive des métriques pour l'appareil d'un autre.
create or replace function app.device_belongs_to_current_child(p_device uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.devices d
    join public.children c on c.id = d.child_id
    where d.id = p_device
      and c.user_id = (select auth.uid())
  );
$$;
revoke execute on function app.device_belongs_to_current_child(uuid) from public, anon;
grant  execute on function app.device_belongs_to_current_child(uuid) to authenticated;

-- =============================================================================
-- Temps d'écran — agrégat PAR APP ET PAR JOUR (UsageStatsManager côté enfant).
-- Pas de granularité fine (sessions horodatées) : minimisation RGPD art. 5-1-c.
-- =============================================================================
create table if not exists public.usage_daily (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  child_id            uuid not null references public.children (id) on delete cascade,
  device_id           uuid not null references public.devices (id)  on delete cascade,
  day                 date not null,
  package_name        text not null check (char_length(package_name) between 1 and 255),
  app_label           text,
  category            text,            -- game/audio/video/social/... (ApplicationInfo.category)
  total_foreground_ms bigint not null default 0 check (total_foreground_ms >= 0),
  launch_count        integer not null default 0 check (launch_count >= 0),
  last_used_at        timestamptz,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (child_id, device_id, day, package_name)
);
create index if not exists idx_usage_daily_family on public.usage_daily (family_id, day desc);
create index if not exists idx_usage_daily_child  on public.usage_daily (child_id, day desc);
create trigger trg_usage_daily_touch before update on public.usage_daily
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- Inventaire des apps installées (LauncherApps + <queries> ciblé côté enfant).
-- =============================================================================
create table if not exists public.app_inventory (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  device_id      uuid not null references public.devices (id)  on delete cascade,
  package_name   text not null check (char_length(package_name) between 1 and 255),
  app_label      text,
  category       text,
  is_system      boolean not null default false,
  installed_at   timestamptz,         -- firstInstallTime (métadonnée OS)
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  removed_at     timestamptz,         -- non null = app désinstallée depuis
  updated_at     timestamptz not null default now(),
  unique (child_id, device_id, package_name)
);
create index if not exists idx_app_inventory_family on public.app_inventory (family_id);
create index if not exists idx_app_inventory_child  on public.app_inventory (child_id);
create trigger trg_app_inventory_touch before update on public.app_inventory
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- État de l'appareil : batterie & stockage (veille v2 — V17). Métadonnées.
-- =============================================================================
create table if not exists public.device_status (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  child_id            uuid not null references public.children (id) on delete cascade,
  device_id           uuid not null references public.devices (id)  on delete cascade,
  battery_level       smallint check (battery_level between 0 and 100),
  is_charging         boolean,
  storage_total_bytes bigint check (storage_total_bytes >= 0),
  storage_free_bytes  bigint check (storage_free_bytes >= 0),
  captured_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists idx_device_status_device on public.device_status (device_id, captured_at desc);
create index if not exists idx_device_status_family on public.device_status (family_id, captured_at desc);

-- =============================================================================
-- Row Level Security
--   * enfant (compte « child ») : écrit/MAJ SES lignes (device lui appartenant)
--   * tous les membres de la famille : lecture (parent = tableaux de bord,
--     enfant = transparence « mes données »)
-- =============================================================================
alter table public.usage_daily    enable row level security;
alter table public.app_inventory  enable row level security;
alter table public.device_status  enable row level security;

-- usage_daily -----------------------------------------------------------------
create policy usage_daily_select on public.usage_daily
  for select to authenticated using (app.is_member_of(family_id));
create policy usage_daily_insert on public.usage_daily
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));
create policy usage_daily_update on public.usage_daily
  for update to authenticated
  using (child_id = app.current_child_id())
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));

-- app_inventory ---------------------------------------------------------------
create policy app_inventory_select on public.app_inventory
  for select to authenticated using (app.is_member_of(family_id));
create policy app_inventory_insert on public.app_inventory
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));
create policy app_inventory_update on public.app_inventory
  for update to authenticated
  using (child_id = app.current_child_id())
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));

-- device_status ---------------------------------------------------------------
create policy device_status_select on public.device_status
  for select to authenticated using (app.is_member_of(family_id));
create policy device_status_insert on public.device_status
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id));
