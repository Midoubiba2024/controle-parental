-- =============================================================================
-- LOT 4 — Filtrage réseau & contenu : politique de filtrage par enfant,
-- listes blanche/noire de domaines, journal des domaines (MÉTADONNÉES), et
-- état du filtrage reporté par l'appareil (anti-contournement transparent).
--
-- Principes (voir docs/02-CONFORMITE.md, docs/01-CAHIER-DES-CHARGES.md module C,
-- docs/04-LOTS.md §L4) :
--   * ADDITIF : aucune table/colonne/policy existante supprimée (pas de DROP).
--   * RLS sur 100 % des nouvelles tables ; helpers SECURITY DEFINER déjà en place
--     (app.is_parent_of / app.current_child_id / app.device_belongs_to_current_child),
--     search_path figé.
--   * LIGNE ROUGE anti-stalkerware : le filtrage est un SINKHOLE DNS LOCAL. On ne
--     stocke QUE des métadonnées de DOMAINES (nom + catégorie + action + heure) —
--     JAMAIS d'URL complète, de requête, ni de contenu. Aucun MITM, aucun
--     déchiffrement TLS (impossible et interdit). Rétention bornée (journal),
--     purge planifiée en L8.
--   * TRANSPARENCE : toute la politique est LISIBLE PAR L'ENFANT
--     (child_id = app.current_child_id()) et reflétée dans l'écran « mes données ».
--     L'état du VPN (filter_status) rend l'anti-contournement VISIBLE (C9).
--   * 112 / urgences & services essentiels : le filtrage ne porte que sur la
--     résolution DNS ; la liste blanche des domaines système/essentiels et la
--     non-entrave des urgences sont garanties CÔTÉ APP (DnsFilterEngine).
--   * LEÇON LOT 3 (isolation inter-enfants) : les SELECT scindés par enfant
--     utilisent `app.is_parent_of(family_id) or child_id = app.current_child_id()`,
--     JAMAIS `app.is_member_of(family_id)` seul (un compte enfant est membre →
--     fuite inter-enfants, y compris via Realtime). Dans toute sous-requête
--     corrélée, les colonnes sont QUALIFIÉES par le nom de la table de la policy.
-- =============================================================================

-- --- Types énumérés ----------------------------------------------------------
do $$ begin
  -- Catalogue de catégories de filtrage (C1/C7). Volontairement fermé et
  -- additif : une nouvelle catégorie s'ajoute via ALTER TYPE ADD VALUE (migration
  -- dédiée). adult = contenu explicite/adulte (C7, must).
  create type app.filter_category as enum (
    'adult', 'violence', 'gambling', 'drugs', 'weapons', 'hate',
    'dating', 'social', 'piracy', 'malware', 'ads_trackers'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Règle de liste explicite (C2) : 'allow' surclasse un blocage de catégorie ;
  -- 'block' interdit un domaine précis même hors catégorie.
  create type app.filter_rule_action as enum ('allow', 'block');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Niveau de restriction YouTube (C4) appliqué par réécriture DNS vers
  -- restrict(moderate).youtube.com. 'off' = pas de réécriture.
  create type app.youtube_mode as enum ('off', 'moderate', 'strict');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Action consignée dans le journal de domaines (métadonnées).
  --   blocked    : résolution bloquée (sinkhole) — catégorie ou liste noire
  --   allowed    : résolution autorisée (consignée seulement si journalisation
  --                exhaustive activée ; par défaut on ne journalise QUE les blocages)
  --   rewritten  : réécrite (SafeSearch / YouTube restreint)
  create type app.domain_event_action as enum ('blocked', 'allowed', 'rewritten');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- filter_policy — réglages de FILTRAGE par enfant (une ligne par enfant).
-- Autorité : le parent écrit ; l'enfant lit (transparence) ; l'appareil lit pour
-- appliquer. Privacy by default (art. 25) : filtrage ACTIVÉ et SafeSearch ON par
-- défaut (paramètre le plus protecteur).
-- =============================================================================
create table if not exists public.filter_policy (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  child_id            uuid not null unique references public.children (id) on delete cascade,
  -- Interrupteur général du filtrage DNS.
  enabled             boolean not null default true,
  -- Preset d'âge appliqué (C5) — repère d'aide à la décision, ajustable. Réutilise
  -- l'enum app.age_profile (young_child | preteen | teen).
  age_preset          app.age_profile not null default 'young_child',
  -- Catégories BLOQUÉES (C1/C7). adult est 'must' dans tous les presets.
  blocked_categories  app.filter_category[] not null default array['adult']::app.filter_category[],
  -- SafeSearch forcé Google/Bing/DuckDuckGo (C3) via réécriture DNS.
  safe_search         boolean not null default true,
  -- Mode restreint YouTube (C4).
  youtube_restriction app.youtube_mode not null default 'moderate',
  -- Liste blanche STRICTE (C5 jeune enfant) : seuls les domaines 'allow' (et la
  -- liste blanche système essentielle, garantie côté app) sont résolus ; tout le
  -- reste est bloqué. Graduation par âge : true pour le jeune enfant.
  whitelist_only      boolean not null default false,
  -- Ask-to-Browse (C6) : l'enfant peut demander l'accès à un domaine bloqué
  -- (requête kind 'browse', approbation parent → règle 'allow'). Co-régulation
  -- (pré)ado ; off pour le jeune enfant.
  ask_to_browse       boolean not null default false,
  -- Journalisation exhaustive : si true, on consigne AUSSI les résolutions
  -- autorisées (plus de visibilité, moins de minimisation). Par défaut false :
  -- on ne journalise QUE les blocages/réécritures (minimisation art. 5-1-c).
  log_allowed         boolean not null default false,
  -- Rétention du journal de domaines (jours). Purge auto planifiée en L8.
  retention_days      integer not null default 30 check (retention_days between 1 and 365),
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists idx_filter_policy_family on public.filter_policy (family_id);
create or replace trigger trg_filter_policy_touch before update on public.filter_policy
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- filter_rules — listes BLANCHE / NOIRE de domaines par enfant (C2).
-- domain : nom de domaine normalisé (minuscule, sans schéma ni chemin). La règle
-- s'applique au domaine ET à ses sous-domaines (logique côté app, suffix match).
-- =============================================================================
create table if not exists public.filter_rules (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  domain      text not null check (
                char_length(domain) between 1 and 253
                -- pas de schéma, d'espace, de slash ni de caractère majuscule :
                -- on stocke un hostname nu, normalisé en minuscules côté UI/app.
                and domain !~ '[[:space:]/]' and domain = lower(domain)),
  action      app.filter_rule_action not null,
  -- Origine informative (ex. 'ask_to_browse' quand créée par approbation C6).
  note        text check (note is null or char_length(note) <= 200),
  created_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (child_id, domain)
);
create index if not exists idx_filter_rules_child  on public.filter_rules (child_id);
create index if not exists idx_filter_rules_family on public.filter_rules (family_id);
create or replace trigger trg_filter_rules_touch before update on public.filter_rules
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- domain_events — JOURNAL de domaines (MÉTADONNÉES SEULEMENT), pour les rapports
-- parent (F4-F6). Alimenté par l'appareil enfant. JAMAIS d'URL complète, de
-- requête DNS brute ni de contenu : uniquement domaine + catégorie + action +
-- heure. Rétention bornée (filter_policy.retention_days, purge L8).
-- =============================================================================
create table if not exists public.domain_events (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  device_id   uuid not null references public.devices (id) on delete cascade,
  -- Domaine (hostname) concerné — métadonnée. Pas d'URL, pas de chemin.
  domain      text not null check (char_length(domain) between 1 and 253),
  -- Catégorie ayant motivé l'action (null si liste noire explicite / autre).
  category    app.filter_category,
  action      app.domain_event_action not null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_domain_events_child on public.domain_events (child_id, occurred_at desc);
create index if not exists idx_domain_events_family on public.domain_events (family_id, occurred_at desc);

-- =============================================================================
-- filter_status — ÉTAT du filtrage reporté par l'appareil (une ligne / appareil).
-- Rend l'ANTI-CONTOURNEMENT TRANSPARENT (C9) : le parent voit si le VPN de
-- filtrage est actif, et quand il a été désactivé en dernier. L'appareil met à
-- jour vpn_active + un heartbeat ; onRevoke() passe vpn_active à false (visible,
-- jamais en cachette — l'enfant est aussi informé côté app).
-- =============================================================================
create table if not exists public.filter_status (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  device_id      uuid not null unique references public.devices (id) on delete cascade,
  vpn_active     boolean not null default false,
  last_active_at timestamptz,
  last_revoked_at timestamptz,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_filter_status_child on public.filter_status (child_id);
create or replace trigger trg_filter_status_touch before update on public.filter_status
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- Audit (transparence K3) : tout changement de politique/règle de filtrage est
-- journalisé (trigger existant app.log_rule_change, tables à family_id+child_id).
-- Pas d'audit sur domain_events (journal volumineux) ni filter_status (heartbeat).
-- =============================================================================
create or replace trigger trg_filter_policy_audit
  after insert or update or delete on public.filter_policy
  for each row execute function app.log_rule_change();
create or replace trigger trg_filter_rules_audit
  after insert or update or delete on public.filter_rules
  for each row execute function app.log_rule_change();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.filter_policy enable row level security;
alter table public.filter_rules  enable row level security;
alter table public.domain_events enable row level security;
alter table public.filter_status enable row level security;

-- filter_policy ---------------------------------------------------------------
-- SELECT : parent (sa famille) + enfant (SA politique → transparence/application)
create policy filter_policy_select on public.filter_policy
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy filter_policy_insert on public.filter_policy
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy filter_policy_update on public.filter_policy
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy filter_policy_delete on public.filter_policy
  for delete to authenticated using (app.is_parent_of(family_id));

-- filter_rules ----------------------------------------------------------------
create policy filter_rules_select on public.filter_rules
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
create policy filter_rules_insert on public.filter_rules
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy filter_rules_update on public.filter_rules
  for update to authenticated
  using (app.is_parent_of(family_id))
  with check (app.is_parent_of(family_id)
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy filter_rules_delete on public.filter_rules
  for delete to authenticated using (app.is_parent_of(family_id));

-- domain_events ---------------------------------------------------------------
-- SELECT : parent + enfant lui-même (transparence, isolation inter-enfants).
create policy domain_events_select on public.domain_events
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
-- INSERT : l'appareil enfant journalise SES propres événements. La cohérence
-- family_id ↔ child_id et l'appartenance de l'appareil sont vérifiées ; colonnes
-- QUALIFIÉES par domain_events (sous-requête corrélée, piège de portée L3).
create policy domain_events_insert on public.domain_events
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = domain_events.child_id));
-- Pas d'UPDATE (journal append-only côté usage) ; DELETE réservé au parent
-- (droit à l'effacement RGPD exercé via la console ; purge auto en L8).
create policy domain_events_delete on public.domain_events
  for delete to authenticated using (app.is_parent_of(family_id));

-- filter_status ---------------------------------------------------------------
-- SELECT : parent + enfant lui-même.
create policy filter_status_select on public.filter_status
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());
-- INSERT/UPDATE : l'appareil enfant reporte SON état (heartbeat, vpn_active).
-- Il ne peut pas usurper un autre enfant/appareil ; colonnes qualifiées.
create policy filter_status_insert on public.filter_status
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and app.device_belongs_to_current_child(device_id)
              and family_id = (select c.family_id from public.children c where c.id = filter_status.child_id));
create policy filter_status_update on public.filter_status
  for update to authenticated
  using (child_id = app.current_child_id() or app.is_parent_of(family_id))
  -- La branche ENFANT impose family_id ↔ child_id (comme l'INSERT) : un compte
  -- enfant ne peut pas re-parenter sa ligne d'état (anti-usurpation inter-familles
  -- + ne peut masquer la désactivation du VPN à son parent — ligne rouge C9).
  -- Colonne qualifiée par filter_status (piège de portée, leçon L3).
  with check ((child_id = app.current_child_id()
               and app.device_belongs_to_current_child(device_id)
               and family_id = (select c.family_id from public.children c where c.id = filter_status.child_id))
              or app.is_parent_of(family_id));
