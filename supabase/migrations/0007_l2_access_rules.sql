-- =============================================================================
-- LOT 2 — Règles d'accès : politiques par enfant, limites de temps, règles par
-- application/catégorie, plannings réutilisables (horaires, Downtime, École).
--
-- Principes (voir docs/02-CONFORMITE.md & docs/04-LOTS.md §L2) :
--   * ADDITIF : aucune table/colonne/policy existante supprimée (pas de DROP).
--   * RLS sur 100 % des nouvelles tables ; helpers SECURITY DEFINER déjà en place
--     (app.is_parent_of / app.current_child_id), search_path figé partout.
--   * TRANSPARENCE (ligne rouge) : TOUT réglage est LISIBLE PAR L'ENFANT
--     (child_id = app.current_child_id()). Aucun mode furtif. L'écran « mes
--     données » côté enfant reflète ces règles.
--   * Les appels d'urgence (112) ne sont JAMAIS bloqués : c'est garanti côté
--     app enfant (liste d'exemption inviolable), les règles ci-dessous ne
--     portent que sur des packages applicatifs ordinaires.
--   * Accountability RGPD art. 5.2 : chaque changement de règle est journalisé
--     dans audit_log (trigger), donc visible par l'enfant concerné.
-- =============================================================================

-- --- Types énumérés ----------------------------------------------------------
do $$ begin
  -- block        : app/catégorie interdite
  -- allow        : explicitement autorisée (surclasse un blocage de catégorie)
  -- limit        : autorisée avec quota de temps/jour (daily_limit_minutes)
  -- always_allow : exemptée de TOUT blocage (planning/downtime/limite globale) —
  --                p. ex. téléphone, apps éducatives essentielles (A7)
  create type app.rule_action as enum ('block', 'allow', 'limit', 'always_allow');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.rule_target as enum ('package', 'category');
exception when duplicate_object then null; end $$;

do $$ begin
  -- downtime : fenêtre de coucher / repos (tout bloqué sauf always_allow) (A5)
  -- allowed  : SEULES les fenêtres listées autorisent l'usage (plages permises)
  -- blocked  : les fenêtres listées interdisent l'usage (devoirs, repas) (A4)
  -- school   : mode École — hors always_allow, seules les apps éducatives (A6)
  create type app.schedule_kind as enum ('downtime', 'allowed', 'blocked', 'school');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- access_policies — réglages GLOBAUX par enfant (une ligne par enfant).
-- =============================================================================
create table if not exists public.access_policies (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families (id) on delete cascade,
  child_id              uuid not null unique references public.children (id) on delete cascade,
  -- Préférence d'application : 'standard' (overlay, contournable) ou 'reinforced'
  -- (device owner : setPackagesSuspended/Hidden). L'effectivité dépend du mode
  -- réel de l'appareil (public.devices.mode).
  enforcement_mode      app.device_mode not null default 'standard',
  -- Limite d'écran quotidienne GLOBALE par défaut (minutes). null = pas de limite
  -- globale. Les exceptions par jour de semaine vivent dans screen_time_limits.
  daily_limit_minutes   integer check (daily_limit_minutes is null or daily_limit_minutes >= 0),
  -- Délai de grâce « encore 1 min » (V6) : à l'atteinte d'un quota, l'enfant peut
  -- prolonger brièvement, un nombre borné de fois par jour.
  grace_enabled         boolean not null default true,
  grace_minutes         integer not null default 1  check (grace_minutes between 0 and 15),
  grace_uses_per_day    integer not null default 1  check (grace_uses_per_day >= 0),
  -- Validation d'installation (B2) : si true, toute nouvelle app est bloquée
  -- tant que le parent ne l'a pas autorisée (app_rules action 'allow').
  block_new_apps        boolean not null default false,
  -- Restriction par classification d'âge du store (B4). Étiquette indicative
  -- (ex. 'PEGI 7', 'PEGI 12'…) ; l'application dépend des métadonnées de store
  -- (voir docs : enrichissement futur). null = aucune restriction.
  max_content_rating    text check (max_content_rating is null or char_length(max_content_rating) <= 40),
  -- Verrouillage des réglages système anti-contournement (V5) : date/heure,
  -- comptes, options développeur. Applicable réellement en mode Renforcé
  -- (device owner / user restrictions) ; sinon, réglage consigné + guidage.
  lock_system_settings  boolean not null default false,
  -- Mode vacances / pause de planning (V4). Si la date du jour est dans
  -- [vacation_from, vacation_until], les plannings horaires/Downtime/École sont
  -- suspendus (les limites de temps restent, sauf choix inverse côté UI).
  vacation_from         date,
  vacation_until        date,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  check (vacation_until is null or vacation_from is null or vacation_until >= vacation_from)
);
create index if not exists idx_access_policies_family on public.access_policies (family_id);
create trigger trg_access_policies_touch before update on public.access_policies
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- screen_time_limits — limite d'écran globale PAR JOUR DE SEMAINE (A1).
-- day_of_week : 0 = dimanche … 6 = samedi (null = valeur par défaut tous jours,
-- redondante avec access_policies.daily_limit_minutes mais permet un défaut
-- explicite). Surcharge le défaut global quand une ligne existe pour le jour.
-- =============================================================================
create table if not exists public.screen_time_limits (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  day_of_week    smallint check (day_of_week is null or day_of_week between 0 and 6),
  limit_minutes  integer not null check (limit_minutes >= 0),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (child_id, day_of_week)
);
create index if not exists idx_screen_time_limits_child on public.screen_time_limits (child_id);
create trigger trg_screen_time_limits_touch before update on public.screen_time_limits
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- app_rules — règle PAR APPLICATION (package) ou PAR CATÉGORIE (B1/A2/A3/A7).
-- =============================================================================
create table if not exists public.app_rules (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families (id) on delete cascade,
  child_id             uuid not null references public.children (id) on delete cascade,
  target_type          app.rule_target not null,
  -- package_name (ex. com.exemple.jeu) ou slot de catégorie (game/social/…)
  target_value         text not null check (char_length(target_value) between 1 and 255),
  action               app.rule_action not null,
  -- Quota/jour en minutes quand action = 'limit' (A2/A3). Ignoré sinon.
  daily_limit_minutes  integer check (daily_limit_minutes is null or daily_limit_minutes >= 0),
  updated_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (child_id, target_type, target_value),
  check (action <> 'limit' or daily_limit_minutes is not null)
);
create index if not exists idx_app_rules_child on public.app_rules (child_id);
create index if not exists idx_app_rules_family on public.app_rules (family_id);
create trigger trg_app_rules_touch before update on public.app_rules
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- schedules — plannings RÉUTILISABLES (famille), assignables à plusieurs enfants
-- et fonctions (« plannings réutilisables entre fonctions », veille v2).
-- =============================================================================
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  kind        app.schedule_kind not null,
  created_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_schedules_family on public.schedules (family_id);
create trigger trg_schedules_touch before update on public.schedules
  for each row execute function app.touch_updated_at();

-- schedule_windows — fenêtres horaires d'un planning.
-- dow_mask : bitmask des jours (bit 0 = dimanche … bit 6 = samedi), 1..127.
-- start_minute/end_minute : minutes depuis minuit LOCAL (0..1440). Si
-- end_minute <= start_minute, la fenêtre franchit minuit (ex. 21:00→07:00) :
-- interprété côté moteur d'application (PolicyEngine).
create table if not exists public.schedule_windows (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.schedules (id) on delete cascade,
  dow_mask      smallint not null check (dow_mask between 1 and 127),
  start_minute  smallint not null check (start_minute between 0 and 1440),
  end_minute    smallint not null check (end_minute between 0 and 1440),
  created_at    timestamptz not null default now()
);
create index if not exists idx_schedule_windows_schedule on public.schedule_windows (schedule_id);

-- child_schedules — assignation d'un planning à un enfant (réutilisabilité).
create table if not exists public.child_schedules (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  child_id     uuid not null references public.children (id) on delete cascade,
  schedule_id  uuid not null references public.schedules (id) on delete cascade,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (child_id, schedule_id)
);
create index if not exists idx_child_schedules_child on public.child_schedules (child_id);

-- =============================================================================
-- Trigger d'audit : journalise tout changement de règle (transparence K3).
-- Les tables ciblées possèdent toutes family_id + child_id. SECURITY DEFINER
-- pour écrire dans audit_log malgré la RLS ; search_path figé.
-- =============================================================================
create or replace function app.log_rule_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_family uuid;
  v_child  uuid;
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_id     uuid;
begin
  if tg_op = 'DELETE' then
    v_family := old.family_id; v_child := old.child_id; v_id := old.id;
  else
    v_family := new.family_id; v_child := new.child_id; v_id := new.id;
  end if;

  select m.role::text into v_role
  from public.memberships m
  where m.family_id = v_family and m.user_id = v_uid
  limit 1;

  insert into public.audit_log (family_id, actor_id, actor_role, action,
                                subject_child_id, target_table, target_id, detail)
  values (v_family, v_uid, v_role,
          tg_table_name || '.' || lower(tg_op),
          v_child, tg_table_name, v_id, '{}'::jsonb);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function app.log_rule_change() from public, anon;

create trigger trg_access_policies_audit
  after insert or update or delete on public.access_policies
  for each row execute function app.log_rule_change();
create trigger trg_screen_time_limits_audit
  after insert or update or delete on public.screen_time_limits
  for each row execute function app.log_rule_change();
create trigger trg_app_rules_audit
  after insert or update or delete on public.app_rules
  for each row execute function app.log_rule_change();
create trigger trg_child_schedules_audit
  after insert or update or delete on public.child_schedules
  for each row execute function app.log_rule_change();

-- =============================================================================
-- Row Level Security
--   * parent/guardian/owner : R/W sur sa famille
--   * enfant : LECTURE de SES règles (transparence) ; aucune écriture
--   * cohérence family_id ↔ child_id vérifiée à l'écriture (comme L1)
-- =============================================================================
alter table public.access_policies    enable row level security;
alter table public.screen_time_limits enable row level security;
alter table public.app_rules          enable row level security;
alter table public.schedules          enable row level security;
alter table public.schedule_windows   enable row level security;
alter table public.child_schedules    enable row level security;

-- access_policies -------------------------------------------------------------
create policy access_policies_select on public.access_policies
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy access_policies_insert on public.access_policies
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy access_policies_update on public.access_policies
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy access_policies_delete on public.access_policies
  for delete to authenticated using (app.is_parent_of(family_id));

-- screen_time_limits ----------------------------------------------------------
create policy screen_time_limits_select on public.screen_time_limits
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy screen_time_limits_insert on public.screen_time_limits
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy screen_time_limits_update on public.screen_time_limits
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy screen_time_limits_delete on public.screen_time_limits
  for delete to authenticated using (app.is_parent_of(family_id));

-- app_rules -------------------------------------------------------------------
create policy app_rules_select on public.app_rules
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy app_rules_insert on public.app_rules
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy app_rules_update on public.app_rules
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy app_rules_delete on public.app_rules
  for delete to authenticated using (app.is_parent_of(family_id));

-- schedules -------------------------------------------------------------------
-- Lisible par tout membre (l'enfant voit les plannings de sa famille) ;
-- écriture réservée au parent.
create policy schedules_select on public.schedules
  for select to authenticated using (app.is_member_of(family_id));
create policy schedules_insert on public.schedules
  for insert to authenticated with check (app.is_parent_of(family_id));
create policy schedules_update on public.schedules
  for update to authenticated using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy schedules_delete on public.schedules
  for delete to authenticated using (app.is_parent_of(family_id));

-- schedule_windows ------------------------------------------------------------
-- Rattachées à un schedule ; droits hérités via la famille du schedule.
create policy schedule_windows_select on public.schedule_windows
  for select to authenticated using (
    exists (select 1 from public.schedules s
            where s.id = schedule_id and app.is_member_of(s.family_id))
  );
create policy schedule_windows_insert on public.schedule_windows
  for insert to authenticated with check (
    exists (select 1 from public.schedules s
            where s.id = schedule_id and app.is_parent_of(s.family_id))
  );
create policy schedule_windows_update on public.schedule_windows
  for update to authenticated using (
    exists (select 1 from public.schedules s
            where s.id = schedule_id and app.is_parent_of(s.family_id))
  ) with check (
    exists (select 1 from public.schedules s
            where s.id = schedule_id and app.is_parent_of(s.family_id))
  );
create policy schedule_windows_delete on public.schedule_windows
  for delete to authenticated using (
    exists (select 1 from public.schedules s
            where s.id = schedule_id and app.is_parent_of(s.family_id))
  );

-- child_schedules -------------------------------------------------------------
create policy child_schedules_select on public.child_schedules
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy child_schedules_insert on public.child_schedules
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and exists (select 1 from public.schedules s
                          where s.id = schedule_id and s.family_id = family_id));
create policy child_schedules_update on public.child_schedules
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id));
create policy child_schedules_delete on public.child_schedules
  for delete to authenticated using (app.is_parent_of(family_id));
