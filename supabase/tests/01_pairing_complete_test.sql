-- =============================================================================
-- Tests LOT 12 — appairage par RPC public.pairing_complete + sessions anonymes.
-- Exécuté par run.sh (superutilisateur local) APRÈS stubs + migrations.
-- Les appels « client » simulent PostgREST : SET ROLE authenticated +
-- request.jwt.claims (sub, role, is_anonymous). Toute assertion fausse lève
-- « ECHEC … » et arrête le script (ON_ERROR_STOP).
-- =============================================================================
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

-- --- Outils de test -----------------------------------------------------------
create schema if not exists t;
grant usage on schema t to public;

-- Simule le JWT d'un utilisateur (claims lus par auth.uid()/auth.jwt()).
create or replace function t.act(p_uid uuid, p_anon boolean)
returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
$$;

create or replace function t.ok(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'ECHEC %', p_msg;
  end if;
  raise notice 'OK  %', p_msg;
end $$;

-- Exécute p_sql sous le rôle COURANT et exige une erreur correspondant à p_pattern.
create or replace function t.err(p_sql text, p_pattern text, p_msg text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'OK  % (erreur attendue : %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'ECHEC % : erreur inattendue « % »', p_msg, sqlerrm;
  end;
  raise exception 'ECHEC % : aucune erreur levée', p_msg;
end $$;

-- Nombre de lignes VISIBLES (sous le rôle courant) dans chaque table publique.
create or replace function t.visible_rows()
returns table (tbl text, n bigint) language plpgsql as $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    tbl := r.tablename;
    execute format('select count(*) from public.%I', r.tablename) into n;
    return next;
  end loop;
end $$;

-- Comme t.err, mais exige un SQLSTATE précis.
create or replace function t.errstate(p_sql text, p_state text, p_msg text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      raise notice 'OK  % (SQLSTATE % : %)', p_msg, sqlstate, sqlerrm;
      return;
    end if;
    raise exception 'ECHEC % : SQLSTATE % inattendu « % »', p_msg, sqlstate, sqlerrm;
  end;
  raise exception 'ECHEC % : aucune erreur levée', p_msg;
end $$;

grant execute on all functions in schema t to public;

-- Code en clair conservé pour le test de course (table de TEST uniquement).
create table if not exists t.race (code text);
grant select on t.race to authenticated;

-- --- Acteurs -----------------------------------------------------------------
\set P1  '11111111-1111-1111-1111-111111111111'
\set P2  '22222222-2222-2222-2222-222222222222'
\set A1  'aaaaaaaa-0000-0000-0000-000000000001'
\set A2  'aaaaaaaa-0000-0000-0000-000000000002'
\set A3  'aaaaaaaa-0000-0000-0000-000000000003'
\set A4  'aaaaaaaa-0000-0000-0000-000000000004'
\set A6  'aaaaaaaa-0000-0000-0000-000000000006'
\set A7  'aaaaaaaa-0000-0000-0000-000000000007'
\set A8  'aaaaaaaa-0000-0000-0000-000000000008'
\set A9  'aaaaaaaa-0000-0000-0000-000000000009'
\set A10 'aaaaaaaa-0000-0000-0000-000000000010'
\set A13 'aaaaaaaa-0000-0000-0000-000000000013'
\set A14 'aaaaaaaa-0000-0000-0000-000000000014'
\set A15 'aaaaaaaa-0000-0000-0000-000000000015'
\set A16 'aaaaaaaa-0000-0000-0000-000000000016'
\set A17 'aaaaaaaa-0000-0000-0000-000000000017'
\set A18 'aaaaaaaa-0000-0000-0000-000000000018'
\set LG  '33333333-3333-3333-3333-333333333333'

insert into auth.users (id, email, is_anonymous) values
  (:'P1', 'parent1@example.test', false),
  (:'P2', 'parent2@example.test', false);
insert into auth.users (id, is_anonymous)
select ('aaaaaaaa-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, true
from generate_series(1, 20) i;

-- =============================================================================
-- T0 — Mise en place par les parents (chemins légitimes create_family/pairing_start)
-- =============================================================================
select t.act(:'P1', false);
set role authenticated;
select (public.create_family('Famille Une'))->>'id' as f1 \gset
insert into public.children (family_id, display_name) values (:'f1', 'Alice') returning id as c1 \gset
insert into public.children (family_id, display_name) values (:'f1', 'Bob')   returning id as c2 \gset
insert into public.access_policies (family_id, child_id, daily_limit_minutes) values (:'f1', :'c1', 60), (:'f1', :'c2', 90);
insert into public.messages (family_id, child_id, sender, body) values (:'f1', :'c1', 'parent', 'Pour Alice'), (:'f1', :'c2', 'parent', 'Pour Bob');
insert into public.consents (family_id, child_id, purpose, basis) values (:'f1', :'c1', 'screen_time', 'parental_authority');
reset role;

select t.act(:'P2', false);
set role authenticated;
select (public.create_family('Famille Deux'))->>'id' as f2 \gset
insert into public.children (family_id, display_name) values (:'f2', 'Chloé') returning id as c3 \gset
insert into public.access_policies (family_id, child_id, daily_limit_minutes) values (:'f2', :'c3', 30);
insert into public.messages (family_id, child_id, sender, body) values (:'f2', :'c3', 'parent', 'Pour Chloé');
reset role;
select t.ok(:'f1' is not null and :'f2' is not null, 'T0 create_family fonctionne pour un parent (non anonyme)');

-- =============================================================================
-- T1 — Appairage OK par une session anonyme
-- =============================================================================
select t.act(:'P1', false); set role authenticated;
select public.pairing_start(:'f1', :'c1', 'standard') as start1 \gset
reset role;
select :'start1'::jsonb ->> 'code' as code1 \gset
select t.ok(:'code1' ~ '^[0-9A-HJKMNP-TV-Z]{10}$', 'T1 pairing_start renvoie un code de 10 caractères base32 Crockford');
select t.ok(:'start1'::jsonb ->> 'code_display' = left(:'code1', 5) || '-' || right(:'code1', 5),
            'T1 pairing_start renvoie aussi la forme affichée groupée 5+5 (code_display)');

select t.act(:'A1', true); set role authenticated;
select public.pairing_complete(:'code1',
  '{"platform":"android","model":"Pixel 7","os_version":"14","label":"Téléphone d''Alice"}'::jsonb) as r1 \gset
reset role;
select :'r1'::jsonb ->> 'device_id' as d1 \gset
select t.ok(not (:'r1'::jsonb ? 'error')
            and (:'r1'::jsonb ->> 'family_id') = :'f1'
            and (:'r1'::jsonb ->> 'child_id') = :'c1'
            and (:'r1'::jsonb ->> 'mode') = 'standard', 'T1 pairing_complete renvoie {device_id, family_id, child_id, mode}');
select t.ok((select d.auth_user_id = :'A1'::uuid and d.model = 'Pixel 7' and d.enrolled_at is not null
             and d.platform = 'android' and d.revoked_at is null
             from public.devices d where d.id = :'d1'), 'T1 ligne devices créée et reliée au compte anonyme');
select t.ok(exists (select 1 from public.memberships where family_id = :'f1' and user_id = :'A1' and role = 'child'),
            'T1 appartenance child créée');
select t.ok((select consumed_at is not null from public.pairing_codes where child_id = :'c1' order by created_at desc limit 1),
            'T1 code consommé');
select t.ok(exists (select 1 from public.audit_log where action = 'device.enrolled' and target_id = :'d1'
                    and actor_id = :'A1' and actor_role = 'child' and subject_child_id = :'c1'),
            'T1 audit device.enrolled écrit (acteur = appareil, rôle child)');

select t.act(:'A1', true); set role authenticated;
select t.ok(app.current_child_id() = :'c1'::uuid, 'T1 current_child_id() reconnaît l''appareil');
select t.ok((select count(*) from public.access_policies) = 1
            and (select child_id from public.access_policies) = :'c1'::uuid, 'T1 l''appareil lit SES règles (et seulement les siennes)');
insert into public.usage_daily (family_id, child_id, device_id, day, package_name, total_foreground_ms)
values (:'f1', :'c1', :'d1', current_date, 'com.exemple.jeu', 1000);
insert into public.requests (family_id, child_id, device_id, kind) values (:'f1', :'c1', :'d1', 'extra_time');
select t.ok(true, 'T1 l''appareil écrit ses métriques et ses demandes (RLS côté enfant)');
reset role;

-- =============================================================================
-- T2 — Code déjà utilisé
-- =============================================================================
select t.act(:'A2', true); set role authenticated;
select t.ok((public.pairing_complete(:'code1', '{}'::jsonb)) ->> 'error' = 'code_already_used', 'T2 code déjà utilisé → code_already_used');
reset role;

-- =============================================================================
-- T3 — Code expiré
-- =============================================================================
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c2'))->>'code' as code_exp \gset
reset role;
update public.pairing_codes set expires_at = now() - interval '1 minute' where child_id = :'c2' and consumed_at is null;
select t.act(:'A3', true); set role authenticated;
select t.ok((public.pairing_complete(:'code_exp', '{}'::jsonb)) ->> 'error' = 'code_expired', 'T3 code expiré → code_expired');
reset role;
select t.ok(not exists (select 1 from public.devices where auth_user_id = :'A3'), 'T3 aucun appareil créé');

-- =============================================================================
-- T4 — Format invalide / appareil invalide / non authentifié / rôle anon
-- =============================================================================
select t.act(:'A4', true); set role authenticated;
select t.ok((public.pairing_complete('abcdefgh', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T4 8 lettres → invalid_code_format');
select t.ok((public.pairing_complete('12345678', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T4 ancien format (8 chiffres) → invalid_code_format');
select t.ok((public.pairing_complete('123456789', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T4 9 chiffres → invalid_code_format');
select t.ok((public.pairing_complete(null, '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T4 null → invalid_code_format');
reset role;
select t.act(:'A6', true); set role authenticated;
select t.ok((public.pairing_complete('7KQ2MX9D4F', '{"platform":"symbian"}'::jsonb)) ->> 'error' = 'invalid_device', 'T4 plateforme inconnue → invalid_device');
select t.ok((public.pairing_complete('7KQ2MX9D4F', '"pas un objet"'::jsonb)) ->> 'error' = 'invalid_device', 'T4 p_device non objet → invalid_device');
select t.ok((public.pairing_complete('7KQ2MX9D4F', jsonb_build_object('public_key', repeat('k', 5000)))) ->> 'error' = 'invalid_device',
            'T4 clé publique trop longue → invalid_device');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
set role authenticated;
select t.ok((public.pairing_complete('7KQ2MX9D4F', '{}'::jsonb)) ->> 'error' = 'not_authenticated', 'T4 jeton sans sub → not_authenticated');
reset role;
set role anon;
select t.err($$select public.pairing_complete('7KQ2MX9D4F', '{}'::jsonb)$$, 'permission denied', 'T4 rôle anon (sans session) ne peut pas appeler la RPC');
reset role;

-- =============================================================================
-- T5 — Limite de tentatives PAR UTILISATEUR (5 échecs / 15 min)
-- =============================================================================
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c2'))->>'code' as code2 \gset
reset role;
select t.act(:'A7', true); set role authenticated;
select t.ok((public.pairing_complete(lpad(i::text, 10, '9'), '{}'::jsonb)) ->> 'error' = 'code_not_found',
            'T5 essai ' || i || ' → code_not_found')
from generate_series(1, 5) i;
select public.pairing_complete(:'code2', '{}'::jsonb) as r_lim \gset
reset role;
select t.ok(:'r_lim'::jsonb ->> 'error' = 'too_many_attempts' and (:'r_lim'::jsonb ->> 'retry_after_seconds')::int > 0,
            'T5 6e essai (même avec un BON code) → too_many_attempts + retry_after_seconds');
select t.ok((select consumed_at is null from public.pairing_codes where child_id = :'c2' and expires_at > now()),
            'T5 le bon code n''a pas été consommé par l''utilisateur bloqué');
select t.ok((select count(*) from app.pairing_attempts where user_id = :'A7' and not succeeded) = 5,
            'T5 les échecs sont journalisés malgré le retour d''erreur (pas de rollback)');

-- A8 appaire Bob (C2) avec ce code : appareil d'un AUTRE enfant de la même famille.
select t.act(:'A8', true); set role authenticated;
select public.pairing_complete(:'code2', '{"platform":"android","model":"Galaxy"}'::jsonb) as r8 \gset
reset role;
select :'r8'::jsonb ->> 'device_id' as d8 \gset
select t.ok((:'r8'::jsonb ->> 'child_id') = :'c2', 'T5 un autre utilisateur appaire normalement avec ce code');

-- =============================================================================
-- T6 — Compte parent refusé ; appareil déjà appairé refusé
-- =============================================================================
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c1'))->>'code' as code3 \gset
select t.ok((public.pairing_complete(:'code3', '{}'::jsonb)) ->> 'error' = 'anonymous_session_required',
            'T6 compte parent (non anonyme) → anonymous_session_required');
reset role;
select (select count(*) from app.pairing_attempts where user_id = :'A1') as a1_attempts \gset
select t.act(:'A1', true); set role authenticated;
select public.pairing_complete(:'code3', '{}'::jsonb) as r_replay \gset
reset role;
select t.ok(not (:'r_replay'::jsonb ? 'error')
            and (:'r_replay'::jsonb ->> 'device_id') = :'d1'
            and (:'r_replay'::jsonb ->> 'family_id') = :'f1'
            and (:'r_replay'::jsonb ->> 'child_id') = :'c1'
            and (:'r_replay'::jsonb ->> 'mode') = 'standard'
            and (:'r_replay'::jsonb ->> 'already_paired')::boolean,
            'T6 rejeu par la session déjà appairée → même résultat (idempotent, already_paired)');
select t.ok((select count(*) from app.pairing_attempts where user_id = :'A1') = :a1_attempts
            and (select count(*) from public.devices where auth_user_id = :'A1') = 1,
            'T6 rejeu : aucun échec compté, aucun appareil en plus');
select t.ok((select consumed_at is null from public.pairing_codes pc where pc.child_id = :'c1' and pc.expires_at > now() and consumed_at is null limit 1),
            'T6 code3 toujours disponible');

-- =============================================================================
-- T7 — Limite GLOBALE (100 échecs « essai de code » / 15 min)
-- =============================================================================
insert into auth.users (id, is_anonymous) select gen_random_uuid(), true from generate_series(1, 100);
insert into app.pairing_attempts (user_id, succeeded)
select id, false from auth.users where is_anonymous and email is null
  and id::text not like 'aaaaaaaa-%' limit 100;
-- Un appelant qui a déjà raté un code est bloqué par le plafond global.
select t.act(:'A14', true); set role authenticated;
select t.ok((public.pairing_complete('ZZZZZZZZZ8', '{}'::jsonb)) ->> 'error' = 'code_not_found',
            'T7 plafond atteint : 1er essai d''un appelant sans échec → traité (code_not_found)');
select t.ok((public.pairing_complete('ZZZZZZZZZ7', '{}'::jsonb)) ->> 'error' = 'too_many_attempts',
            'T7 plafond atteint : appelant ayant déjà raté un code → too_many_attempts');
reset role;
-- (T8 juste après : un appelant SANS échec appaire normalement MALGRÉ le plafond.)
-- =============================================================================
-- T8 — DEUX appareils pour le MÊME enfant
-- =============================================================================
select t.act(:'A9', true); set role authenticated;
select public.pairing_complete(:'code3', '{"platform":"android","model":"Tablette"}'::jsonb) as r9 \gset
reset role;
select :'r9'::jsonb ->> 'device_id' as d9 \gset
select t.ok((:'r9'::jsonb ->> 'child_id') = :'c1', 'T8 second appareil appairé au même enfant (Alice)');
select t.ok((select count(*) from app.pairing_attempts where not succeeded and counts_global
              and attempted_at > now() - interval '15 minutes') >= 100,
            'T7 le plafond global était bien atteint : il ne bloque pas un appelant sans échec (plus d''interrupteur global)');
delete from app.pairing_attempts where user_id in (select id from auth.users where is_anonymous and id::text not like 'aaaaaaaa-%');
-- Des échecs « format invalide » (même 100, de 20 sessions) ne remplissent PAS le compteur global.
insert into app.pairing_attempts (user_id, succeeded, counts_global)
select id, false, false from auth.users where is_anonymous and id::text not like 'aaaaaaaa-%' limit 100;
select t.act(:'A15', true); set role authenticated;
select t.ok((public.pairing_complete('x', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T7 format invalide → invalid_code_format');
select t.ok((public.pairing_complete('ZZZZZZZZZ6', '{}'::jsonb)) ->> 'error' = 'code_not_found', 'T7 100 échecs de format : pas de blocage global (1)');
select t.ok((public.pairing_complete('ZZZZZZZZZ5', '{}'::jsonb)) ->> 'error' = 'code_not_found', 'T7 100 échecs de format : pas de blocage global (2)');
reset role;
select t.ok((select bool_and(not counts_global) from app.pairing_attempts a join auth.users u on u.id = a.user_id
             where u.id = :'A4'), 'T7 les échecs de format sont hors compteur global');
delete from app.pairing_attempts where user_id in (select id from auth.users where is_anonymous and id::text not like 'aaaaaaaa-%');
delete from auth.users where is_anonymous and id::text not like 'aaaaaaaa-%';
select t.act(:'A9', true); set role authenticated;
select t.ok(app.current_child_id() = :'c1'::uuid, 'T8 current_child_id() = Alice pour le 2e appareil');
insert into public.usage_daily (family_id, child_id, device_id, day, package_name) values (:'f1', :'c1', :'d9', current_date, 'com.exemple.jeu');
select t.ok(true, 'T8 le 2e appareil écrit pour SON appareil');
select t.err(format('insert into public.usage_daily (family_id, child_id, device_id, day, package_name) values (%L, %L, %L, current_date, %L)',
                    :'f1', :'c1', :'d1', 'com.autre'),
             'row-level security', 'T8 un appareil ne peut PAS écrire au nom d''un autre appareil du même enfant');
reset role;
select t.act(:'A1', true); set role authenticated;
select t.ok(app.current_child_id() = :'c1'::uuid, 'T8 le 1er appareil fonctionne toujours');
reset role;

-- Hook JWT : child_id pour un appareil (exécuté comme supabase_auth_admin).
set role supabase_auth_admin;
select t.ok((public.custom_access_token_hook(jsonb_build_object('user_id', :'A9', 'claims', '{}'::jsonb)))
              #>> '{claims,app_metadata,child_id}' = :'c1', 'T8 hook : child_id ajouté pour un appareil appairé');
reset role;

-- =============================================================================
-- T9 — ISOLATION (autre famille, autre enfant de la même famille)
-- =============================================================================
-- Appareil de la famille 2 (pour vérifier l'isolation inverse puis le RGPD famille).
select t.act(:'P2', false); set role authenticated;
select (public.pairing_start(:'f2', :'c3'))->>'code' as code_f2 \gset
reset role;
select t.act(:'A13', true); set role authenticated;
select public.pairing_complete(:'code_f2', '{}'::jsonb) ->> 'device_id' as d13 \gset
reset role;

select t.act(:'A1', true); set role authenticated;
select t.ok((select count(*) from public.families) = 1 and (select id from public.families) = :'f1'::uuid, 'T9 l''appareil ne voit que SA famille');
select t.ok((select count(*) from public.children where family_id = :'f2') = 0, 'T9 aucun enfant d''une autre famille');
select t.ok((select count(*) from public.devices where family_id = :'f2') = 0, 'T9 aucun appareil d''une autre famille');
select t.ok((select count(*) from public.messages where child_id <> :'c1') = 0, 'T9 aucun message d''un autre enfant (frère/sœur ou autre famille)');
select t.ok((select count(*) from public.access_policies where child_id <> :'c1') = 0, 'T9 aucune règle d''un autre enfant');
select t.ok((select count(*) from public.usage_daily where child_id <> :'c1') = 0, 'T9 aucune métrique d''un autre enfant');
select t.ok((select count(*) from public.audit_log where subject_child_id is distinct from :'c1'::uuid) = 0, 'T9 audit : uniquement les entrées le concernant');
select t.ok((select count(*) from public.pairing_codes) = 0, 'T9 aucun code d''appairage visible');
select t.err(format('insert into public.usage_daily (family_id, child_id, device_id, day, package_name) values (%L, %L, %L, current_date, %L)',
                    :'f1', :'c2', :'d8', 'x'), 'row-level security', 'T9 écrire pour un autre enfant est refusé');
select t.err(format('insert into public.messages (family_id, child_id, sender, body) values (%L, %L, %L, %L)',
                    :'f2', :'c3', 'child', 'x'), 'row-level security', 'T9 écrire dans une autre famille est refusé');
select t.err(format('select app.audit(%L, %L)', :'f2', 'forge'), 'audit_forbidden', 'T9 app.audit refusé hors de sa famille');
select t.ok(not app.is_parent_of(:'f1'), 'T9 un appareil n''a jamais l''autorité parentale');
reset role;
select t.act(:'A13', true); set role authenticated;
select t.ok((select count(*) from public.families) = 1 and (select id from public.families) = :'f2'::uuid
            and (select count(*) from public.children) = 1, 'T9 isolation inverse (appareil famille 2)');
reset role;

-- =============================================================================
-- T10 — Session anonyme SANS appartenance : rien hors de pairing_complete
-- =============================================================================
select t.act(:'A10', true); set role authenticated;
select t.ok((select sum(n) from t.visible_rows()) = 0, 'T10 aucune ligne visible dans AUCUNE table publique');
select t.err($$select public.create_family('Pirate')$$, 'anonymous_forbidden', 'T10 create_family refusé à une session anonyme');
select t.err(format('select public.pairing_start(%L, %L)', :'f1', :'c1'), 'forbidden', 'T10 pairing_start refusé');
select t.err($$insert into public.families (name) values ('x')$$, 'row-level security', 'T10 insert families refusé');
select t.err(format('insert into public.memberships (family_id, user_id, role) values (%L, %L, %L)', :'f1', :'A10', 'owner'),
             'row-level security|anonyme', 'T10 s''auto-ajouter owner refusé');
select t.err(format('insert into public.children (family_id, display_name) values (%L, %L)', :'f1', 'x'), 'row-level security', 'T10 insert children refusé');
select t.err(format('insert into public.requests (family_id, child_id, kind) values (%L, %L, %L)', :'f1', :'c1', 'extra_time'),
             'row-level security', 'T10 insert requests refusé');
select t.err(format('select app.audit(%L, %L)', :'f1', 'forge'), 'audit_forbidden', 'T10 app.audit refusé');
select t.err($$select count(*) from app.pairing_attempts$$, 'permission denied', 'T10 journal des tentatives illisible');
select t.err($$select app.purge_orphan_device_users()$$, 'permission denied', 'T10 purge RGPD non exécutable par un client');
select t.ok(not app.is_member_of(:'f1') and app.current_child_id() is null, 'T10 helpers : ni membre, ni enfant');
reset role;
-- Seconde couche : même si le JWT ne porte pas is_anonymous, auth.users fait foi.
select set_config('request.jwt.claims', jsonb_build_object('sub', :'A10', 'role', 'authenticated')::text, false);
set role authenticated;
select t.err($$select public.create_family('Pirate')$$, 'anonymous_forbidden', 'T10 create_family refusé (auth.users.is_anonymous, sans claim)');
reset role;
-- Un APPAREIL appairé (anonyme, membre child) ne crée pas de famille non plus.
select t.act(:'A9', true); set role authenticated;
select t.err($$select public.create_family('Pirate')$$, 'anonymous_forbidden', 'T10 create_family refusé à un appareil appairé');
select t.err(format('select public.pairing_start(%L, %L)', :'f1', :'c1'), 'forbidden', 'T10 pairing_start refusé à un appareil appairé');
update public.devices set revoked_at = now() where id = :'d1';
reset role;
select t.ok((select revoked_at is null from public.devices where id = :'d1'), 'T10 un appareil ne peut pas révoquer un autre appareil (RLS)');

-- Garde-fous côté PARENT.
select t.act(:'P1', false); set role authenticated;
select t.err(format('insert into public.memberships (family_id, user_id, role) values (%L, %L, %L)', :'f1', :'A10', 'parent'),
             'anonyme', 'T10 un parent ne peut pas donner le rôle parent à un compte anonyme');
select t.err(format('insert into public.memberships (family_id, user_id, role) values (%L, %L, %L)', :'f1', :'A10', 'child'),
             'appairage', 'T10 un parent ne crée pas d''appartenance child à la main');
select t.err(format('update public.memberships set role = %L where user_id = %L', 'parent', :'A9'),
             'anonyme|enfant', 'T10 un appareil ne peut pas être promu parent');
select t.err(format('insert into public.devices (family_id, child_id, auth_user_id) values (%L, %L, %L)', :'f1', :'c1', :'A10'),
             'réservé', 'T10 un parent ne pose pas auth_user_id à la main');
select t.err(format('update public.devices set auth_user_id = %L where id = %L', :'A10', :'d9'),
             'pas modifiable', 'T10 un parent ne change pas auth_user_id');
select t.err(format('update public.devices set child_id = %L where id = %L', :'c2', :'d9'),
             'ni d''enfant', 'T10 un appareil appairé ne change pas d''enfant');
reset role;

-- =============================================================================
-- T11 — RÉVOCATION : coupure immédiate et définitive
-- =============================================================================
select t.act(:'P1', false); set role authenticated;
update public.devices set revoked_at = now() where id = :'d1';
reset role;
select t.ok(not exists (select 1 from public.memberships where user_id = :'A1'), 'T11 appartenance child supprimée à la révocation');
select t.ok(exists (select 1 from public.audit_log where action = 'device.revoked' and target_id = :'d1' and actor_id = :'P1'),
            'T11 révocation journalisée (device.revoked)');
select t.act(:'A1', true); set role authenticated;
select t.ok(app.current_child_id() is null and not app.is_member_of(:'f1'), 'T11 helpers : plus enfant, plus membre');
select t.ok((select sum(n) from t.visible_rows()) = 0, 'T11 l''appareil révoqué ne voit plus AUCUNE ligne');
select t.err(format('insert into public.usage_daily (family_id, child_id, device_id, day, package_name) values (%L, %L, %L, current_date - 1, %L)',
                    :'f1', :'c1', :'d1', 'x'), 'row-level security', 'T11 l''appareil révoqué ne peut plus écrire');
select t.ok((public.pairing_complete('7KQ2MX9D4F', '{}'::jsonb)) ->> 'error' = 'device_already_paired',
            'T11 la session révoquée ne peut pas se ré-appairer (nouvelle session requise)');
reset role;
set role supabase_auth_admin;
select t.ok((public.custom_access_token_hook(jsonb_build_object('user_id', :'A1', 'claims', '{}'::jsonb)))
              #> '{claims,app_metadata}' = '{"families": []}'::jsonb, 'T11 hook : plus de famille ni de child_id');
reset role;
select t.act(:'A9', true); set role authenticated;
select t.ok(app.current_child_id() = :'c1'::uuid and app.is_member_of(:'f1'), 'T11 l''autre appareil du même enfant n''est pas affecté');
reset role;
select t.act(:'P1', false); set role authenticated;
select t.err(format('update public.devices set revoked_at = null where id = %L', :'d1'), 'définitive', 'T11 dé-révocation refusée (parent)');
reset role;
select t.err(format('update public.devices set revoked_at = null where id = %L', :'d1'), 'définitive', 'T11 dé-révocation refusée (même propriétaire)');

-- Suppression directe d'un appareil (au lieu de révoquer) : appartenance retirée aussi.
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c2'))->>'code' as code_del \gset
reset role;
select t.act(:'A6', true); set role authenticated;
select public.pairing_complete(:'code_del', '{}'::jsonb) ->> 'device_id' as d6 \gset
reset role;
select t.act(:'P1', false); set role authenticated;
delete from public.devices where id = :'d6';
reset role;
select t.ok(not exists (select 1 from public.memberships where user_id = :'A6'), 'T11 suppression d''un appareil → appartenance retirée');

-- =============================================================================
-- T12 — children.user_id : plus de détournement d'appareil (revue L12 #1)
-- =============================================================================
select id as d8 from public.devices where auth_user_id = :'A8' \gset
select t.act(:'P2', false); set role authenticated;
select t.errstate(format('update public.children set user_id = %L where id = %L', :'A8', :'c3'), '42501',
                  'T12 parent B pose children.user_id = appareil d''une AUTRE famille → 42501');
select t.errstate(format('update public.children set user_id = %L where id = %L', :'P1', :'c3'), '42501',
                  'T12 parent B pose children.user_id = parent d''une autre famille → 42501');
select t.errstate(format('insert into public.children (family_id, display_name, user_id) values (%L, %L, %L)', :'f2', 'Leurre', :'A8'), '42501',
                  'T12 insert d''un enfant leurre avec user_id → 42501');
reset role;
select t.act(:'P1', false); set role authenticated;
select t.errstate(format('update public.children set user_id = %L where id = %L', :'A8', :'c1'), '42501',
                  'T12 même famille : user_id = appareil d''un frère → 42501');
reset role;
-- Retour à NULL (délier un compte historique) toujours permis au parent.
update public.children set user_id = :'P1' where id = :'c3';   -- donnée forgée (superutilisateur)
select t.act(:'P2', false); set role authenticated;
update public.children set user_id = null where id = :'c3';
reset role;
select t.ok((select user_id is null from public.children where id = :'c3'), 'T12 remise à NULL de children.user_id permise au parent');

-- Donnée DÉJÀ détournée (antérieure au correctif, posée ici en superutilisateur) :
-- l'appareil garde SON enfant (lien appareil prioritaire), le hook aussi.
update public.children set user_id = :'A8' where id = :'c3';
select t.act(:'A8', true); set role authenticated;
select t.ok(app.current_child_id() = :'c2'::uuid, 'T12 détournement préexistant : current_child_id reste l''enfant de l''appareil');
select t.ok((select count(*) from public.access_policies where child_id = :'c2') = 1,
            'T12 l''appareil lit toujours SES règles (contrôle non désactivé)');
insert into public.sos_events (family_id, child_id, device_id) values (:'f1', :'c2', :'d8');
select t.ok(true, 'T12 le SOS de l''enfant fonctionne malgré le détournement');
select t.ok((select count(*) from public.messages where family_id = :'f2') = 0, 'T12 aucun message de la famille attaquante visible');
reset role;
set role supabase_auth_admin;
select t.ok((public.custom_access_token_hook(jsonb_build_object('user_id', :'A8', 'claims', '{}'::jsonb)))
              #>> '{claims,app_metadata,child_id}' = :'c2', 'T12 hook : child_id = enfant de l''appareil (pas le leurre)');
reset role;
update public.children set user_id = null where id = :'c3';
-- Même famille : user_id d'Alice = appareil de Bob → pas d'écriture sous l'identité d'Alice.
update public.children set user_id = :'A8' where id = :'c1';
select t.act(:'A8', true); set role authenticated;
select t.ok(app.current_child_id() = :'c2'::uuid, 'T12 même famille : current_child_id = Bob');
select t.ok(not app.device_belongs_to_current_child(:'d9'::uuid), 'T12 device_belongs : appareil d''Alice refusé à l''appareil de Bob');
select t.err(format('insert into public.usage_daily (family_id, child_id, device_id, day, package_name) values (%L, %L, %L, current_date, %L)',
                    :'f1', :'c1', :'d8', 'x'), 'row-level security', 'T12 même famille : télémétrie sous l''identité d''Alice refusée');
reset role;
update public.children set user_id = null where id = :'c1';
-- Variante : user_id = parent victime (donnée forgée) → le parent n'est pas bloqué.
update public.children set user_id = :'P1' where id = :'c3';
select t.act(:'P1', false); set role authenticated;
select t.ok(app.current_child_id() is null, 'T12 variante : un parent n''est pas « enfant » par children.user_id seul');
update public.memberships set role = 'owner' where user_id = :'P1' and family_id = :'f1';
select t.ok(true, 'T12 variante : la ligne memberships du parent reste modifiable');
reset role;
update public.children set user_id = null where id = :'c3';
-- Compte enfant HISTORIQUE (Edge Function) : reconnu SEULEMENT avec l'appartenance 'child'.
insert into auth.users (id, email, is_anonymous) values (:'LG', 'legacy@example.test', false);
insert into public.children (family_id, display_name, user_id) values (:'f2', 'Héritage', :'LG') returning id as clg \gset
select t.act(:'LG', false); set role authenticated;
select t.ok(app.current_child_id() is null, 'T12 héritage sans appartenance child → pas d''enfant courant');
reset role;
insert into public.memberships (family_id, user_id, role) values (:'f2', :'LG', 'child');
select t.act(:'LG', false); set role authenticated;
select t.ok(app.current_child_id() = :'clg'::uuid, 'T12 héritage avec appartenance child → enfant reconnu (compatibilité)');
reset role;
set role supabase_auth_admin;
select t.ok((public.custom_access_token_hook(jsonb_build_object('user_id', :'LG', 'claims', '{}'::jsonb)))
              #>> '{claims,app_metadata,child_id}' = :'clg', 'T12 hook : compte historique reconnu');
reset role;
select t.act(:'P2', false); set role authenticated;
delete from public.children where id = :'clg';
reset role;

-- =============================================================================
-- T13 — Validation avant verrou, tailles bornées, nettoyage bidi (revue #5, #8)
-- =============================================================================
select t.act(:'A16', true); set role authenticated;
select clock_timestamp() as t0 \gset
select t.ok((public.pairing_complete('7KQ2MX9D4F', jsonb_build_object('platform', 'android',
              'label', repeat(E'\u0001a', 2000000), 'model', repeat(E'\u0001a', 2000000)))) ->> 'error' = 'invalid_device',
            'T13 charge utile énorme (> 8 Kio) → invalid_device');
select t.ok(clock_timestamp() - :'t0'::timestamptz < interval '1 second', 'T13 rejet rapide (aucun regex sur les chaînes entières)');
select t.ok((public.pairing_complete(repeat('1', 100000), '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T13 code démesuré → invalid_code_format');
reset role;
select t.ok((select count(*) from app.pairing_attempts where user_id = :'A16' and not succeeded and not counts_global) = 2,
            'T13 invalid_device et invalid_code_format sont comptés (par utilisateur, hors global)');

-- =============================================================================
-- T14 — Pepper en table + rotation sans casser les codes en cours (revue #6),
--       un seul code actif par enfant (revue #7), nettoyage bidi (revue #8)
-- =============================================================================
set role authenticated;
select t.err($$select * from app.pairing_pepper$$, 'permission denied', 'T14 pepper illisible par un client');
select t.err($$select app.rotate_pairing_pepper()$$, 'permission denied', 'T14 rotation interdite à un client');
reset role;
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c1'))->>'code' as code_old \gset
select (public.pairing_start(:'f1', :'c1'))->>'code' as code_rot \gset
reset role;
select t.ok((select count(*) from public.pairing_codes where child_id = :'c1' and consumed_at is null and expires_at > now()) = 1,
            'T14 un seul code actif par enfant (le précédent expire)');
select t.act(:'A16', true); set role authenticated;
select t.ok((public.pairing_complete(:'code_old', '{}'::jsonb)) ->> 'error' = 'code_expired', 'T14 l''ancien code de l''enfant → code_expired');
reset role;
select app.rotate_pairing_pepper() \g /dev/null
-- GUC de session divergente (ancienne procédure 0028) : sans effet désormais.
set app.pairing_pepper = 'pepper-de-session-ignore';
select t.act(:'A17', true); set role authenticated;
select public.pairing_complete(:'code_rot', jsonb_build_object('platform', 'android',
         'label', E'‮enohp​ ⁦x⁩﻿', 'model', E'Pix\u0007el‍ 8')) as r17 \gset
reset role;
reset app.pairing_pepper;
select :'r17'::jsonb ->> 'device_id' as d17 \gset
select t.ok((:'r17'::jsonb ->> 'child_id') = :'c1', 'T14 code émis AVANT la rotation du pepper → toujours valide (10 min)');
select t.ok((select label = 'enohpx' and model = 'Pixel 8' from public.devices where id = :'d17'),
            'T14 caractères bidi / largeur nulle / séparateurs retirés de label et model');
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c1'))->>'code' as code_stale \gset
update public.devices set revoked_at = now() where id = :'d17';
reset role;
select app.rotate_pairing_pepper() \g /dev/null
update app.pairing_pepper set rotated_at = now() - interval '11 minutes';
select t.act(:'A18', true); set role authenticated;
select t.ok((public.pairing_complete(:'code_stale', '{}'::jsonb)) ->> 'error' = 'code_not_found',
            'T14 ancien pepper oublié après 10 min');
reset role;

-- Plafond de codes actifs par famille (5).
select t.act(:'P2', false); set role authenticated;
insert into public.children (family_id, display_name)
select :'f2', 'Cap ' || i from generate_series(1, 6) i;
select public.pairing_start(:'f2', c.id) from public.children c
 where c.family_id = :'f2' and c.display_name like 'Cap %' and c.display_name <> 'Cap 6' \g /dev/null
select t.ok((select count(*) from public.pairing_codes where family_id = :'f2' and consumed_at is null and expires_at > now()) = 5,
            'T14 5 codes actifs dans la famille 2');
select t.err(format('select public.pairing_start(%L, (select id from public.children where display_name = %L))', :'f2', 'Cap 6'),
             'too_many_active_codes', 'T14 6e code actif dans la famille → too_many_active_codes');
reset role;
delete from public.children where display_name like 'Cap %';

-- =============================================================================
-- T15 — Rétention : pairing_attempts purgé à 24 h par app.run_data_retention (#13)
-- =============================================================================
insert into app.pairing_attempts (user_id, succeeded, attempted_at) values (:'A16', false, now() - interval '25 hours');
select (app.run_data_retention() ->> 'pairing_attempts')::int as n_ret \gset
select t.ok(:n_ret >= 1 and not exists (select 1 from app.pairing_attempts where attempted_at < now() - interval '24 hours'),
            'T15 run_data_retention purge les tentatives de plus de 24 h');
set role authenticated;
select t.err($$select app.run_data_retention()$$, 'permission denied', 'T15 rétention non exécutable par un client');
reset role;

-- =============================================================================
-- T16 — CODE D'APPAIRAGE LONG (décision LOT 12 : pas de CAPTCHA) : 10 caractères
--       base32 Crockford, saisie normalisée ; SESSION ANONYME exigée.
-- =============================================================================
\set A21 'aaaaaaaa-0000-0000-0000-000000000021'
\set A22 'aaaaaaaa-0000-0000-0000-000000000022'
\set A23 'aaaaaaaa-0000-0000-0000-000000000023'
\set A24 'aaaaaaaa-0000-0000-0000-000000000024'
\set A25 'aaaaaaaa-0000-0000-0000-000000000025'
\set A26 'aaaaaaaa-0000-0000-0000-000000000026'
\set A27 'aaaaaaaa-0000-0000-0000-000000000027'
\set N1  '55555555-5555-5555-5555-555555555555'
insert into auth.users (id, is_anonymous)
select ('aaaaaaaa-0000-0000-0000-0000000000' || i)::uuid, true from generate_series(21, 27) i;
insert into auth.users (id, email, is_anonymous) values (:'N1', 'adulte@example.test', false);

-- 16a) L'expression régulière de format suit EXACTEMENT l'alphabet (aucune
--      dépendance à la collation) : 32 symboles admis, I, L, O, U refusés.
select t.ok((select bool_and(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', i, 1) ~ '^[0-9A-HJKMNP-TV-Z]$')
             from generate_series(1, 32) i)
            and (select bool_and(not (c ~ '^[0-9A-HJKMNP-TV-Z]$'))
                 from unnest(array['I','L','O','U','a','z','-',' ','_','É','Ø']) c),
            'T16 regex de format = alphabet Crockford (32 symboles ; I, L, O, U, minuscules, séparateurs refusés)');

-- 16b) Génération : échantillon de 1 000 codes (enfant dédié, supprimé ensuite).
select t.act(:'P1', false); set role authenticated;
insert into public.children (family_id, display_name) values (:'f1', 'Échantillon') returning id as cs \gset
reset role;
create table t.sample (n serial, r jsonb);
grant insert, select on t.sample to authenticated;
grant usage on sequence t.sample_n_seq to authenticated;
select t.act(:'P1', false); set role authenticated;
insert into t.sample (r) select public.pairing_start(:'f1', :'cs') from generate_series(1, 1000);
reset role;
create temp view sample_codes as select n, r ->> 'code' as code, r ->> 'code_display' as display from t.sample;
select t.ok((select count(*) from sample_codes) = 1000, 'T16 1 000 codes générés');
select t.ok((select bool_and(code ~ '^[0-9A-HJKMNP-TV-Z]{10}$' and char_length(code) = 10) from sample_codes),
            'T16 les 1 000 codes ont 10 caractères de l''alphabet Crockford');
select t.ok((select bool_and(code !~ '[ILOU]') from sample_codes), 'T16 aucun I, L, O ni U dans les 1 000 codes');
select t.ok((select count(distinct code) from sample_codes) = 1000, 'T16 1 000 codes distincts');
select t.ok((select bool_and(display = left(code, 5) || '-' || right(code, 5)) from sample_codes),
            'T16 code_display = groupe 5 + « - » + groupe 5');
select t.ok((select bool_and(app.pairing_code_normalize(code) = code and app.pairing_code_normalize(display) = code) from sample_codes),
            'T16 normaliser un code généré (brut ou groupé) le laisse inchangé');
-- Répartition des 10 000 symboles : 312,5 attendus par symbole (écart type ≈ 17,4) ;
-- bornes à plus de 6 écarts types : un tirage biaisé (ex. modulo non uniforme) échoue.
select t.ok((select count(*) = 32 and min(k) >= 200 and max(k) <= 430
             from (select ch, count(*) k
                   from sample_codes, regexp_split_to_table(code, '') ch group by ch) x),
            'T16 les 32 symboles apparaissent, répartition uniforme (200 ≤ n ≤ 430 sur 10 000)');
select t.ok((select count(*) from sample_codes s
             join public.pairing_codes pc on pc.code_hash = app.pairing_code_hash(s.code, false)
             where pc.child_id = :'cs') = 1000,
            'T16 le hash stocké est celui de la forme normalisée (les 1 000)');
select t.ok((select count(*) from public.pairing_codes where child_id = :'cs' and consumed_at is null and expires_at > now()) = 1,
            'T16 un seul code actif pour l''enfant après 1 000 générations');
select code as code_s from sample_codes order by n desc limit 1 \gset

-- 16c) Normalisation (fonction pure).
select t.ok(app.pairing_code_normalize('7kq2m-x9d4f') = '7KQ2MX9D4F', 'T16 normalisation : minuscules → majuscules, tiret retiré');
select t.ok(app.pairing_code_normalize(E' 7KQ2M \t X9D4F\n') = '7KQ2MX9D4F', 'T16 normalisation : espaces, tabulation, saut de ligne retirés');
select t.ok(app.pairing_code_normalize(E'7KQ2M – X9D4F') = '7KQ2MX9D4F', 'T16 normalisation : espace insécable et tiret demi-cadratin retirés');
select t.ok(app.pairing_code_normalize(E'7KQ2M​X9D4F﻿') = '7KQ2MX9D4F', 'T16 normalisation : caractères de largeur nulle (copier-coller) retirés');
select t.ok(app.pairing_code_normalize('oOiIlL-2345') = '0011112345', 'T16 normalisation Crockford : O → 0, I → 1, L → 1 (min. et maj.)');
select t.ok(app.pairing_code_normalize('UUUUU') = 'UUUUU' and app.pairing_code_normalize(null) is null,
            'T16 normalisation : U n''a pas d''équivalent (refusé ensuite), NULL → NULL');

-- 16d) Session NON anonyme refusée (avant tout essai : rien n'est journalisé,
--      le code valide n'est pas consommé).
select set_config('request.jwt.claims', jsonb_build_object('sub', :'N1', 'role', 'authenticated', 'is_anonymous', false)::text, false);
set role authenticated;
select t.ok((public.pairing_complete(:'code_s', '{}'::jsonb)) ->> 'error' = 'anonymous_session_required',
            'T16 compte e-mail (non anonyme, sans famille) → anonymous_session_required');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'N1', 'role', 'authenticated', 'is_anonymous', true)::text, false);
set role authenticated;
select t.ok((public.pairing_complete(:'code_s', '{}'::jsonb)) ->> 'error' = 'anonymous_session_required',
            'T16 claim is_anonymous = true mais auth.users.is_anonymous = false → anonymous_session_required');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'A27', 'role', 'authenticated', 'is_anonymous', false)::text, false);
set role authenticated;
select t.ok((public.pairing_complete(:'code_s', '{}'::jsonb)) ->> 'error' = 'anonymous_session_required',
            'T16 auth.users anonyme mais claim is_anonymous = false → anonymous_session_required');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'A27', 'role', 'authenticated')::text, false);
set role authenticated;
select t.ok((public.pairing_complete(:'code_s', '{}'::jsonb)) ->> 'error' = 'anonymous_session_required',
            'T16 claim is_anonymous absent → anonymous_session_required');
reset role;
select t.ok(not exists (select 1 from app.pairing_attempts where user_id in (:'N1', :'A27'))
            and not exists (select 1 from public.devices where auth_user_id in (:'N1', :'A27'))
            and (select consumed_at is null from public.pairing_codes where code_hash = app.pairing_code_hash(:'code_s', false)),
            'T16 refus de session non anonyme : aucune tentative journalisée, aucun appareil, code intact');

-- 16e) Appairage avec une saisie « négligée » : minuscules, espaces, tiret.
select t.act(:'A21', true); set role authenticated;
select public.pairing_complete('  ' || lower(left(:'code_s', 5)) || ' - ' || lower(right(:'code_s', 5)) || ' ',
                               '{"platform":"android","model":"Saisie"}'::jsonb) as r21 \gset
reset role;
select t.ok(:'r21'::jsonb ->> 'child_id' = :'cs', 'T16 code saisi en minuscules avec espaces et tiret → appairage réussi');
-- Équivalences O/I/L : code connu contenant 0 et 1, saisi avec o, I, l.
insert into public.pairing_codes (family_id, child_id, code_hash, mode, expires_at, created_by)
values (:'f1', :'cs', app.pairing_code_hash('0A1B0C1D2E', false), 'standard', now() + interval '10 minutes', :'P1');
select t.act(:'A22', true); set role authenticated;
select public.pairing_complete('oa-Ib OC-lD 2e', '{"platform":"android"}'::jsonb) as r22 \gset
reset role;
select t.ok(:'r22'::jsonb ->> 'child_id' = :'cs', 'T16 « oa-Ib OC-lD 2e » ≡ 0A1B0C1D2E (O→0, I/L→1) → appairage réussi');

-- 16f) Formats invalides → invalid_code_format, hors compteur global
--      (au plus 4 essais par compte : la limite par utilisateur est de 5).
select t.act(:'A23', true); set role authenticated;
select t.ok((public.pairing_complete('7KQ2MX9D4', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 9 caractères → invalid_code_format');
select t.ok((public.pairing_complete('7KQ2M-X9D4F-A', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 11 caractères → invalid_code_format');
select t.ok((public.pairing_complete('7KQ2M-X9D4U', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 lettre U (hors alphabet) → invalid_code_format');
select t.ok((public.pairing_complete('7KQ2M_X9D4F', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 séparateur « _ » → invalid_code_format');
reset role;
select t.act(:'A24', true); set role authenticated;
select t.ok((public.pairing_complete('7KQ2M+X9D4F', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 « + » → invalid_code_format');
select t.ok((public.pairing_complete('7KQ2MX9D4É', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 lettre accentuée → invalid_code_format');
select t.ok((public.pairing_complete(' - - ', '{}'::jsonb)) ->> 'error' = 'invalid_code_format', 'T16 uniquement des séparateurs → invalid_code_format');
select t.ok((public.pairing_complete(repeat(' ', 60) || '7KQ2MX9D4F', '{}'::jsonb)) ->> 'error' = 'invalid_code_format',
            'T16 saisie de plus de 64 octets → invalid_code_format (borne avant normalisation)');
reset role;
select t.ok((select count(*) from app.pairing_attempts where user_id in (:'A23', :'A24') and not succeeded and not counts_global) = 8,
            'T16 les 8 formats invalides sont comptés par utilisateur, hors compteur global');
select t.act(:'A25', true); set role authenticated;
select t.ok((public.pairing_complete('ZZZZZ-ZZZZZ', '{}'::jsonb)) ->> 'error' = 'code_not_found', 'T16 format valide inconnu → code_not_found');
reset role;
select t.ok((select counts_global from app.pairing_attempts where user_id = :'A25'), 'T16 un essai de code bien formé compte pour le plafond global');
select t.act(:'A26', true); set role authenticated;
select t.ok((public.pairing_complete(:'code_s', '{}'::jsonb)) ->> 'error' = 'code_already_used', 'T16 code normalisé déjà utilisé → code_already_used');
reset role;

-- Nettoyage : l'enfant de l'échantillon et ses appareils (appartenances retirées).
delete from public.children where id = :'cs';
select t.ok(not exists (select 1 from public.memberships where user_id in (:'A21', :'A22')), 'T16 nettoyage : appartenances des appareils retirées');
delete from auth.users where id = :'N1';
drop view sample_codes;
drop table t.sample;

-- Préparation du test de course (code pour Bob, conservé en clair dans t.race).
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c2'))->>'code' as code_race \gset
reset role;
insert into t.race (code) values (:'code_race');

\echo == tests principaux terminés
