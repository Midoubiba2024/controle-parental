-- =============================================================================
-- Banc de test LOCAL : stubs minimaux de l'environnement Supabase, appliqués sur
-- un Postgres jetable AVANT les migrations 0001..00NN. Ne JAMAIS appliquer en
-- production (Supabase fournit déjà ces objets).
--
-- Reproduit : rôles anon / authenticated / service_role / supabase_auth_admin,
-- schéma auth (users minimal avec is_anonymous, uid(), jwt() lisant
-- request.jwt.claims comme PostgREST), schéma extensions (pgcrypto), publication
-- supabase_realtime, privilèges par défaut du schéma public.
-- =============================================================================

do $$ begin create role anon nologin noinherit;                exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit;       exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_auth_admin nologin noinherit; exception when duplicate_object then null; end $$;

-- Extensions (Supabase : schéma `extensions`).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;

-- Schéma auth minimal.
create schema if not exists auth;
create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  is_anonymous  boolean not null default false,
  created_at    timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant execute on all functions in schema auth to anon, authenticated, service_role, supabase_auth_admin;

-- Privilèges par défaut du schéma public (comme Supabase).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Publication Realtime (0012/0018/0019 y ajoutent des tables).
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;
