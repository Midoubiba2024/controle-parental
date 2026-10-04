-- =============================================================================
-- LOT 12 — Appairage de l'appareil enfant via RPC SECURITY DEFINER + session
-- ANONYME Supabase (remplace l'Edge Function `pairing-complete`).
--
-- POURQUOI : `pairing-complete` reposait sur la clé service_role (createUser admin,
-- updateUserById, signInWithPassword) qui n'est plus disponible de façon fiable
-- dans les Edge Functions (nouveau système de clés API) → l'appairage échouait.
-- Même démarche que 0027 (create_family) et 0028 (pairing_start).
--
-- NOUVEAU PARCOURS (aucun secret, ni côté serveur ni côté appareil) :
--   1. L'appareil ouvre une session ANONYME Supabase (POST /auth/v1/signup sans
--      e-mail ; « Anonymous sign-ins » à activer dans le tableau de bord). Il obtient
--      un vrai utilisateur auth (claim is_anonymous = true) + un refresh token.
--   2. Avec ce jeton, il appelle supabase.rpc('pairing_complete',
--      { p_code: '7KQ2M-X9D4F', p_device: { platform, model, os_version, label,
--        public_key } }).
--      CODE D'APPAIRAGE (LOT 12) : 10 caractères de l'alphabet base32 de Crockford
--      (0-9 A-Z sans I, L, O, U : 32^10 ≈ 1,1·10^15 combinaisons), tirés d'une
--      source CSPRNG par pairing_start, affichés en 2 groupes de 5 (« 7KQ2M-X9D4F »).
--      Saisie tolérante (app.pairing_code_normalize) : majuscules, espaces et
--      tirets retirés, O→0, I/L→1. Le hash porte sur la forme NORMALISÉE, la même
--      dans pairing_start et pairing_complete.
--   3. La RPC relie l'utilisateur anonyme à UNE ligne devices (nouvelle colonne
--      devices.auth_user_id) et lui donne l'appartenance 'child' à la famille.
--      app.current_child_id() reconnaît désormais l'appareil → toute la RLS
--      « côté enfant » existante s'applique telle quelle.
--
-- CONSÉQUENCES :
--   * PLUSIEURS appareils par enfant (un utilisateur anonyme par appareil).
--   * RÉVOCATION (devices.revoked_at) = coupure IMMÉDIATE de l'accès (vérifiée en
--     base à chaque requête, indépendamment du JWT encore valide), appartenance
--     'child' supprimée par trigger, révocation définitive (pas de « dé-révocation »).
--   * Un utilisateur ANONYME ne peut JAMAIS agir comme parent (create_family,
--     pairing_start, helpers RLS is_parent_of/is_owner_of, rôles parent refusés).
--
-- ERREURS MÉTIER de pairing_complete : RENVOYÉES (jamais levées) sous la forme
-- { "error": "<code>" } afin que la tentative ratée soit ENREGISTRÉE (une exception
-- annulerait la transaction, donc le compteur anti force brute). Codes stables :
--   not_authenticated, anonymous_session_required, parent_account_forbidden,
--   device_already_paired,
--   too_many_attempts (+ retry_after_seconds), invalid_code_format, invalid_device,
--   code_not_found, code_already_used, code_expired.
-- Succès : { device_id, family_id, child_id, mode }.
--
-- CORRECTIFS RGPD PRÉEXISTANTS (révélés par le banc de test supabase/tests) :
--   §10 rgpd_delete_child / rgpd_delete_family échouaient dès qu'une règle existait
--       (app.log_rule_change journalisait vers un enfant déjà supprimé → FK) ;
--   §11 supprimer un compte auth échouait dès qu'il était auteur d'audit, de message
--       ou de pause (garde-fous d'immutabilité refusant ON DELETE SET NULL) ;
--   §12 idem pour l'auteur d'une commande / le parent ayant acquitté un SOS ;
--   §13 rétention : app.pairing_attempts purgé par app.run_data_retention.
--
-- DURCISSEMENTS (revue de sécurité adversariale du LOT 12) :
--   * children.user_id n'est plus modifiable côté client (4c) et ne suffit plus
--     à désigner un enfant : appareil d'abord, héritage seulement avec
--     l'appartenance 'child' (current_child_id, hook, device_belongs_…) ;
--   * anti force brute : code de 10 caractères base32 Crockford (≈ 1,1·10^15
--     combinaisons, au lieu de 10^8 pour 8 chiffres) ; plafond global réservé aux
--     appelants ayant déjà raté un code, format invalide hors compteur global,
--     validation avant verrou, verrou par utilisateur + lock_timeout ; limite
--     d'inscriptions anonymes par IP (SETUP.md). PAS de CAPTCHA (service tiers,
--     enjeu RGPD, intégration lourde dans l'appli) : la longueur du code suffit ;
--   * pairing_complete EXIGE une session anonyme (claim JWT is_anonymous ET
--     auth.users.is_anonymous) → sinon 'anonymous_session_required' ;
--   * pepper en table (rotation sans casser les codes en cours) ;
--   * un seul code actif par enfant, 5 par famille ;
--   * rejeu idempotent de pairing_complete ; appareil dont le compte auth est
--     supprimé → marqué révoqué ; caractères bidi/largeur nulle retirés.
--
-- LIGNES ROUGES : aucune collecte nouvelle (les champs appareil sont ceux que
-- l'Edge Function stockait déjà) ; le journal anti force brute ne contient que
-- (utilisateur, horodatage, résultat), purgé au bout de 24 h ; aucun secret commité ;
-- transparence inchangée (audit 'device.enrolled' comme avant, + 'device.revoked').
--
-- ADDITIF, IDEMPOTENT, ré-exécutable (create or replace, if not exists, do $$ …
-- exception when duplicate_object). Aucune migration existante modifiée.
-- =============================================================================


-- =============================================================================
-- 1) SCHÉMA : lien appareil ↔ utilisateur auth (anonyme), index de recherche du
--    code, journal des tentatives d'appairage.
-- =============================================================================

-- devices.auth_user_id : le compte auth (anonyme) de CET appareil. Unique quand
-- renseigné (un utilisateur = un appareil). ON DELETE SET NULL : la purge d'un
-- utilisateur anonyme orphelin conserve l'historique de l'appareil (révoqué).
alter table public.devices
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists uq_devices_auth_user
  on public.devices (auth_user_id) where auth_user_id is not null;

comment on column public.devices.auth_user_id is
  'LOT12 : utilisateur auth (session anonyme) de cet appareil, posé UNIQUEMENT par public.pairing_complete. Accès coupé dès que revoked_at est renseigné.';

-- Recherche du code par hash (pairing_complete) : évite un seq scan sous verrou.
create index if not exists idx_pairing_codes_hash on public.pairing_codes (code_hash);

-- Journal anti force brute. Schéma `app` (NON exposé par PostgREST), RLS activée
-- SANS policy et aucun privilège client : seul pairing_complete (SECURITY DEFINER)
-- y lit/écrit. Minimisation : ni code, ni IP, ni appareil ; purge à 24 h.
create table if not exists app.pairing_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  succeeded     boolean not null,
  attempted_at  timestamptz not null default now()
);
create index if not exists idx_pairing_attempts_user on app.pairing_attempts (user_id, attempted_at desc);
create index if not exists idx_pairing_attempts_time on app.pairing_attempts (attempted_at desc);
alter table app.pairing_attempts enable row level security;
revoke all on table app.pairing_attempts from public, anon, authenticated;

-- counts_global : l'échec teste-t-il un CODE (code_not_found / déjà utilisé /
-- expiré) ? Les échecs « sans essai de code » (format invalide, description
-- d'appareil invalide) ne comptent QUE pour la limite par utilisateur : ils ne
-- doivent pas pouvoir remplir le compteur global (revue L12 #2/#3).
alter table app.pairing_attempts
  add column if not exists counts_global boolean not null default true;
create index if not exists idx_pairing_attempts_global
  on app.pairing_attempts (attempted_at desc) where not succeeded and counts_global;

comment on table app.pairing_attempts is
  'LOT12 : tentatives d''appairage (anti force brute, fenêtre glissante). Utilisateur + horodatage + résultat (+ « essai de code » oui/non) uniquement ; purge à 24 h (app.run_data_retention + purge paresseuse).';

-- Pepper des codes d'appairage : stocké dans une table du schéma `app` (aucun
-- privilège client, RLS sans policy), lu par pairing_start ET pairing_complete
-- (SECURITY DEFINER). Remplace la GUC de session `app.pairing_pepper` (0028) :
-- ALTER DATABASE SET ne touchait que les NOUVELLES connexions, d'où des hachages
-- divergents entre connexions PostgREST anciennes/nouvelles (revue L12 #6).
-- Rotation : app.rotate_pairing_pepper() conserve l'ancien pepper pendant la
-- durée de vie d'un code (10 min) → les codes en cours restent valides.
-- Initialisation : pepper ALÉATOIRE généré EN BASE (jamais commité) ;
-- previous_pepper = NULL. Aucune compatibilité avec les codes émis par 0028
-- avant la migration : ces codes à 8 chiffres sont refusés par le contrôle de
-- format (invalid_code_format, 10 caractères Crockford) avant tout hachage ;
-- le parent en régénère un (cf. SETUP.md). previous_pepper ne sert qu'aux
-- rotations ultérieures (app.rotate_pairing_pepper).
create table if not exists app.pairing_pepper (
  id               smallint primary key default 1 check (id = 1),
  current_pepper   text not null,
  previous_pepper  text,
  rotated_at       timestamptz not null default now()
);
alter table app.pairing_pepper enable row level security;
revoke all on table app.pairing_pepper from public, anon, authenticated;
insert into app.pairing_pepper (id, current_pepper, previous_pepper, rotated_at)
values (1, encode(extensions.gen_random_bytes(32), 'hex'), null, now())
on conflict (id) do nothing;

comment on table app.pairing_pepper is
  'LOT12 : pepper des codes d''appairage (une ligne). Aucun accès client. Rotation : select app.rotate_pairing_pepper(); (ancien pepper accepté 10 min).';


-- =============================================================================
-- 2) HELPERS RLS : reconnaître un APPAREIL (et l'oublier dès sa révocation).
-- =============================================================================

-- Appelant anonyme ? Lit le claim JWT (rapide, utilisable par ligne en RLS).
-- La garantie « en dur » est portée par le trigger memberships (auth.users).
create or replace function app.jwt_is_anonymous()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;
revoke execute on function app.jwt_is_anonymous() from public, anon;
grant  execute on function app.jwt_is_anonymous() to authenticated;

-- Profil enfant du compte courant, dans cet ORDRE (revue L12 #1) :
--   1. LOT12 : appareil appairé NON révoqué (devices.auth_user_id) — prioritaire,
--      car posé uniquement par pairing_complete ;
--   2. héritage : compte enfant lié par children.user_id, accepté SEULEMENT si
--      l'appartenance (famille de l'enfant, compte, 'child') existe aussi — elle
--      ne naît que de l'appairage (trigger 4b) — et si le compte n'est lié à
--      AUCUN appareil (même révoqué). children.user_id seul ne prouve rien : avant
--      ce lot, tout parent pouvait le poser sur n'importe quel uid (cf. trigger 4c).
create or replace function app.current_child_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select d.child_id from public.devices d
      where d.auth_user_id = (select auth.uid())
        and d.revoked_at is null
      limit 1),
    (select c.id from public.children c
      where c.user_id = (select auth.uid())
        and exists (select 1 from public.memberships m
                    where m.family_id = c.family_id
                      and m.user_id = c.user_id
                      and m.role = 'child')
        and not exists (select 1 from public.devices d
                        where d.auth_user_id = (select auth.uid()))
      limit 1)
  );
$$;

-- L'appareil p_device est-il utilisable par le compte courant ? Toujours un
-- appareil NON révoqué de l'enfant courant (d.child_id = current_child_id()), et :
--   * appareil anonyme : UNIQUEMENT sa propre ligne (pas celle d'un autre
--     appareil du même enfant) ;
--   * héritage (children.user_id) : appareils non révoqués « historiques » (sans
--     auth_user_id) de son enfant — jamais la ligne d'un appareil anonyme.
create or replace function app.device_belongs_to_current_child(p_device uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.devices d
    where d.id = p_device
      and d.revoked_at is null
      and d.child_id = app.current_child_id()
      and (
        d.auth_user_id = (select auth.uid())
        or (d.auth_user_id is null
            and exists (select 1 from public.children c
                        where c.id = d.child_id and c.user_id = (select auth.uid())))
      )
  );
$$;

-- Appartenance : ceinture et bretelles — une appartenance 'child' dont le compte
-- est lié à un appareil RÉVOQUÉ ne compte plus (même si le trigger de nettoyage
-- n'était pas passé).
create or replace function app.is_member_of(p_family uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.family_id = p_family
      and m.user_id = (select auth.uid())
      and (m.role <> 'child'
           or not exists (select 1 from public.devices d
                          where d.auth_user_id = m.user_id
                            and d.revoked_at is not null))
  );
$$;

-- Autorité parentale : JAMAIS pour une session anonyme.
create or replace function app.is_parent_of(p_family uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not app.jwt_is_anonymous()
     and exists (
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
  select not app.jwt_is_anonymous()
     and exists (
       select 1 from public.memberships m
       where m.family_id = p_family
         and m.user_id = (select auth.uid())
         and m.role = 'owner'
     );
$$;

-- Droits inchangés (create or replace conserve les GRANT ; rappel idempotent).
revoke execute on function app.current_child_id()                    from public, anon;
revoke execute on function app.device_belongs_to_current_child(uuid) from public, anon;
revoke execute on function app.is_member_of(uuid)                    from public, anon;
revoke execute on function app.is_parent_of(uuid)                    from public, anon;
revoke execute on function app.is_owner_of(uuid)                     from public, anon;
grant  execute on function app.current_child_id()                    to authenticated;
grant  execute on function app.device_belongs_to_current_child(uuid) to authenticated;
grant  execute on function app.is_member_of(uuid)                    to authenticated;
grant  execute on function app.is_parent_of(uuid)                    to authenticated;
grant  execute on function app.is_owner_of(uuid)                     to authenticated;


-- =============================================================================
-- 3) app.audit : l'appelant authentifié doit être MEMBRE de la famille visée.
--    Avant : tout `authenticated` (donc toute session anonyme) pouvait, si le
--    schéma app était joignable, forger une entrée d'audit dans N'IMPORTE quelle
--    famille. Tous les appelants légitimes (create_family, pairing_start,
--    export/rgpd_delete_child, pairing_complete, trigger de révocation) sont
--    membres au moment de l'appel. auth.uid() nul (cron, service) : inchangé.
-- =============================================================================
create or replace function app.audit(
  p_family uuid, p_action text, p_subject_child uuid default null,
  p_target_table text default null, p_target_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role text;
begin
  select m.role::text into v_role
  from public.memberships m
  where m.family_id = p_family and m.user_id = v_uid
  limit 1;

  if v_uid is not null and v_role is null then
    raise exception 'audit_forbidden' using errcode = '42501';
  end if;

  insert into public.audit_log (family_id, actor_id, actor_role, action,
                                subject_child_id, target_table, target_id, detail)
  values (p_family, v_uid, v_role, p_action,
          p_subject_child, p_target_table, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke execute on function app.audit(uuid, text, uuid, text, uuid, jsonb) from public, anon;
grant  execute on function app.audit(uuid, text, uuid, text, uuid, jsonb) to authenticated;


-- =============================================================================
-- 4) GARDE-FOUS memberships : un compte anonyme / un appareil ne devient jamais
--    parent ; les appartenances 'child' ne se créent QUE par pairing_complete.
-- =============================================================================

-- 4a) (SECURITY DEFINER : lit auth.users) rôle parent/owner/guardian interdit à un
--     utilisateur anonyme, à un compte lié à un appareil ou à un profil enfant.
create or replace function app.memberships_guard_parent_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role in ('owner', 'parent', 'guardian') then
    if exists (select 1 from auth.users u where u.id = new.user_id and u.is_anonymous) then
      raise exception 'memberships : un compte anonyme ne peut pas avoir le rôle %', new.role
        using errcode = '42501';
    end if;
    -- Compte enfant = lié à un appareil, ou titulaire d'une appartenance 'child'
    -- (héritage). children.user_id SEUL ne suffit pas : il ne doit pas permettre
    -- de bloquer un parent en posant son uid sur un enfant (revue L12 #1).
    if exists (select 1 from public.devices d where d.auth_user_id = new.user_id)
       or exists (select 1 from public.memberships m
                  where m.user_id = new.user_id and m.role = 'child') then
      raise exception 'memberships : un compte enfant/appareil ne peut pas avoir le rôle %', new.role
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function app.memberships_guard_parent_role() from public, anon, authenticated;

do $$ begin
  create trigger trg_memberships_guard_parent_role
    before insert or update on public.memberships
    for each row execute function app.memberships_guard_parent_role();
exception when duplicate_object then null; end $$;

-- 4b) (SECURITY INVOKER : lit current_user) un CLIENT (rôles authenticated/anon)
--     ne crée ni ne modifie d'appartenance 'child' : elle naît de pairing_complete
--     (SECURITY DEFINER → current_user = propriétaire) et meurt avec l'appareil.
--     Empêche un parent de rattacher un compte arbitraire (ex. la session anonyme
--     d'un autre foyer) comme « enfant », ou de promouvoir un appareil.
create or replace function app.memberships_guard_child_role()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.role = 'child' then
      raise exception 'memberships : une appartenance enfant ne se crée que par l''appairage'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (old.role = 'child' or new.role = 'child')
       and (new.role, new.user_id, new.family_id) is distinct from (old.role, old.user_id, old.family_id) then
      raise exception 'memberships : une appartenance enfant n''est pas modifiable'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function app.memberships_guard_child_role() from public, anon;

do $$ begin
  create trigger trg_memberships_guard_child_role
    before insert or update on public.memberships
    for each row execute function app.memberships_guard_child_role();
exception when duplicate_object then null; end $$;

-- 4c) (SECURITY INVOKER : lit current_user) children.user_id n'est JAMAIS posé
--     côté CLIENT (revue L12 #1). Avant : la policy children_write_upd (0001) +
--     le GRANT UPDATE de la table laissaient tout parent écrire n'importe quel uid
--     dans children.user_id — p. ex. celui de l'appareil d'une AUTRE famille, ce
--     qui détournait son current_child_id (contrôle désactivé, SOS bloqué,
--     injection de messages). Seul le retour à NULL (délier un compte enfant
--     historique) reste permis. Le lien historique n'était posé que par l'Edge
--     Function (service_role) ; les appareils LOT12 utilisent devices.auth_user_id.
create or replace function app.children_guard_user_id()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.user_id is not null then
    if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
      raise exception 'children : user_id n''est pas modifiable (lien posé par l''appairage)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function app.children_guard_user_id() from public, anon;

do $$ begin
  create trigger trg_children_guard_user_id
    before insert or update on public.children
    for each row execute function app.children_guard_user_id();
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 5) GARDE-FOUS devices : lien auth posé uniquement par l'appairage, révocation
--    DÉFINITIVE, nettoyage de l'appartenance à la révocation / suppression.
-- =============================================================================

-- 5a) (SECURITY INVOKER : lit current_user) côté CLIENT :
--     * auth_user_id ni posé à l'insert, ni modifié (sinon un parent pourrait
--       « adopter » la session d'un tiers) ;
--     * un appareil appairé ne change ni d'enfant ni de famille (sinon
--       l'appartenance 'child' serait désynchronisée → ré-appairer) ;
--     * pour TOUS : revoked_at ne repasse jamais à NULL (révocation définitive ;
--       un nouvel appairage crée un nouvel appareil / utilisateur anonyme).
create or replace function app.devices_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.auth_user_id is not null and current_user in ('authenticated', 'anon') then
      raise exception 'devices : auth_user_id est réservé à l''appairage' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'devices : la révocation est définitive (ré-appairer l''appareil)'
      using errcode = '42501';
  end if;
  if current_user in ('authenticated', 'anon') then
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'devices : auth_user_id n''est pas modifiable' using errcode = '42501';
    end if;
    if old.auth_user_id is not null
       and (new.child_id <> old.child_id or new.family_id <> old.family_id) then
      raise exception 'devices : un appareil appairé ne change ni d''enfant ni de famille'
        using errcode = '42501';
    end if;
  end if;

  -- Compte auth de l'appareil SUPPRIMÉ (ON DELETE SET NULL : tableau de bord Auth,
  -- script de nettoyage) alors que l'appareil était actif : on le marque révoqué,
  -- sinon il resterait affiché « actif » dans la console sans plus aucun accès,
  -- indiscernable d'un appareil historique (revue L12 #11). Journalisé.
  if old.auth_user_id is not null and new.auth_user_id is null and new.revoked_at is null then
    new.revoked_at := now();
    -- Trace directe, acteur NULL (action système : le compte auteur n'existe plus).
    -- Branche inatteignable côté client (auth_user_id non modifiable, ci-dessus) ;
    -- ici current_user = propriétaire (action référentielle).
    insert into public.audit_log (family_id, actor_id, actor_role, action,
                                  subject_child_id, target_table, target_id, detail)
    values (new.family_id, null, null, 'device.revoked', new.child_id, 'devices', new.id,
            jsonb_build_object('via', 'auth_user_deleted'));
  end if;
  return new;
end;
$$;
revoke execute on function app.devices_guard() from public, anon;

do $$ begin
  create trigger trg_devices_guard
    before insert or update on public.devices
    for each row execute function app.devices_guard();
exception when duplicate_object then null; end $$;

-- 5b) (SECURITY DEFINER) à la RÉVOCATION ou à la SUPPRESSION d'un appareil
--     appairé (y compris en cascade : effacement RGPD d'un enfant/d'une famille),
--     on supprime l'appartenance 'child' de son utilisateur → is_member_of devient
--     faux (plus de lecture des tables « famille » : children, devices, consents,
--     schedules…). current_child_id est déjà coupé par le filtre revoked_at.
--     La révocation est journalisée (transparence : visible du parent et des
--     autres appareils de l'enfant).
create or replace function app.devices_release_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.revoked_at is null and new.revoked_at is not null and new.auth_user_id is not null then
      delete from public.memberships m
       where m.user_id = new.auth_user_id
         and m.family_id = new.family_id
         and m.role = 'child';
      perform app.audit(new.family_id, 'device.revoked', new.child_id, 'devices', new.id,
                        jsonb_build_object('via', 'devices_revoke_trigger'));
    end if;
    return new;
  end if;

  -- DELETE
  if old.auth_user_id is not null then
    delete from public.memberships m
     where m.user_id = old.auth_user_id
       and m.family_id = old.family_id
       and m.role = 'child';
  end if;
  return old;
end;
$$;
revoke execute on function app.devices_release_membership() from public, anon, authenticated;

do $$ begin
  create trigger trg_devices_release_membership
    after update of revoked_at or delete on public.devices
    for each row execute function app.devices_release_membership();
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 6) RPC parent : create_family et pairing_start refusées aux sessions anonymes
--    (et create_family aux comptes enfant/appareil). Corps repris de 0027/0028,
--    seul le garde-fou est ajouté. Signatures inchangées.
-- =============================================================================
create or replace function public.create_family(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_family public.families;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  -- LOT12 : une session anonyme (appareil) ne crée jamais de famille.
  if app.jwt_is_anonymous()
     or exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'anonymous_forbidden' using errcode = '42501';
  end if;
  -- LOT12 : un compte enfant/appareil ne devient jamais propriétaire d'un foyer.
  -- (children.user_id seul n'est pas une preuve : cf. 4c, revue L12 #1 — les
  --  comptes enfant historiques ont tous une appartenance 'child'.)
  if exists (select 1 from public.memberships m where m.user_id = v_uid and m.role = 'child')
     or exists (select 1 from public.devices d where d.auth_user_id = v_uid) then
    raise exception 'child_account_forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.families (name, created_by)
  values (v_name, v_uid)
  returning * into v_family;

  insert into public.memberships (family_id, user_id, role)
  values (v_family.id, v_uid, 'owner');

  perform app.audit(v_family.id, 'family.created', null::uuid, 'families', v_family.id,
                    jsonb_build_object('name', v_name, 'via', 'create_family_rpc'));

  return to_jsonb(v_family);
end;
$$;
revoke execute on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

-- 6b) Hachage des codes : pepper lu dans app.pairing_pepper (cf. §1), IDENTIQUE
--     pour pairing_start et pairing_complete, quelle que soit la connexion.
--     p_previous = true : hachage avec l'ANCIEN pepper, seulement pendant les
--     10 min (durée de vie d'un code) qui suivent une rotation ; NULL sinon.
create or replace function app.pairing_code_hash(p_code text, p_previous boolean default false)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not coalesce(p_previous, false) then
      encode(extensions.digest(
        coalesce((select pp.current_pepper from app.pairing_pepper pp where pp.id = 1), '')
        || ':' || p_code, 'sha256'), 'hex')
    else
      (select encode(extensions.digest(pp.previous_pepper || ':' || p_code, 'sha256'), 'hex')
         from app.pairing_pepper pp
        where pp.id = 1
          and pp.previous_pepper is not null
          and pp.rotated_at > now() - interval '10 minutes')
  end;
$$;
revoke execute on function app.pairing_code_hash(text, boolean) from public, anon, authenticated;

-- 6c) Normalisation d'un code SAISI (pairing_complete) — le hash est calculé sur
--     cette forme, identique à celle que génère pairing_start :
--       * espaces (dont insécables et largeur nulle, fréquents au copier-coller)
--         et tirets (dont tirets Unicode) retirés ;
--       * majuscules ;
--       * équivalences Crockford : O → 0, I → 1, L → 1.
--     Le résultat n'est PAS validé ici : pairing_complete exige ensuite
--     ^[0-9A-HJKMNP-TV-Z]{10}$ (alphabet sans I, L, O, U ; U n'a pas d'équivalent).
--     Fonction pure, sans accès aux tables ; réservée au serveur (aucun GRANT client).
create or replace function app.pairing_code_normalize(p_code text)
returns text
language sql immutable strict parallel safe set search_path = ''
as $$
  select translate(
           upper(regexp_replace(p_code,
             '[[:space:]\u00A0\u2007\u200B-\u200D\u202F\u2060\uFEFF\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]', '', 'g')),
           'OIL', '011');
$$;
revoke execute on function app.pairing_code_normalize(text) from public, anon, authenticated;

-- Rotation du pepper (ACTION PROPRIÉTAIRE, SQL Editor) : select app.rotate_pairing_pepper();
-- Nouveau pepper aléatoire généré en base (ou fourni, ≥ 32 caractères) ; l'ancien
-- reste accepté 10 min → aucun code en cours n'est invalidé. Ne pas enchaîner deux
-- rotations à moins de 10 min d'intervalle. Aucun redémarrage de PostgREST requis.
create or replace function app.rotate_pairing_pepper(p_new text default null)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if p_new is not null and char_length(p_new) < 32 then
    raise exception 'pepper_too_short' using errcode = '22023';
  end if;
  insert into app.pairing_pepper as pp (id, current_pepper, previous_pepper, rotated_at)
  values (1, coalesce(p_new, encode(extensions.gen_random_bytes(32), 'hex')), null, now())
  on conflict (id) do update
    set previous_pepper = pp.current_pepper,
        current_pepper  = excluded.current_pepper,
        rotated_at      = now()
  returning pp.rotated_at into v_at;
  return v_at;
end;
$$;
revoke execute on function app.rotate_pairing_pepper(text) from public, anon, authenticated;

-- pairing_start : corps repris de 0028 (même signature, mêmes garde-fous :
-- appelant owner/parent/guardian, enfant de la famille) + garde-fous LOT12 :
--   * session anonyme refusée (claim JWT OU auth.users.is_anonymous) ;
--   * code de 10 caractères base32 Crockford (0-9 A-Z sans I, L, O, U), tiré
--     octet par octet de extensions.gen_random_bytes (CSPRNG) : octet & 31 →
--     tirage UNIFORME (256 est un multiple de 32), 50 bits d'entropie. Renvoyé
--     sous deux formes : `code` (forme normalisée, 10 caractères — celle qui est
--     hachée) et `code_display` (« 7KQ2M-X9D4F », pour l'affichage) ;
--   * pepper lu en table (§1) ;
--   * UN SEUL code actif par enfant : générer un code expire les précédents de
--     cet enfant (revue L12 #7 : chaque clic ajoutait un code valable 10 min) ;
--   * au plus 5 codes actifs par famille (borne la probabilité de force brute,
--     qui croît avec le nombre de codes actifs) → erreur 'too_many_active_codes'.
create or replace function public.pairing_start(
  p_family_id uuid,
  p_child_id  uuid,
  p_mode      text default 'standard'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_role       text;
  v_mode       text := case when p_mode = 'reinforced' then 'reinforced' else 'standard' end;
  v_code       text;
  v_hash       text;
  v_expires    timestamptz := now() + interval '10 minutes';
  v_active     integer;
  v_max_active constant integer := 5;
  -- Alphabet base32 de Crockford : 32 symboles, sans I, L, O, U.
  v_alphabet   constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_rand       bytea;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  -- LOT12 : une session anonyme n'a jamais l'autorité parentale.
  if app.jwt_is_anonymous()
     or exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_family_id is null or p_child_id is null then
    raise exception 'missing_params' using errcode = '22023';
  end if;

  -- Autorité : l'appelant doit être owner/parent/guardian de la famille.
  select m.role::text into v_role
  from public.memberships m
  where m.family_id = p_family_id and m.user_id = v_uid;
  if v_role is null or v_role not in ('owner', 'parent', 'guardian') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- L'enfant doit appartenir à cette famille.
  if not exists (
    select 1 from public.children c where c.id = p_child_id and c.family_id = p_family_id
  ) then
    raise exception 'child_not_in_family' using errcode = 'P0002';
  end if;

  -- Sérialise les générations d'UNE famille (plafond exact ; aucun effet global).
  perform pg_advisory_xact_lock(hashtext('public.pairing_start'), hashtext(p_family_id::text));

  -- Un seul code actif par enfant : les codes encore valables de cet enfant expirent.
  update public.pairing_codes pc
     set expires_at = now()
   where pc.child_id = p_child_id
     and pc.consumed_at is null
     and pc.expires_at > now();

  select count(*) into v_active
  from public.pairing_codes pc
  where pc.family_id = p_family_id
    and pc.consumed_at is null
    and pc.expires_at > now();
  if v_active >= v_max_active then
    raise exception 'too_many_active_codes' using errcode = 'P0001';
  end if;

  -- Code de 10 caractères base32 Crockford, tiré d'une source CSPRNG (5 bits
  -- uniformes par octet), puis haché (forme normalisée) avant stockage.
  v_rand := extensions.gen_random_bytes(10);
  v_code := '';
  for i in 0 .. 9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_rand, i) & 31) + 1, 1);
  end loop;
  v_code := app.pairing_code_normalize(v_code);   -- identité sur l'alphabet ; symétrie avec pairing_complete
  v_hash := app.pairing_code_hash(v_code, false);

  insert into public.pairing_codes (family_id, child_id, code_hash, mode, expires_at, created_by)
  values (p_family_id, p_child_id, v_hash, v_mode::app.device_mode, v_expires, v_uid);

  perform app.audit(p_family_id, 'pairing.code_created', p_child_id, 'pairing_codes', null::uuid,
                    jsonb_build_object('mode', v_mode, 'ttl_minutes', 10, 'via', 'pairing_start_rpc'));

  return jsonb_build_object('code', v_code,
                            'code_display', left(v_code, 5) || '-' || right(v_code, 5),
                            'expires_at', v_expires, 'mode', v_mode);
end;
$$;
revoke execute on function public.pairing_start(uuid, uuid, text) from public, anon;
grant execute on function public.pairing_start(uuid, uuid, text) to authenticated;


-- =============================================================================
-- 7) RPC public.pairing_complete — l'appareil (session anonyme) échange le code.
--
-- Ordre de traitement (revue L12 #5) :
--   0. appelant authentifié ET session ANONYME (claim JWT is_anonymous = true
--      ET auth.users.is_anonymous = true), sinon 'anonymous_session_required'
--      (aucune tentative enregistrée : ce n'est pas un essai de code) ;
--   A. validation SANS ÉTAT (code normalisé puis format Crockford à 10
--      caractères, objet appareil ≤ 8 Kio, champs
--      tronqués AVANT tout nettoyage regex, plateforme) : aucun verrou, aucune
--      table — une charge utile énorme ne bloque personne ;
--   B. verrou consultatif PAR UTILISATEUR (compteurs exacts pour ce compte ;
--      l'usage unique du code est garanti par le FOR UPDATE sur pairing_codes) ;
--      lock_timeout = 3 s : jamais d'attente jusqu'au statement_timeout ;
--   C. compte parent refusé ; D. rejeu idempotent d'une session déjà appairée ;
--   E. limite par utilisateur ; F. échecs « sans essai de code » ; G. plafond
--      global ; H. recherche du code, enrôlement.
--
-- Anti force brute (fenêtre glissante de 15 min, échecs uniquement) :
--   * par utilisateur : app.pairing_max_failures_user (défaut 5) — TOUS les
--     échecs (format, appareil invalide, code inconnu/utilisé/expiré) ;
--   * global : app.pairing_max_failures_global (défaut 100) — seuls les échecs
--     qui TESTENT un code (counts_global) le remplissent ; il ne s'applique
--     qu'aux appelants ayant déjà raté un code dans la fenêtre. Un appelant SANS
--     échec n'est jamais bloqué : le plafond global n'est plus un interrupteur
--     qui couperait l'appairage de toutes les familles (revue L12 #2/#3/#14).
--   (réglables par le propriétaire : alter database postgres set app.… = '…').
--
-- Déploiement (SETUP.md) : une session anonyme ne coûte qu'un POST
--   /auth/v1/signup ; un attaquant qui ouvre une session neuve par essai échappe
--   aux limites par utilisateur et globale, et n'est borné que par la limite
--   d'inscriptions anonymes par IP (Auth > Rate limits, à régler bas). C'est
--   pourquoi le code est passé à 10 caractères base32 (décision LOT 12 : PAS de
--   CAPTCHA — service tiers, enjeu RGPD, intégration lourde dans l'appli).
--
-- Risque réel : chaque essai réussit avec la probabilité N/32^10 (≈ N/1,1·10^15),
--   N = nombre de codes ACTIFS dans TOUTES les familles (≤ 1 par enfant et ≤ 5
--   par famille). Pour G essais par jour : P(jour) ≈ G·N/1,1·10^15. Même avec
--   un million d'essais par jour (réseau de machines contournant la limite par
--   IP) et N = 1 000 codes actifs simultanés : ≈ 9·10^-7 par jour, ≈ 1,6·10^-3
--   sur 5 ans (avec 8 chiffres : ≈ 10 appairages frauduleux PAR JOUR). Avec la
--   limite par IP et quelques dizaines de codes actifs : ≈ 10^-9 par jour.
--   Un appairage non désiré reste VISIBLE (audit device.enrolled, liste des
--   appareils) et révocable depuis la console.
-- =============================================================================
create or replace function public.pairing_complete(p_code text, p_device jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_uid        uuid := auth.uid();
  v_code       text;
  v_code_ok    boolean;
  v_dev        jsonb := coalesce(p_device, '{}'::jsonb);
  v_dev_ok     boolean := true;
  -- Caractères retirés des champs affichés : contrôles C0/C1, tiret conditionnel,
  -- marques bidi (LRM/RLM/ALM, LRE…RLO, LRI…PDI), largeur nulle, séparateurs de
  -- ligne/paragraphe, BOM, ancres d'annotation (revue L12 #8).
  v_strip      constant text :=
    '[[:cntrl:]­؜᠎​-‏ -‮⁠-⁯﻿￹-￻]';
  v_window     interval := interval '15 minutes';
  v_max_user   integer := coalesce(nullif(current_setting('app.pairing_max_failures_user', true), '')::integer, 5);
  v_max_global integer := coalesce(nullif(current_setting('app.pairing_max_failures_global', true), '')::integer, 100);
  v_fail_user  integer;
  v_fail_code  integer;
  v_fail_glob  integer;
  v_oldest     timestamptz;
  v_platform   text;
  v_label      text;
  v_model      text;
  v_os         text;
  v_pubkey     text;
  v_hash       text;
  v_pc         public.pairing_codes;
  v_existing   public.devices;
  v_device_id  uuid;
begin
  -- 0) Appelant authentifié...
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  -- ... par une session ANONYME : claim du JWT (signé par GoTrue) ET état en base.
  --    Un compte e-mail/mot de passe (parent, compte enfant historique) ne devient
  --    jamais un appareil. Pas de tentative enregistrée : ce n'est pas un essai.
  if not app.jwt_is_anonymous()
     or not exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    return jsonb_build_object('error', 'anonymous_session_required');
  end if;

  -- A) Validation sans état (aucun verrou, aucune table). Tailles bornées AVANT
  --    tout traitement : octet_length / left() avant regexp_replace.
  --    Code : normalisé (espaces/tirets retirés, majuscules, O→0, I/L→1 — §6c)
  --    puis validé contre l'alphabet Crockford, 10 caractères exactement.
  v_code := case when octet_length(coalesce(p_code, '')) <= 64
                 then coalesce(app.pairing_code_normalize(p_code), '') else '' end;
  v_code_ok := v_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$';

  if jsonb_typeof(v_dev) is distinct from 'object' or octet_length(v_dev::text) > 8192 then
    v_dev_ok := false;
  else
    -- Mêmes champs que l'Edge Function : aucune collecte nouvelle.
    v_platform := lower(coalesce(nullif(btrim(left(v_dev ->> 'platform', 16)), ''), 'android'));
    if v_platform not in ('android', 'ios', 'web') then
      v_dev_ok := false;
    end if;
    v_label  := nullif(btrim(left(regexp_replace(left(coalesce(v_dev ->> 'label', ''),      160), v_strip, '', 'g'),  80)), '');
    v_model  := nullif(btrim(left(regexp_replace(left(coalesce(v_dev ->> 'model', ''),      240), v_strip, '', 'g'), 120)), '');
    v_os     := nullif(btrim(left(regexp_replace(left(coalesce(v_dev ->> 'os_version', ''),  80), v_strip, '', 'g'),  40)), '');
    v_pubkey := nullif(btrim(coalesce(v_dev ->> 'public_key', '')), '');
    if v_pubkey is not null and char_length(v_pubkey) > 4096 then
      v_dev_ok := false;
    end if;
  end if;

  -- B) Verrou PAR UTILISATEUR : n'attend jamais un autre appelant.
  perform pg_advisory_xact_lock(hashtext('public.pairing_complete'), hashtext(v_uid::text));

  -- C) Jamais un compte parent transformé en appareil enfant. Défense en
  --    profondeur : depuis l'exigence de session anonyme (étape 0), inatteignable
  --    tant que le trigger 4a interdit tout rôle parent à un compte anonyme.
  if exists (select 1 from public.memberships m
             where m.user_id = v_uid and m.role in ('owner', 'parent', 'guardian')) then
    return jsonb_build_object('error', 'parent_account_forbidden');
  end if;

  -- D) Un utilisateur = un appareil. Rejeu par la MÊME session d'un appairage
  --    réussi (réponse perdue sur le réseau mobile) : on renvoie le même résultat,
  --    sans compter d'échec (revue L12 #10). Appareil révoqué / compte historique :
  --    device_already_paired (ré-appairage = nouvelle session anonyme).
  select d.* into v_existing
  from public.devices d
  where d.auth_user_id = v_uid
  limit 1;
  if v_existing.id is not null and v_existing.revoked_at is null then
    return jsonb_build_object('device_id',      v_existing.id,
                              'family_id',      v_existing.family_id,
                              'child_id',       v_existing.child_id,
                              'mode',           v_existing.mode,
                              'already_paired', true);
  end if;
  if v_existing.id is not null
     or exists (select 1 from public.children c where c.user_id = v_uid)
     or exists (select 1 from public.memberships m where m.user_id = v_uid) then
    return jsonb_build_object('error', 'device_already_paired');
  end if;

  -- E) Limite par utilisateur (tous échecs de la fenêtre). Purge paresseuse des
  --    lignes > 24 h de CE compte (la purge globale : app.run_data_retention).
  delete from app.pairing_attempts a
   where a.user_id = v_uid and a.attempted_at < now() - interval '24 hours';

  select count(*), count(*) filter (where a.counts_global), min(a.attempted_at)
    into v_fail_user, v_fail_code, v_oldest
  from app.pairing_attempts a
  where a.user_id = v_uid and not a.succeeded and a.attempted_at > now() - v_window;
  if v_fail_user >= v_max_user then
    return jsonb_build_object('error', 'too_many_attempts',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + v_window - now()))))::integer);
  end if;

  -- F) Échecs SANS essai de code : comptés pour l'utilisateur uniquement.
  if not v_code_ok then
    insert into app.pairing_attempts (user_id, succeeded, counts_global) values (v_uid, false, false);
    return jsonb_build_object('error', 'invalid_code_format');
  end if;
  if not v_dev_ok then
    insert into app.pairing_attempts (user_id, succeeded, counts_global) values (v_uid, false, false);
    return jsonb_build_object('error', 'invalid_device');
  end if;

  -- G) Plafond global : seulement pour un appelant qui a DÉJÀ raté un code dans
  --    la fenêtre (un appelant sans échec n'est jamais bloqué).
  if v_fail_code > 0 then
    select count(*), min(a.attempted_at) into v_fail_glob, v_oldest
    from app.pairing_attempts a
    where not a.succeeded and a.counts_global and a.attempted_at > now() - v_window;
    if v_fail_glob >= v_max_global then
      return jsonb_build_object('error', 'too_many_attempts',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + v_window - now()))))::integer);
    end if;
  end if;

  -- H) Code : hash IDENTIQUE à pairing_start (app.pairing_code_hash). On préfère
  --    la ligne encore utilisable (collision possible avec un ancien code) ;
  --    verrou de ligne pour l'usage unique. Repli sur l'ancien pepper pendant les
  --    10 min qui suivent une rotation.
  v_hash := app.pairing_code_hash(v_code, false);
  select pc.* into v_pc
  from public.pairing_codes pc
  where pc.code_hash = v_hash
  order by (pc.consumed_at is null and pc.expires_at > now()) desc, pc.created_at desc
  limit 1
  for update;

  if v_pc.id is null then
    v_hash := app.pairing_code_hash(v_code, true);
    if v_hash is not null then
      select pc.* into v_pc
      from public.pairing_codes pc
      where pc.code_hash = v_hash
      order by (pc.consumed_at is null and pc.expires_at > now()) desc, pc.created_at desc
      limit 1
      for update;
    end if;
  end if;

  if v_pc.id is null then
    insert into app.pairing_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('error', 'code_not_found');
  end if;
  if v_pc.consumed_at is not null then
    insert into app.pairing_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('error', 'code_already_used');
  end if;
  if v_pc.expires_at <= now() then
    insert into app.pairing_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('error', 'code_expired');
  end if;

  -- Enrôlement : appareil relié au compte, appartenance 'child', code consommé.
  insert into public.devices (family_id, child_id, platform, mode, label, model, os_version,
                              public_key, enrolled_at, last_seen_at, auth_user_id)
  values (v_pc.family_id, v_pc.child_id, v_platform::app.device_platform, v_pc.mode,
          v_label, v_model, v_os, v_pubkey, now(), now(), v_uid)
  returning id into v_device_id;

  insert into public.memberships (family_id, user_id, role)
  values (v_pc.family_id, v_uid, 'child')
  on conflict (family_id, user_id) do nothing;

  update public.pairing_codes set consumed_at = now() where id = v_pc.id;

  insert into app.pairing_attempts (user_id, succeeded) values (v_uid, true);

  -- Audit (transparence : visible du parent et de l'enfant dans « Mes données »).
  perform app.audit(v_pc.family_id, 'device.enrolled', v_pc.child_id, 'devices', v_device_id,
                    jsonb_build_object('mode', v_pc.mode, 'platform', v_platform,
                                       'model', v_model, 'via', 'pairing_complete_rpc'));

  return jsonb_build_object('device_id', v_device_id,
                            'family_id', v_pc.family_id,
                            'child_id',  v_pc.child_id,
                            'mode',      v_pc.mode);
exception
  -- Filet de sécurité (le verrou par utilisateur l'évite) : appareil déjà lié.
  when unique_violation then
    return jsonb_build_object('error', 'device_already_paired');
end;
$$;
revoke execute on function public.pairing_complete(text, jsonb) from public, anon;
grant execute on function public.pairing_complete(text, jsonb) to authenticated;


-- =============================================================================
-- 8) Hook custom access token : child_id aussi pour un APPAREIL (non révoqué).
--    Le hook s'exécute sous supabase_auth_admin → lecture de devices autorisée.
--    (La RLS ne dépend PAS de ce claim : elle relit l'état en base.)
-- =============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
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

  -- Même règle que app.current_child_id() (revue L12 #1) : l'appareil non révoqué
  -- d'abord ; children.user_id (héritage) seulement avec l'appartenance 'child'
  -- correspondante et pour un compte sans aucun appareil.
  select d.child_id into child
  from public.devices d
  where d.auth_user_id = (event->>'user_id')::uuid
    and d.revoked_at is null
  limit 1;

  if child is null
     and not exists (select 1 from public.devices d
                     where d.auth_user_id = (event->>'user_id')::uuid) then
    select c.id into child
    from public.children c
    where c.user_id = (event->>'user_id')::uuid
      and exists (select 1 from public.memberships m
                  where m.family_id = c.family_id
                    and m.user_id = c.user_id
                    and m.role = 'child')
    limit 1;
  end if;

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
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.devices to supabase_auth_admin;
do $$ begin
  create policy auth_admin_read_devices on public.devices
    as permissive for select to supabase_auth_admin using (true);
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 9) RGPD — purge des utilisateurs ANONYMES ORPHELINS de auth.users.
--    L'effacement d'un enfant / d'une famille (0022) supprime en cascade ses
--    appareils ; le trigger 5b retire les appartenances 'child'. Il reste les
--    comptes anonymes (sessions, refresh tokens) dans auth.users : sans appareil
--    actif ni appartenance, ils ne donnent plus AUCUN accès, mais doivent être
--    purgés (minimisation). Fonction SECURITY DEFINER (propriétaire postgres, qui
--    a DELETE sur auth.users) : pas de service_role. EXECUTE réservé au
--    propriétaire / pg_cron.
--
--    Orphelin = is_anonymous ET créé depuis plus de p_min_age (laisse le temps
--    d'appairer) ET aucune appartenance ET aucun profil children.user_id ET aucun
--    appareil NON révoqué. Les appareils révoqués gardent leur historique
--    (auth_user_id → NULL par la FK).
--
--    ⚠️ PLANIFICATION = ACTION PROPRIÉTAIRE (comme 0021), dans le SQL Editor :
--      select cron.schedule('purge-orphan-device-users', '30 3 * * *',
--        $cron$ select app.purge_orphan_device_users(); $cron$);
-- =============================================================================
create or replace function app.purge_orphan_device_users(p_min_age interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - coalesce(p_min_age, interval '7 days')
     and not exists (select 1 from public.memberships m where m.user_id = u.id)
     and not exists (select 1 from public.children c where c.user_id = u.id)
     and not exists (select 1 from public.devices d
                     where d.auth_user_id = u.id and d.revoked_at is null);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function app.purge_orphan_device_users(interval) from public, anon, authenticated;


-- =============================================================================
-- 10) CORRECTIF RGPD (bug préexistant, révélé par le banc de test du LOT 12) :
--     l'effacement d'un enfant (rgpd_delete_child) ou d'une famille
--     (rgpd_delete_family) ÉCHOUAIT dès que l'enfant avait une règle
--     (access_policies, app_rules, screen_time_limits, child_schedules,
--     filter_policy, filter_rules, safety_settings) :
--       ERROR insert or update on table "audit_log" violates foreign key
--             constraint "audit_log_subject_child_id_fkey"
--     La suppression EN CASCADE de la règle déclenche app.log_rule_change (AFTER
--     DELETE) qui insère une ligne d'audit pointant vers l'enfant (ou la famille)
--     DÉJÀ supprimé → violation de clé étrangère → toute la transaction avorte.
--     Correctif : sur DELETE, si l'enfant ou la famille n'existe plus (effacement
--     en cascade), on ne journalise pas la règle — l'effacement lui-même est déjà
--     tracé (audit 'rgpd.delete_child' ; pour une famille, tout son audit part avec
--     elle). Corps identique à 0007 sinon (SECURITY DEFINER, search_path figé).
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
    -- Effacement en cascade (enfant ou famille supprimé) : rien à journaliser ici.
    if not exists (select 1 from public.children c where c.id = v_child)
       or not exists (select 1 from public.families f where f.id = v_family) then
      return old;
    end if;
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


-- =============================================================================
-- 11) CORRECTIF RGPD (bug préexistant, révélé par la purge des comptes anonymes) :
--     SUPPRIMER un compte auth (purge d'un appareil, ou suppression d'un compte
--     depuis le tableau de bord) exécute les actions ON DELETE SET NULL sur les
--     colonnes d'auteur. Trois garde-fous d'immutabilité les refusaient et faisaient
--     avorter la suppression :
--       * audit_log.actor_id          (app.audit_log_immutable, 0001/0025)
--       * messages.created_by         (app.messages_guard_update, 0018)
--       * privacy_pauses.created_by   (app.privacy_pauses_guard_child_update, 0019)
--     Correctif, même principe que 0025 : on autorise UNIQUEMENT la transition
--     « colonne d'auteur non NULL → NULL, AUCUNE autre colonne modifiée ». Le
--     contenu reste immuable ; seule la référence pseudonyme au compte effacé
--     disparaît (actor_role / sender restent : la traçabilité est conservée).
--     Côté client : messages n'accorde l'UPDATE que sur read_at (0018), et
--     audit_log n'a aucune policy UPDATE → transition inatteignable. Pour
--     privacy_pauses, l'ado pourrait effacer l'auteur de SA pause : sans effet sur
--     la transparence (la pause reste visible du parent).
-- =============================================================================
create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Exceptions : actions référentielles ON DELETE SET NULL
  --   * subject_child_id (effacement RGPD d'un enfant, 0025) ;
  --   * actor_id (suppression du compte auteur, ex. purge d'un appareil anonyme).
  -- Chacune ne peut que passer de non NULL à NULL ; rien d'autre ne change.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'subject_child_id' - 'actor_id') = (to_jsonb(old) - 'subject_child_id' - 'actor_id')
     and (new.subject_child_id is not distinct from old.subject_child_id
          or (old.subject_child_id is not null and new.subject_child_id is null))
     and (new.actor_id is not distinct from old.actor_id
          or (old.actor_id is not null and new.actor_id is null))
     and (new.subject_child_id is distinct from old.subject_child_id
          or new.actor_id is distinct from old.actor_id)
  then
    return new;
  end if;
  raise exception 'audit_log est append-only : % interdit', tg_op;
end;
$$;

create or replace function app.messages_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Suppression du compte auteur (ON DELETE SET NULL) : seule created_by → NULL.
  if old.created_by is not null and new.created_by is null
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;
  if new.body       is distinct from old.body
     or new.sender     is distinct from old.sender
     or new.family_id  is distinct from old.family_id
     or new.child_id   is distinct from old.child_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'messages : seul read_at est modifiable (contenu immuable)';
  end if;
  return new;
end;
$$;
revoke execute on function app.messages_guard_update() from public, anon;

create or replace function app.privacy_pauses_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Suppression du compte auteur (ON DELETE SET NULL) : seule created_by → NULL,
  -- et seulement si le compte n'existe PLUS (l'ado ne peut pas « désattribuer »).
  if old.created_by is not null and new.created_by is null
     and not exists (select 1 from auth.users u where u.id = old.created_by)
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;
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


-- =============================================================================
-- 12) CORRECTIF RGPD (suite du §11, revue L12 #12) : supprimer le compte d'un
--     (co-)parent échouait encore s'il avait CRÉÉ une commande ou ACQUITTÉ un
--     SOS : l'action ON DELETE SET NULL (commands.created_by, sos_events.acked_by)
--     passait par les garde-fous « compte enfant » de 0008/0012, où
--     app.is_parent_of est faux (aucun JWT pendant la suppression) :
--       « commande : seul l'accusé de réception est permis au compte enfant »
--       « sos : seule la clôture (resolved) est permise au compte enfant »
--     Même exception qu'au §11 : colonne d'auteur non NULL → NULL, AUCUNE autre
--     colonne modifiée, ET compte référencé n'existant plus (l'action
--     référentielle s'exécute après la suppression de la ligne auth.users) — un
--     appareil ne peut donc pas « désattribuer » une commande ou un acquittement.
--     Corps identiques à 0008 / 0012 sinon.
-- =============================================================================
create or replace function app.commands_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Suppression du compte auteur (ON DELETE SET NULL) : seule created_by → NULL.
  if old.created_by is not null and new.created_by is null
     and not exists (select 1 from auth.users u where u.id = old.created_by)
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;

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

create or replace function app.sos_guard_child_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Suppression du compte qui a acquitté (ON DELETE SET NULL) : seule acked_by → NULL.
  if old.acked_by is not null and new.acked_by is null
     and not exists (select 1 from auth.users u where u.id = old.acked_by)
     and (to_jsonb(new) - 'acked_by') = (to_jsonb(old) - 'acked_by') then
    return new;
  end if;

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


-- =============================================================================
-- 13) RÉTENTION (revue L12 #13) : app.pairing_attempts purgé à 24 h par la passe
--     quotidienne app.run_data_retention (0021, déjà planifiée par pg_cron), et
--     plus seulement au prochain appel de pairing_complete. Corps identique à
--     0021 sinon (même signature, mêmes droits).
-- =============================================================================
create or replace function app.run_data_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  n bigint;
begin
  -- location_fixes : rétention paramétrée PAR ENFANT (défaut 30 j si non réglée).
  delete from public.location_fixes lf
   where lf.captured_at < now() - make_interval(days => coalesce(
           (select ls.retention_days from public.location_settings ls
             where ls.child_id = lf.child_id), 30));
  get diagnostics n = row_count; r := jsonb_set(r, '{location_fixes}', to_jsonb(n));

  -- domain_events : rétention paramétrée PAR ENFANT (défaut 30 j si non réglée).
  delete from public.domain_events de
   where de.occurred_at < now() - make_interval(days => coalesce(
           (select fp.retention_days from public.filter_policy fp
             where fp.child_id = de.child_id), 30));
  get diagnostics n = row_count; r := jsonb_set(r, '{domain_events}', to_jsonb(n));

  delete from public.device_status where captured_at < now() - interval '30 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{device_status}', to_jsonb(n));

  delete from public.comm_events where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{comm_events}', to_jsonb(n));

  delete from public.geofence_events where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{geofence_events}', to_jsonb(n));

  delete from public.safety_signals where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{safety_signals}', to_jsonb(n));

  delete from public.safety_alerts where created_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{safety_alerts}', to_jsonb(n));

  delete from public.usage_daily where day < (now() - interval '180 days')::date;
  get diagnostics n = row_count; r := jsonb_set(r, '{usage_daily}', to_jsonb(n));

  delete from public.time_grants where grant_date < (now() - interval '180 days')::date;
  get diagnostics n = row_count; r := jsonb_set(r, '{time_grants}', to_jsonb(n));

  delete from public.commands where created_at < now() - interval '30 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{commands}', to_jsonb(n));

  delete from public.messages where created_at < now() - interval '365 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{messages}', to_jsonb(n));

  delete from public.sos_events where started_at < now() - interval '365 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{sos_events}', to_jsonb(n));

  -- privacy_pauses : seules les pauses CLOSES anciennes sont purgées (on ne touche
  -- jamais une pause encore ouverte — K8, elle doit rester visible du parent).
  delete from public.privacy_pauses
   where ended_at is not null and ended_at < now() - interval '90 days';
  get diagnostics n = row_count; r := jsonb_set(r, '{privacy_pauses}', to_jsonb(n));

  -- LOT12 : journal anti force brute de l'appairage — 24 h (revue L12 #13 : la
  -- purge paresseuse de pairing_complete ne passait qu'au prochain appairage).
  delete from app.pairing_attempts where attempted_at < now() - interval '24 hours';
  get diagnostics n = row_count; r := jsonb_set(r, '{pairing_attempts}', to_jsonb(n));

  -- NB : audit_log (conservé LE PLUS LONGTEMPS — traçabilité K3, défaut 730 j) n'est
  -- PAS purgé ici. Sa purge est une opération SENSIBLE (table d'audit) laissée à une
  -- action explicite du propriétaire — cf. docs/12 §Actions manuelles (elle requiert
  -- d'abord le retrait de trg_audit_no_delete via le bloc 0010).
  return r;
end;
$$;

revoke execute on function app.run_data_retention() from public, anon, authenticated;
