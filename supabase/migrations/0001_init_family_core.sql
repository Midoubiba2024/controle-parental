-- =============================================================================
-- LOT 0 — Socle & Conformité : modèle de données famille + RLS
-- Projet : contrôle parental transparent (Android), profils 6 ans & 12 ans
--
-- Principes appliqués (voir docs/02-CONFORMITE.md et docs/03-ARCHITECTURE.md) :
--   * Isolation stricte par family_id, RLS sur 100 % des tables
--   * Moindre privilège : parent R/W sa famille ; enfant lit SES données
--     (transparence) + écrit le strict nécessaire ; service_role côté serveur
--   * audit_log append-only (accountability RGPD art. 5.2), lisible par l'enfant
--   * Rôle porté par l'appartenance à une famille (jamais un rôle global client)
-- =============================================================================

-- --- Schéma dédié aux fonctions applicatives (helpers RLS) ------------------
create schema if not exists app;

-- --- Types énumérés ---------------------------------------------------------
do $$ begin
  create type app.family_role as enum ('owner', 'parent', 'guardian', 'child');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.device_platform as enum ('android', 'ios', 'web');
exception when duplicate_object then null; end $$;

do $$ begin
  -- standard   : installation simple, blocage potentiellement contournable
  -- reinforced : device owner (provisioning QR), blocage inviolable
  create type app.device_mode as enum ('standard', 'reinforced');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Curseur d'intrusivité dégressif avec l'âge (CNIL : capacités évolutives)
  create type app.age_profile as enum ('young_child', 'preteen', 'teen');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Fonction utilitaire : updated_at
-- =============================================================================
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- Foyer -----------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Appartenance (rôle porté par la famille) -----------------------------------
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        app.family_role not null,
  created_at  timestamptz not null default now(),
  unique (family_id, user_id)
);
create index if not exists idx_memberships_user   on public.memberships (user_id);
create index if not exists idx_memberships_family on public.memberships (family_id);

-- Profil enfant ---------------------------------------------------------------
create table if not exists public.children (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  -- compte auth de l'enfant (provisionné par le parent) ; nullable au départ
  user_id       uuid unique references auth.users (id) on delete set null,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  birth_date    date,
  age_profile   app.age_profile not null default 'young_child',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_children_family on public.children (family_id);

-- Appareils de l'enfant -------------------------------------------------------
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  child_id      uuid not null references public.children (id) on delete cascade,
  platform      app.device_platform not null default 'android',
  mode          app.device_mode not null default 'standard',
  label         text,
  model         text,
  os_version    text,
  public_key    text,                 -- clé publique de l'appareil (device-binding)
  enrolled_at   timestamptz,
  last_seen_at  timestamptz,
  revoked_at    timestamptz,          -- révocation (non null = appareil désenrôlé)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_devices_family on public.devices (family_id);
create index if not exists idx_devices_child  on public.devices (child_id);

-- Jetons push (FCM/APNs) ------------------------------------------------------
create table if not exists public.device_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.devices (id) on delete cascade,
  provider    text not null check (provider in ('fcm', 'apns')),
  token       text not null,
  updated_at  timestamptz not null default now(),
  unique (device_id, provider)
);

-- Consentements (par finalité) ------------------------------------------------
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  purpose     text not null,          -- ex : screen_time, location, geofencing, sos...
  basis       text not null check (basis in ('parental_authority','child_assent','child_consent')),
  granted     boolean not null default true,
  granted_by  uuid references auth.users (id) on delete set null,
  version     text not null default 'v1',
  created_at  timestamptz not null default now()
);
create index if not exists idx_consents_child on public.consents (child_id);

-- Codes d'appairage (éphémères, hachés) ---------------------------------------
create table if not exists public.pairing_codes (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  child_id     uuid not null references public.children (id) on delete cascade,
  code_hash    text not null,         -- hash du code court (jamais le code en clair)
  mode         app.device_mode not null default 'standard',
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pairing_family on public.pairing_codes (family_id);

-- Journal d'audit (append-only) -----------------------------------------------
create table if not exists public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  actor_id          uuid references auth.users (id) on delete set null,
  actor_role        text,
  action            text not null,
  subject_child_id  uuid references public.children (id) on delete set null,
  target_table      text,
  target_id         uuid,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_audit_family  on public.audit_log (family_id, created_at desc);
create index if not exists idx_audit_subject on public.audit_log (subject_child_id, created_at desc);

-- =============================================================================
-- Triggers : updated_at + audit append-only
-- =============================================================================
create trigger trg_families_touch   before update on public.families  for each row execute function app.touch_updated_at();
create trigger trg_children_touch   before update on public.children  for each row execute function app.touch_updated_at();
create trigger trg_devices_touch    before update on public.devices   for each row execute function app.touch_updated_at();

-- audit_log : immutabilité du CONTENU (interdiction de modification).
-- NB : on ne bloque PAS le DELETE par trigger, car cela casserait la suppression
-- en cascade d'une famille (droit à l'effacement RGPD) et les purges de rétention.
-- La protection contre la suppression par un utilisateur vient de la RLS :
-- aucune policy DELETE pour 'authenticated' → seul le service_role (Edge
-- Functions d'effacement/rétention) peut supprimer.
create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log est append-only : % interdit', tg_op;
end;
$$;
create trigger trg_audit_no_update before update on public.audit_log for each row execute function app.audit_log_immutable();

-- =============================================================================
-- Fonctions helper pour la RLS (SECURITY DEFINER = contournent la RLS des
-- tables qu'elles lisent → évitent la récursion sur memberships)
-- =============================================================================
create or replace function app.is_member_of(p_family uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.family_id = p_family
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_parent_of(p_family uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.family_id = p_family
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'parent', 'guardian')
  );
$$;

create or replace function app.is_owner_of(p_family uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.family_id = p_family
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Identifiant du profil enfant lié au compte courant (comptes enfant)
create or replace function app.current_child_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id from public.children c
  where c.user_id = (select auth.uid())
  limit 1;
$$;

revoke execute on function app.is_member_of(uuid)   from public, anon;
revoke execute on function app.is_parent_of(uuid)   from public, anon;
revoke execute on function app.is_owner_of(uuid)    from public, anon;
revoke execute on function app.current_child_id()   from public, anon;
grant  execute on function app.is_member_of(uuid)   to authenticated;
grant  execute on function app.is_parent_of(uuid)   to authenticated;
grant  execute on function app.is_owner_of(uuid)    to authenticated;
grant  execute on function app.current_child_id()   to authenticated;

-- Écriture d'audit depuis le code applicatif (contourne la RLS en écriture)
create or replace function app.audit(
  p_family uuid, p_action text, p_subject_child uuid default null,
  p_target_table text default null, p_target_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_role text;
begin
  select m.role::text into v_role
  from public.memberships m
  where m.family_id = p_family and m.user_id = (select auth.uid())
  limit 1;

  insert into public.audit_log (family_id, actor_id, actor_role, action,
                                subject_child_id, target_table, target_id, detail)
  values (p_family, (select auth.uid()), v_role, p_action,
          p_subject_child, p_target_table, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;
grant execute on function app.audit(uuid, text, uuid, text, uuid, jsonb) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.families           enable row level security;
alter table public.memberships        enable row level security;
alter table public.children           enable row level security;
alter table public.devices            enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.consents           enable row level security;
alter table public.pairing_codes      enable row level security;
alter table public.audit_log          enable row level security;

-- families --------------------------------------------------------------------
create policy families_select on public.families
  for select to authenticated using (app.is_member_of(id));
create policy families_update on public.families
  for update to authenticated using (app.is_parent_of(id)) with check (app.is_parent_of(id));
create policy families_delete on public.families
  for delete to authenticated using (app.is_owner_of(id));
-- INSERT : via Edge Function create-family (service_role) uniquement.

-- memberships -----------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated using (app.is_member_of(family_id));
create policy memberships_insert on public.memberships
  for insert to authenticated with check (app.is_parent_of(family_id));
create policy memberships_update on public.memberships
  for update to authenticated using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy memberships_delete on public.memberships
  for delete to authenticated using (app.is_owner_of(family_id));

-- children --------------------------------------------------------------------
-- SELECT : tous les membres (le parent voit tout ; l'enfant voit sa famille →
--          transparence/visibilité mutuelle).
create policy children_select on public.children
  for select to authenticated using (app.is_member_of(family_id));
create policy children_write_ins on public.children
  for insert to authenticated with check (app.is_parent_of(family_id));
create policy children_write_upd on public.children
  for update to authenticated using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy children_write_del on public.children
  for delete to authenticated using (app.is_parent_of(family_id));

-- devices ---------------------------------------------------------------------
create policy devices_select on public.devices
  for select to authenticated using (app.is_member_of(family_id));
create policy devices_ins on public.devices
  for insert to authenticated with check (app.is_parent_of(family_id));
create policy devices_upd on public.devices
  for update to authenticated using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy devices_del on public.devices
  for delete to authenticated using (app.is_parent_of(family_id));

-- device_push_tokens ----------------------------------------------------------
-- Lecture par les membres de la famille (via jointure devices) ; écriture via
-- Edge Function (service_role) lors de l'enrôlement / rafraîchissement du token.
create policy push_tokens_select on public.device_push_tokens
  for select to authenticated using (
    exists (select 1 from public.devices d
            where d.id = device_id and app.is_member_of(d.family_id))
  );

-- consents --------------------------------------------------------------------
create policy consents_select on public.consents
  for select to authenticated using (app.is_member_of(family_id));
create policy consents_ins on public.consents
  for insert to authenticated with check (app.is_parent_of(family_id));
create policy consents_upd on public.consents
  for update to authenticated using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));

-- pairing_codes ---------------------------------------------------------------
-- Métadonnées lisibles par le parent (le code en clair n'est jamais stocké) ;
-- création/consommation via Edge Functions (service_role).
create policy pairing_select on public.pairing_codes
  for select to authenticated using (app.is_parent_of(family_id));

-- audit_log -------------------------------------------------------------------
-- Parent : tout l'audit de sa famille. Enfant : uniquement les entrées le
-- concernant (transparence « qui a consulté mes données »).
create policy audit_select on public.audit_log
  for select to authenticated using (
    app.is_parent_of(family_id)
    or subject_child_id = app.current_child_id()
  );
-- INSERT : via app.audit() (SECURITY DEFINER) ; pas d'écriture directe.

-- =============================================================================
-- Hook custom access token : enrichit le JWT avec les familles + rôles.
-- (La RLS ne DÉPEND pas de ce hook — les helpers lisent memberships en direct —
--  mais le hook alimente le client et la Realtime Authorization.)
-- NB : après cette migration, activer le hook dans le dashboard Supabase :
--      Authentication > Hooks > Custom Access Token > public.custom_access_token_hook
-- =============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  claims jsonb;
  fams   jsonb;
  child  uuid;
begin
  select coalesce(
           jsonb_agg(jsonb_build_object('family_id', m.family_id, 'role', m.role)),
           '[]'::jsonb)
    into fams
  from public.memberships m
  where m.user_id = (event->>'user_id')::uuid;

  select c.id into child
  from public.children c
  where c.user_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';
  if claims->'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;
  claims := jsonb_set(claims, '{app_metadata,families}', fams);
  if child is not null then
    claims := jsonb_set(claims, '{app_metadata,child_id}', to_jsonb(child));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Le hook s'exécute sous le rôle supabase_auth_admin : lui donner accès.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.memberships to supabase_auth_admin;
grant select on public.children    to supabase_auth_admin;

create policy auth_admin_read_memberships on public.memberships
  as permissive for select to supabase_auth_admin using (true);
create policy auth_admin_read_children on public.children
  as permissive for select to supabase_auth_admin using (true);
