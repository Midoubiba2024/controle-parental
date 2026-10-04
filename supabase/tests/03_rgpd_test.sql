-- =============================================================================
-- Tests RGPD (LOT 12) : effacement d'un enfant / d'une famille (0022) → appareils
-- et appartenances d'appareils nettoyés ; purge des utilisateurs anonymes
-- orphelins (app.purge_orphan_device_users). Lancé par run.sh après 01 et 02.
-- =============================================================================
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\set P1  '11111111-1111-1111-1111-111111111111'
\set P2  '22222222-2222-2222-2222-222222222222'
\set A8  'aaaaaaaa-0000-0000-0000-000000000008'
\set A9  'aaaaaaaa-0000-0000-0000-000000000009'
\set A13 'aaaaaaaa-0000-0000-0000-000000000013'
\set A19 'aaaaaaaa-0000-0000-0000-000000000019'
\set P3  '44444444-4444-4444-4444-444444444444'

select id as f1 from public.families where name = 'Famille Une' \gset
select id as f2 from public.families where name = 'Famille Deux' \gset
select id as c1 from public.children where display_name = 'Alice' \gset
select id as c2 from public.children where display_name = 'Bob' \gset

-- --- Effacement d'un ENFANT (Alice : 1 appareil révoqué + 1 appareil actif) -----
select t.ok((select count(*) from public.devices where child_id = :'c1') = 3
            and (select count(*) from public.devices where child_id = :'c1' and revoked_at is null) = 1,
            'RGPD état initial : Alice a 3 appareils (2 révoqués, 1 actif)');
select t.act(:'P1', false); set role authenticated;
select public.rgpd_delete_child(:'c1') \g /dev/null
reset role;
select t.ok(not exists (select 1 from public.devices where child_id = :'c1'), 'RGPD enfant : ses appareils sont supprimés (cascade)');
select t.ok(not exists (select 1 from public.memberships where user_id = :'A9'), 'RGPD enfant : appartenance de son appareil actif supprimée');
select t.ok(exists (select 1 from public.audit_log where action = 'rgpd.delete_child' and subject_child_id is null and family_id = :'f1'),
            'RGPD enfant : trace d''effacement conservée (subject_child_id → NULL)');
select t.act(:'A9', true); set role authenticated;
select t.ok(app.current_child_id() is null and (select sum(n) from t.visible_rows()) = 0,
            'RGPD enfant : l''appareil de l''enfant effacé ne voit plus rien');
reset role;
select t.act(:'A8', true); set role authenticated;
select t.ok(app.current_child_id() = :'c2'::uuid, 'RGPD enfant : l''appareil du frère n''est pas affecté');
reset role;

-- --- Effacement d'une FAMILLE (famille 2 : 1 appareil appairé) -----------------
select t.act(:'P2', false); set role authenticated;
select public.rgpd_delete_family(:'f2') \g /dev/null
reset role;
select t.ok(not exists (select 1 from public.families where id = :'f2')
            and not exists (select 1 from public.devices where auth_user_id = :'A13')
            and not exists (select 1 from public.memberships where user_id = :'A13'),
            'RGPD famille : appareils et appartenances d''appareils supprimés');

-- --- Compte auth d'un appareil ACTIF supprimé directement (revue L12 #11) ------
select t.act(:'P1', false); set role authenticated;
select (public.pairing_start(:'f1', :'c2'))->>'code' as code19 \gset
reset role;
select t.act(:'A19', true); set role authenticated;
select public.pairing_complete(:'code19', '{"platform":"android","model":"Zombie"}'::jsonb) ->> 'device_id' as d19 \gset
reset role;
delete from auth.users where id = :'A19';   -- tableau de bord Auth / script de nettoyage
select t.ok((select auth_user_id is null and revoked_at is not null from public.devices where id = :'d19'),
            'ZOMBIE compte supprimé → appareil marqué révoqué (plus affiché actif)');
select t.ok(exists (select 1 from public.audit_log where action = 'device.revoked' and target_id = :'d19'
                    and detail ->> 'via' = 'auth_user_deleted'), 'ZOMBIE révocation journalisée (via auth_user_deleted)');
select t.ok(not exists (select 1 from public.memberships where user_id = :'A19'), 'ZOMBIE appartenance supprimée');

-- --- Suppression d'un compte (co-)PARENT auteur d'une commande / d'un acquittement SOS (#12)
insert into auth.users (id, email, is_anonymous) values (:'P3', 'parent3@example.test', false);
insert into public.memberships (family_id, user_id, role) values (:'f1', :'P3', 'parent');
select id as d8 from public.devices where auth_user_id = :'A8' \gset
select t.act(:'A8', true); set role authenticated;
insert into public.sos_events (family_id, child_id, device_id, message) values (:'f1', :'c2', :'d8', 'Au secours') returning id as sos3 \gset
reset role;
select t.act(:'P3', false); set role authenticated;
insert into public.commands (family_id, child_id, device_id, type, created_by) values (:'f1', :'c2', :'d8', 'lock_now', :'P3') returning id as cmd3 \gset
update public.sos_events set status = 'acked', acked_by = :'P3', acked_at = now() where id = :'sos3';
reset role;
-- Un appareil ne peut pas « désattribuer » l'acquittement / la commande.
select t.act(:'A8', true); set role authenticated;
select t.err(format('update public.sos_events set acked_by = null where id = %L', :'sos3'), 'seule la clôture',
             'COPARENT un appareil ne peut pas effacer acked_by');
select t.err(format('update public.commands set created_by = null where id = %L', :'cmd3'), 'accusé de réception',
             'COPARENT un appareil ne peut pas effacer created_by d''une commande');
reset role;
delete from auth.users where id = :'P3';
select t.ok(not exists (select 1 from auth.users where id = :'P3'), 'COPARENT suppression du compte parent réussie (commande + SOS acquitté)');
select t.ok((select created_by is null and type = 'lock_now' from public.commands where id = :'cmd3'),
            'COPARENT commande conservée, auteur effacé');
select t.ok((select acked_by is null and acked_at is not null and status = 'acked' from public.sos_events where id = :'sos3'),
            'COPARENT SOS conservé (acquitté), acked_by effacé');

-- --- Purge des utilisateurs anonymes orphelins ---------------------------------
-- Le gagnant de la course (appareil actif de Bob) est révoqué : il devient
-- orphelin, son appareil doit rester (historique) avec auth_user_id → NULL.
select id as d_race, auth_user_id as u_race from public.devices
 where auth_user_id in ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000012') \gset
-- Avant révocation, l'appareil a écrit des lignes qui portent son compte comme
-- auteur (audit device.enrolled, message, pause de confidentialité close) : la
-- purge doit pouvoir les « désattribuer » (ON DELETE SET NULL) sans casser
-- l'immutabilité.
select t.act(:'u_race', true); set role authenticated;
insert into public.messages (family_id, child_id, sender, body) values (:'f1', :'c2', 'child', 'Coucou');
insert into public.privacy_pauses (family_id, child_id, device_id, created_by) values (:'f1', :'c2', :'d_race', :'u_race');
update public.privacy_pauses set ended_at = now() where device_id = :'d_race';
reset role;
select t.ok((select created_by = :'u_race'::uuid from public.messages where body = 'Coucou'), 'PURGE préalable : message attribué à l''appareil');

select t.act(:'P1', false); set role authenticated;
update public.devices set revoked_at = now() where id = :'d_race';
reset role;

select t.ok(app.purge_orphan_device_users() = 0, 'PURGE délai par défaut (7 j) : aucun compte récent supprimé');
select count(*) as n_anon_before from auth.users where is_anonymous \gset
select app.purge_orphan_device_users(interval '0 seconds') as n_purged \gset
select t.ok(:n_purged = :n_anon_before - 1, 'PURGE ' || :n_purged || ' comptes anonymes orphelins supprimés (sur ' || :n_anon_before || ')');
select t.ok(exists (select 1 from auth.users where id = :'A8'), 'PURGE l''appareil ACTIF (A8) est conservé');
select t.ok((select count(*) from auth.users where id in (:'P1', :'P2')) = 2, 'PURGE les comptes parents ne sont jamais touchés');
select t.ok((select auth_user_id is null and revoked_at is not null from public.devices where id = :'d_race'),
            'PURGE l''appareil révoqué garde son historique (auth_user_id → NULL)');
select t.ok(not exists (select 1 from app.pairing_attempts where user_id not in (select id from auth.users)),
            'PURGE le journal des tentatives suit (cascade)');
select t.act(:'A8', true); set role authenticated;
select t.ok(app.current_child_id() = :'c2'::uuid, 'PURGE l''appareil actif fonctionne toujours');
reset role;
select t.ok((select created_by is null and body = 'Coucou' from public.messages where body = 'Coucou'),
            'PURGE message conservé, auteur effacé (SET NULL autorisé)');
select t.ok((select count(*) from public.privacy_pauses where device_id = :'d_race' and created_by is null and ended_at is not null) = 1,
            'PURGE pause conservée, auteur effacé');
select t.ok(exists (select 1 from public.audit_log where action = 'device.enrolled' and target_id = :'d_race'
                    and actor_id is null and actor_role = 'child'),
            'PURGE audit device.enrolled conservé (actor_id → NULL, actor_role conservé)');
-- L'immutabilité du CONTENU reste entière.
select t.err($$update public.audit_log set action = 'falsifié' where action = 'device.enrolled'$$, 'append-only', 'PURGE audit_log : contenu toujours immuable');
select t.err(format('update public.audit_log set actor_id = %L where actor_id is null', :'P1'), 'append-only', 'PURGE audit_log : actor_id NULL → valeur refusé');
select t.err($$update public.messages set body = 'falsifié' where body = 'Coucou'$$, 'immuable', 'PURGE messages : corps toujours immuable');

\echo == tests RGPD terminés
