-- =============================================================================
-- LOT 3 — Localisation & Sécurité (tranche 1)
--
-- Modules D (localisation & géofencing) et E (urgence & SOS). Voir
-- docs/01-CAHIER-DES-CHARGES.md (modules D/E), docs/03-ARCHITECTURE.md (§3, §5)
-- et docs/08-LOT3-LOCALISATION.md.
--
-- LIGNES ROUGES (docs/02-CONFORMITE.md) appliquées ici :
--   * Géolocalisation JAMAIS occulte : positions de NOTRE app uniquement, visibles
--     de l'enfant (RLS de lecture pour le compte enfant = transparence K2/K3).
--   * Minimisation RGPD (art. 5-1-c) : lat/lng + précision bornées, pas de vitesse
--     ni de cap ; rétention courte pilotée par location_settings.retention_days
--     (purge auto branchée en L8) ; diffusion SOS bornée à l'épisode (sos_events).
--   * Graduation par âge : location_settings.mode (off|on_demand|periodic) — défaut
--     'on_demand' (privacy by default, art. 25) ; le parent passe l'enfant en
--     'periodic' selon l'âge. Les bulles de confidentialité ado (D8) arrivent en
--     tranche 2 (design documenté dans docs/08).
--
-- RÈGLES DB (strictes) : migration ADDITIVE ; RLS 100 % ; search_path figé sur
-- toute fonction ; réutilisation des helpers existants (app.is_parent_of,
-- app.current_child_id, app.device_belongs_to_current_child). Enfant : insert
-- scindé par current_child_id() + device lui appartenant ; parent : lecture/écriture
-- via is_parent_of(family_id). family_id ↔ child_id validé en WITH CHECK.
-- =============================================================================

-- --- Types énumérés ----------------------------------------------------------
do $$ begin
  -- periodic   : position de fond (cadence adaptative, pilotée par settings)
  -- on_demand  : check-in ponctuel (getCurrentLocation one-shot, commande 'locate')
  -- sos        : diffusion en direct pendant un épisode SOS (bornée)
  create type app.location_source as enum ('periodic', 'on_demand', 'sos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.geofence_type as enum ('home', 'school', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.geofence_transition as enum ('enter', 'exit', 'dwell');
exception when duplicate_object then null; end $$;

do $$ begin
  -- active : SOS en cours (diffusion live) ; acked : un parent a vu (« aide en
  -- route », E6) ; resolved : épisode clos (par l'enfant ou le parent)
  create type app.sos_status as enum ('active', 'acked', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.safety_alert_kind as enum ('low_battery');
exception when duplicate_object then null; end $$;

do $$ begin
  -- off       : partage de position désactivé
  -- on_demand : check-in ponctuel à la demande du parent (moins intrusif, défaut)
  -- periodic  : relevés de fond à cadence adaptative (profil jeune enfant)
  create type app.location_mode as enum ('off', 'on_demand', 'periodic');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- location_settings — réglage de partage de position PAR ENFANT (graduation âge).
-- Lu par l'appareil enfant (cadence + transparence) et par le parent (console).
-- =============================================================================
create table if not exists public.location_settings (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families (id) on delete cascade,
  child_id              uuid not null unique references public.children (id) on delete cascade,
  enabled               boolean not null default true,
  -- Privacy by default (art. 25) : le moins intrusif par défaut = check-in ponctuel.
  mode                  app.location_mode not null default 'on_demand',
  -- Cadence des relevés périodiques (bornée : adaptative/Doze côté appareil).
  periodic_interval_sec integer not null default 900 check (periodic_interval_sec between 300 and 21600),
  -- Rétention de l'historique (jours) — minimisation RGPD ; purge auto en L8.
  retention_days        integer not null default 30 check (retention_days between 1 and 365),
  high_accuracy         boolean not null default false,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);
create index if not exists idx_location_settings_family on public.location_settings (family_id);
create trigger trg_location_settings_touch before update on public.location_settings
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- location_fixes — positions horodatées (D1 temps réel, D2 check-in, D3 historique,
-- E2 diffusion SOS). Précision BORNÉE, pas de vitesse/cap (minimisation).
-- =============================================================================
create table if not exists public.location_fixes (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  device_id      uuid not null references public.devices (id)  on delete cascade,
  captured_at    timestamptz not null default now(),
  latitude       double precision not null check (latitude between -90 and 90),
  longitude      double precision not null check (longitude between -180 and 180),
  accuracy_m     real check (accuracy_m is null or accuracy_m >= 0),
  source         app.location_source not null default 'periodic',
  -- Niveau de batterie au moment du relevé (corrélation D7, facultatif).
  battery_level  smallint check (battery_level is null or battery_level between 0 and 100),
  created_at     timestamptz not null default now(),
  -- Idempotence des remontées (upsert ignore-duplicates) : un relevé est unique
  -- par appareil + instant de capture.
  unique (device_id, captured_at)
);
create index if not exists idx_location_fixes_child  on public.location_fixes (child_id, captured_at desc);
create index if not exists idx_location_fixes_family on public.location_fixes (family_id, captured_at desc);
create index if not exists idx_location_fixes_sos    on public.location_fixes (child_id, source, captured_at desc);

-- =============================================================================
-- geofences — zones de confiance (maison/école/perso) + alertes ENTER/EXIT.
-- Lisibles par l'appareil enfant (il doit les enregistrer dans GeofencingClient).
-- Limite OS ~100 geofences/app : le parent reste bien en dessous.
-- =============================================================================
create table if not exists public.geofences (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  child_id      uuid not null references public.children (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  type          app.geofence_type not null default 'custom',
  center_lat    double precision not null check (center_lat between -90 and 90),
  center_lng    double precision not null check (center_lng between -180 and 180),
  -- Rayon borné : trop petit = faux positifs GPS ; trop grand = inutile.
  radius_m      integer not null default 150 check (radius_m between 80 and 10000),
  enabled       boolean not null default true,
  notify_enter  boolean not null default true,   -- check-in « bien arrivé » (D6)
  notify_exit   boolean not null default false,
  created_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_geofences_child  on public.geofences (child_id);
create index if not exists idx_geofences_family on public.geofences (family_id);
create trigger trg_geofences_touch before update on public.geofences
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- geofence_events — transitions ENTER/EXIT/DWELL détectées côté appareil.
-- =============================================================================
create table if not exists public.geofence_events (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  child_id     uuid not null references public.children (id) on delete cascade,
  device_id    uuid not null references public.devices (id)  on delete cascade,
  -- on delete set null : on conserve l'historique même si la zone est supprimée.
  geofence_id  uuid references public.geofences (id) on delete set null,
  geofence_name text,                 -- snapshot du nom (zone supprimée → lisible)
  transition   app.geofence_transition not null,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_geofence_events_child  on public.geofence_events (child_id, occurred_at desc);
create index if not exists idx_geofence_events_family on public.geofence_events (family_id, occurred_at desc);

-- =============================================================================
-- sos_events — bouton SOS déclenché PAR L'ENFANT (E1), diffusion live (E2),
-- accusé parent « aide en route » (E6). Déclenché par l'enfant = transparent.
-- =============================================================================
create table if not exists public.sos_events (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  child_id     uuid not null references public.children (id) on delete cascade,
  device_id    uuid not null references public.devices (id)  on delete cascade,
  status       app.sos_status not null default 'active',
  message      text check (message is null or char_length(message) <= 500),
  started_at   timestamptz not null default now(),
  acked_by     uuid references auth.users (id) on delete set null,
  acked_at     timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_sos_events_child  on public.sos_events (child_id, started_at desc);
create index if not exists idx_sos_events_family on public.sos_events (family_id, status, started_at desc);

-- =============================================================================
-- safety_alerts — alerte batterie faible + dernière position connue (D7).
-- =============================================================================
create table if not exists public.safety_alerts (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families (id) on delete cascade,
  child_id        uuid not null references public.children (id) on delete cascade,
  device_id       uuid not null references public.devices (id)  on delete cascade,
  kind            app.safety_alert_kind not null,
  battery_level   smallint check (battery_level is null or battery_level between 0 and 100),
  -- Dernière position connue rattachée (facultatif) ; set null si purgée.
  location_fix_id uuid references public.location_fixes (id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_safety_alerts_child  on public.safety_alerts (child_id, created_at desc);
create index if not exists idx_safety_alerts_family on public.safety_alerts (family_id, created_at desc);

-- =============================================================================
-- Garde-fou : un compte ENFANT ne peut faire évoluer SON SOS que vers 'resolved'
-- (clore l'épisode) et estamper ended_at. Il ne peut PAS s'auto-« acquitter »
-- (acked_by/acked_at = action parent) ni changer l'identité de l'épisode. Le
-- parent (is_parent_of) n'est pas soumis à ce garde-fou. Même esprit que
-- app.commands_guard_child_update (migration 0008).
-- =============================================================================
create or replace function app.sos_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if app.is_parent_of(new.family_id) then
    return new;
  end if;

  -- Compte enfant : identité immuable, pas d'accusé de réception auto.
  if new.family_id <> old.family_id
     or new.child_id <> old.child_id
     or new.device_id <> old.device_id
     or new.started_at <> old.started_at
     or new.acked_by is distinct from old.acked_by
     or new.acked_at is distinct from old.acked_at then
    raise exception 'sos : seule la clôture (resolved) est permise au compte enfant';
  end if;
  if new.status not in ('active', 'resolved') then
    raise exception 'sos : statut % interdit au compte enfant', new.status;
  end if;

  return new;
end;
$$;
revoke execute on function app.sos_guard_child_update() from public, anon;
create trigger trg_sos_guard_child_update
  before update on public.sos_events
  for each row execute function app.sos_guard_child_update();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.location_settings enable row level security;
alter table public.location_fixes    enable row level security;
alter table public.geofences         enable row level security;
alter table public.geofence_events   enable row level security;
alter table public.sos_events        enable row level security;
alter table public.safety_alerts     enable row level security;

-- location_settings -----------------------------------------------------------
-- Lecture par tous les membres (enfant = transparence : il voit son réglage) ;
-- écriture par le parent uniquement (family_id ↔ child_id validé).
create policy location_settings_select on public.location_settings
  for select to authenticated using (app.is_member_of(family_id));
create policy location_settings_insert on public.location_settings
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy location_settings_update on public.location_settings
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy location_settings_delete on public.location_settings
  for delete to authenticated using (app.is_parent_of(family_id));

-- location_fixes --------------------------------------------------------------
-- Lecture : tous les membres (parent = carte/historique ; enfant = transparence).
-- Écriture : l'ENFANT insère SES positions, pour SON appareil. Pas d'update/delete
-- en direct (append-only ; purge de rétention via service_role en L8).
create policy location_fixes_select on public.location_fixes
  for select to authenticated using (app.is_member_of(family_id));
create policy location_fixes_insert on public.location_fixes
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));

-- geofences -------------------------------------------------------------------
-- Lecture par tous les membres : l'appareil enfant DOIT lire les zones pour les
-- enregistrer (GeofencingClient). Écriture par le parent (family_id ↔ child_id).
create policy geofences_select on public.geofences
  for select to authenticated using (app.is_member_of(family_id));
create policy geofences_insert on public.geofences
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy geofences_update on public.geofences
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy geofences_delete on public.geofences
  for delete to authenticated using (app.is_parent_of(family_id));

-- geofence_events -------------------------------------------------------------
-- Lecture : tous les membres. Écriture : l'enfant insère ses transitions pour son
-- appareil ; la zone référencée doit appartenir à la même famille (anti-usurpation).
create policy geofence_events_select on public.geofence_events
  for select to authenticated using (app.is_member_of(family_id));
create policy geofence_events_insert on public.geofence_events
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and (geofence_id is null
                   or family_id = (select g.family_id from public.geofences g where g.id = geofence_id)));

-- sos_events ------------------------------------------------------------------
-- Lecture : parent (sa famille) + enfant (ses épisodes → transparence).
-- Insert : l'ENFANT déclenche son SOS (status 'active' forcé), pour son appareil.
-- Update : parent (ack/clôture) OU enfant (clôture only, borné par le trigger).
create policy sos_events_select on public.sos_events
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy sos_events_insert on public.sos_events
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and status = 'active'
              and acked_by is null and acked_at is null);
create policy sos_events_update_parent on public.sos_events
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy sos_events_update_child on public.sos_events
  for update to authenticated
  using (child_id = app.current_child_id())
  with check (child_id = app.current_child_id());

-- safety_alerts ---------------------------------------------------------------
-- Lecture : tous les membres. Insert : l'enfant (batterie faible auto). Update :
-- le parent (acquittement). Pas de delete direct (append-only ; purge en L8).
create policy safety_alerts_select on public.safety_alerts
  for select to authenticated using (app.is_member_of(family_id));
create policy safety_alerts_insert on public.safety_alerts
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy safety_alerts_update on public.safety_alerts
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));

-- =============================================================================
-- Realtime : diffusion live du SOS (E2) et réactivité des alertes. La RLS
-- ci-dessus s'applique AUSSI au flux Realtime (Realtime Authorization) : chaque
-- abonné ne reçoit que les lignes de SA famille. On ajoute les tables à la
-- publication supabase_realtime de façon idempotente (ADD TABLE n'a pas de
-- IF NOT EXISTS → on vérifie pg_publication_tables).
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['location_fixes', 'sos_events', 'geofence_events', 'safety_alerts']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when undefined_object then
    -- La publication n'existe pas (projet sans Realtime) : on ignore.
    raise notice 'publication supabase_realtime absente — Realtime non activé';
end $$;
