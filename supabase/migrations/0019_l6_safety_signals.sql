-- =============================================================================
-- LOT 6 — Bien-être & sécurité avancée (profil ADO, transparent).
--
-- Détection de risque STRICTEMENT ON-DEVICE : le texte des notifications/messages
-- est analysé SUR LE TÉLÉPHONE (moteur Kotlin pur) et NE QUITTE JAMAIS l'appareil.
-- Seule une ALERTE DE MÉTADONNÉES remonte : catégorie de risque, gravité,
-- application source, horodatage, éventuellement un compteur. JAMAIS le texte
-- déclencheur, jamais d'extrait, jamais de capture.
--
-- 🔴 LIGNE ROUGE (critère d'acceptation n°1) — voir docs/02-CONFORMITE.md §G,
-- docs/11-LOT6-BIEN-ETRE.md :
--   * AUCUNE colonne de contenu/texte/extrait dans safety_signals (ni ailleurs).
--     Le schéma ci-dessous est volontairement incapable de stocker un contenu.
--   * Fonction réservée au profil preteen/teen (gradation par âge) ; totalement
--     OFF pour young_child (ni service, ni demande de permission côté app).
--   * Transparence (K2/K6) : toute la config et l'état sont LISIBLES PAR L'ENFANT
--     (child_id = app.current_child_id()) et reflétés dans « mes données ».
--   * Pause de confidentialité NON silencieuse (K8) : l'ado suspend l'analyse,
--     mais le parent VOIT qu'une pause est active (jamais ce qui est masqué).
--
-- Principes de migration (comme L3/L4/L5) :
--   * ADDITIF : aucun DROP ; CREATE ... IF NOT EXISTS ; types/policies/triggers
--     enveloppés (idempotents, ré-exécutables).
--   * RLS sur 100 % des nouvelles tables ; helpers SECURITY DEFINER déjà en place
--     (app.is_parent_of / app.current_child_id / app.device_belongs_to_current_child).
--   * LEÇON L3 (isolation inter-enfants) : SELECT scindé par enfant via
--     `app.is_parent_of(family_id) or child_id = app.current_child_id()`, JAMAIS
--     `app.is_member_of(family_id)` seul (un compte enfant est membre → fuite
--     inter-enfants, y compris via Realtime). Dans toute sous-requête corrélée, les
--     colonnes sont QUALIFIÉES par le nom de la table de la policy (piège de portée).
--   * LEÇON L5 (restriction d'UPDATE) : un UPDATE ne doit pas laisser réécrire des
--     colonnes non prévues → triggers garde-fous (comme app.sos_guard_child_update).
-- =============================================================================

-- --- Types énumérés ----------------------------------------------------------
do $$ begin
  -- Catégorie de RISQUE détectée on-device (G1/G4). Fermé et additif : une
  -- nouvelle catégorie s'ajoute via ALTER TYPE ADD VALUE (migration dédiée).
  --   harassment      : cyberharcèlement (insultes répétées, menaces, exclusion)
  --   grooming        : motif de contact adulte inconnu / sollicitation (G4)
  --   sexual_content  : contenu à caractère sexuel / sollicitation de photos
  --   self_harm       : mal-être, auto-agression, idées suicidaires
  --   drugs           : drogues / substances
  -- NB : l'enum ne nomme QUE des catégories — aucune donnée de contenu.
  create type app.safety_category as enum (
    'harassment', 'grooming', 'sexual_content', 'self_harm', 'drugs'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Gravité du signal (gradation de l'alerte, pas du contenu).
  create type app.safety_severity as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- safety_signals — ALERTE DE MÉTADONNÉES remontée par l'appareil (G1/G4/G6).
--
-- 🔴 AUCUNE COLONNE DE CONTENU. On ne stocke QUE : catégorie, gravité, app source
-- (nom de paquet/libellé — métadonnée), horodatage, et un compteur d'occurrences.
-- Le texte analysé reste sur l'appareil et est détruit après analyse. Toute
-- tentative future d'ajouter une colonne de texte/extrait doit être refusée en
-- revue (ligne rouge).
-- =============================================================================
create table if not exists public.safety_signals (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  child_id         uuid not null references public.children (id) on delete cascade,
  device_id        uuid not null references public.devices (id)  on delete cascade,
  category         app.safety_category not null,
  severity         app.safety_severity not null,
  -- Application source : nom de paquet (ex. com.whatsapp) ou libellé lisible.
  -- MÉTADONNÉE uniquement — jamais le contenu de la notification.
  source_app       text check (source_app is null or char_length(source_app) between 1 and 200),
  -- Compteur d'occurrences agrégées dans le même signal (ex. plusieurs mots-clés
  -- d'une même catégorie dans une même notification). Pas de contenu, juste un nombre.
  occurrence_count smallint not null default 1 check (occurrence_count between 1 and 100),
  occurred_at      timestamptz not null default now(),
  -- Acquittement par le parent (il a vu/traité l'alerte) — action parent, pas enfant.
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.safety_signals is
  'LOT6 : alertes de métadonnées de risque détecté ON-DEVICE. AUCUN contenu/texte/extrait — ligne rouge anti-stalkerware (docs/11-LOT6-BIEN-ETRE.md).';
create index if not exists idx_safety_signals_child  on public.safety_signals (child_id, occurred_at desc);
create index if not exists idx_safety_signals_family on public.safety_signals (family_id, occurred_at desc);
create index if not exists idx_safety_signals_cat    on public.safety_signals (family_id, category, occurred_at desc);

-- =============================================================================
-- safety_settings — config « mode ado » PAR ENFANT (une ligne / enfant).
-- Autorité : le parent écrit ; l'enfant lit (transparence). Privacy by default
-- (art. 25) : analyse DÉSACTIVÉE par défaut (option intrusive off). Activée sur
-- co-consentement (parent + assentiment ado), et uniquement pour preteen/teen.
-- =============================================================================
create table if not exists public.safety_settings (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  child_id          uuid not null unique references public.children (id) on delete cascade,
  -- Interrupteur de l'analyse on-device des notifications (G1). OFF par défaut.
  -- La graduation par âge (young_child = OFF) est appliquée CÔTÉ APP ET CONSOLE :
  -- on n'active jamais cette option pour un profil young_child.
  analysis_enabled  boolean not null default false,
  -- Mode ado (K6) : visibilité mutuelle — l'ado voit ce que le parent voit.
  mutual_visibility boolean not null default true,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists idx_safety_settings_family on public.safety_settings (family_id);
create or replace trigger trg_safety_settings_touch before update on public.safety_settings
  for each row execute function app.touch_updated_at();
-- Transparence/audit (K3) : tout changement de config est journalisé (visible enfant).
create or replace trigger trg_safety_settings_audit
  after insert or update or delete on public.safety_settings
  for each row execute function app.log_rule_change();

-- =============================================================================
-- safety_status — ÉTAT de l'analyse reporté par l'APPAREIL (une ligne / appareil).
-- Rend TRANSPARENT le fait que l'analyse tourne ou non (mirroir de filter_status) :
-- le parent voit si l'analyse est active, et quand elle a été désactivée en dernier
-- (ex. l'ado a révoqué l'accès aux notifications — c'est SON droit, et ça reste
-- visible, jamais en cachette). Reporté par le service de notification on-device.
-- =============================================================================
create table if not exists public.safety_status (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  child_id          uuid not null references public.children (id) on delete cascade,
  device_id         uuid not null unique references public.devices (id) on delete cascade,
  -- true = NotificationListenerService lié ET analyse en cours ; false = accès
  -- non accordé / révoqué par l'ado / pause de confidentialité active.
  analysis_active   boolean not null default false,
  last_active_at    timestamptz,
  last_revoked_at   timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists idx_safety_status_child on public.safety_status (child_id);
create or replace trigger trg_safety_status_touch before update on public.safety_status
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- privacy_pauses — PAUSE DE CONFIDENTIALITÉ demandée par l'ado (K8), NON silencieuse.
-- L'ado suspend l'analyse/le partage ; le PARENT VOIT qu'une pause est active
-- (ligne active = ended_at null et (expires_at null ou > now())), mais JAMAIS ce
-- qui est masqué. Aucune raison/contenu stocké — uniquement des métadonnées de
-- durée. C'est l'ADO qui ouvre et ferme sa pause ; le parent ne peut pas la lever.
-- =============================================================================
create table if not exists public.privacy_pauses (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  device_id   uuid not null references public.devices (id)  on delete cascade,
  started_at  timestamptz not null default now(),
  -- Fin programmée (pause bornée) ; null = jusqu'à clôture manuelle par l'ado.
  expires_at  timestamptz,
  -- Clôture effective (l'ado a repris le partage) ; null = pause encore active.
  ended_at    timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (expires_at is null or expires_at > started_at),
  check (ended_at is null or ended_at >= started_at)
);
comment on table public.privacy_pauses is
  'LOT6/K8 : pause de confidentialité de l''ado, NON silencieuse (le parent voit la pause active, jamais le contenu masqué). Métadonnées de durée uniquement.';
create index if not exists idx_privacy_pauses_child  on public.privacy_pauses (child_id, started_at desc);
create index if not exists idx_privacy_pauses_family on public.privacy_pauses (family_id, started_at desc);
-- Au plus UNE pause ouverte par appareil (ended_at null) — index partiel unique.
create unique index if not exists uq_privacy_pauses_open
  on public.privacy_pauses (device_id) where ended_at is null;

-- =============================================================================
-- Garde-fous d'UPDATE (leçon L5 : restreindre les colonnes modifiables).
-- =============================================================================

-- safety_signals : seul le PARENT peut UPDATE, et UNIQUEMENT pour acquitter.
-- Les faits reportés par l'appareil (catégorie, gravité, app, compteur, identité)
-- sont IMMUABLES — personne ne les réécrit. Préserve l'intégrité des métadonnées.
create or replace function app.safety_signals_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.family_id <> old.family_id
     or new.child_id <> old.child_id
     or new.device_id <> old.device_id
     or new.category <> old.category
     or new.severity <> old.severity
     or new.source_app is distinct from old.source_app
     or new.occurrence_count <> old.occurrence_count
     or new.occurred_at <> old.occurred_at
     or new.created_at <> old.created_at then
    raise exception 'safety_signals : seul l''acquittement (acknowledged_*) est modifiable';
  end if;
  return new;
end $$;
revoke execute on function app.safety_signals_guard_update() from public, anon;
create or replace trigger trg_safety_signals_guard_update
  before update on public.safety_signals
  for each row execute function app.safety_signals_guard_update();

-- privacy_pauses : l'ADO (compte enfant) ne peut que CLORE sa pause (estamper
-- ended_at). Identité et dates d'ouverture immuables ; il ne peut pas rouvrir une
-- pause close ni la re-parenter. Le parent n'a aucun UPDATE (il ne lève pas la
-- pause — K8 : c'est le droit de l'ado). Même esprit que app.sos_guard_child_update.
create or replace function app.privacy_pauses_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.family_id <> old.family_id
     or new.child_id <> old.child_id
     or new.device_id <> old.device_id
     or new.started_at <> old.started_at
     or new.expires_at is distinct from old.expires_at
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'privacy_pauses : seule la clôture (ended_at) est permise';
  end if;
  if old.ended_at is not null then
    raise exception 'privacy_pauses : une pause close ne peut pas être rouverte';
  end if;
  return new;
end $$;
revoke execute on function app.privacy_pauses_guard_child_update() from public, anon;
create or replace trigger trg_privacy_pauses_guard_child_update
  before update on public.privacy_pauses
  for each row execute function app.privacy_pauses_guard_child_update();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.safety_signals  enable row level security;
alter table public.safety_settings enable row level security;
alter table public.safety_status   enable row level security;
alter table public.privacy_pauses  enable row level security;

-- safety_signals --------------------------------------------------------------
-- SELECT : parent + l'enfant concerné (transparence, isolation inter-enfants).
do $$ begin
  create policy safety_signals_select on public.safety_signals
    for select to authenticated
    using (app.is_parent_of(family_id) or child_id = app.current_child_id());
exception when duplicate_object then null; end $$;
-- INSERT : l'appareil enfant émet SES propres signaux. Cohérence family_id↔child_id
-- + appartenance appareil ; colonnes QUALIFIÉES par safety_signals (piège de portée).
-- L'appareil ne peut pas auto-acquitter (acknowledged_* forcés à null).
do $$ begin
  create policy safety_signals_insert on public.safety_signals
    for insert to authenticated
    with check (child_id = app.current_child_id()
                and app.device_belongs_to_current_child(device_id)
                and family_id = (select c.family_id from public.children c where c.id = safety_signals.child_id)
                and acknowledged_at is null and acknowledged_by is null);
exception when duplicate_object then null; end $$;
-- UPDATE : parent uniquement (acquittement, borné par le trigger garde-fou).
do $$ begin
  create policy safety_signals_update on public.safety_signals
    for update to authenticated
    using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
exception when duplicate_object then null; end $$;
-- DELETE : parent uniquement (droit à l'effacement RGPD ; purge auto en L8).
do $$ begin
  create policy safety_signals_delete on public.safety_signals
    for delete to authenticated using (app.is_parent_of(family_id));
exception when duplicate_object then null; end $$;

-- safety_settings -------------------------------------------------------------
-- SELECT : parent + l'enfant concerné (il voit SA config — transparence K2/K6).
do $$ begin
  create policy safety_settings_select on public.safety_settings
    for select to authenticated
    using (app.is_parent_of(family_id) or child_id = app.current_child_id());
exception when duplicate_object then null; end $$;
-- INSERT/UPDATE/DELETE : parent uniquement (family_id↔child_id validé).
do $$ begin
  create policy safety_settings_insert on public.safety_settings
    for insert to authenticated
    with check (app.is_parent_of(family_id)
                and family_id = (select c.family_id from public.children c where c.id = safety_settings.child_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy safety_settings_update on public.safety_settings
    for update to authenticated
    using (app.is_parent_of(family_id))
    with check (app.is_parent_of(family_id)
                and family_id = (select c.family_id from public.children c where c.id = safety_settings.child_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy safety_settings_delete on public.safety_settings
    for delete to authenticated using (app.is_parent_of(family_id));
exception when duplicate_object then null; end $$;

-- safety_status ---------------------------------------------------------------
-- SELECT : parent + l'enfant concerné. INSERT/UPDATE : l'appareil enfant reporte
-- SON état (mirroir de filter_status). Un compte enfant ne peut pas usurper un
-- autre enfant/appareil ; branche enfant impose family_id↔child_id (anti-usurpation
-- ET il ne peut masquer l'arrêt de l'analyse à son parent). Colonnes QUALIFIÉES.
do $$ begin
  create policy safety_status_select on public.safety_status
    for select to authenticated
    using (app.is_parent_of(family_id) or child_id = app.current_child_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy safety_status_insert on public.safety_status
    for insert to authenticated
    with check (child_id = app.current_child_id()
                and app.device_belongs_to_current_child(device_id)
                and family_id = (select c.family_id from public.children c where c.id = safety_status.child_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy safety_status_update on public.safety_status
    for update to authenticated
    using (child_id = app.current_child_id() or app.is_parent_of(family_id))
    with check ((child_id = app.current_child_id()
                 and app.device_belongs_to_current_child(device_id)
                 and family_id = (select c.family_id from public.children c where c.id = safety_status.child_id))
                or app.is_parent_of(family_id));
exception when duplicate_object then null; end $$;

-- privacy_pauses --------------------------------------------------------------
-- SELECT : parent + l'enfant concerné (NON silencieuse : le parent voit la pause).
do $$ begin
  create policy privacy_pauses_select on public.privacy_pauses
    for select to authenticated
    using (app.is_parent_of(family_id) or child_id = app.current_child_id());
exception when duplicate_object then null; end $$;
-- INSERT : l'ADO ouvre SA pause, pour SON appareil. Cohérence family_id↔child_id ;
-- colonnes QUALIFIÉES. Ouverture = pause non close (ended_at null).
do $$ begin
  create policy privacy_pauses_insert on public.privacy_pauses
    for insert to authenticated
    with check (child_id = app.current_child_id()
                and app.device_belongs_to_current_child(device_id)
                and family_id = (select c.family_id from public.children c where c.id = privacy_pauses.child_id)
                and ended_at is null
                and (created_by is null or created_by = (select auth.uid())));
exception when duplicate_object then null; end $$;
-- UPDATE : l'ADO uniquement (clôture, bornée par le trigger). Le parent ne peut
-- pas lever la pause (K8). Pas de DELETE via RLS (purge L8 service_role).
do $$ begin
  create policy privacy_pauses_update_child on public.privacy_pauses
    for update to authenticated
    using (child_id = app.current_child_id())
    with check (child_id = app.current_child_id());
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Realtime : réactivité des alertes (le parent voit arriver un signal / une pause
-- en direct). La RLS ci-dessus s'applique AUSSI au flux Realtime (Authorization) :
-- chaque abonné ne reçoit que les lignes de SA famille. ADD TABLE idempotent.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['safety_signals', 'safety_status', 'privacy_pauses']
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
    raise notice 'publication supabase_realtime absente — Realtime non activé';
end $$;
