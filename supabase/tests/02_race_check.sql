-- =============================================================================
-- Vérification du test de COURSE (lancé par run.sh) : deux connexions psql ont
-- appelé pairing_complete EN PARALLÈLE avec le MÊME code (A11 puis A12, la
-- première gardant sa transaction ouverte 2 s). Un seul succès attendu.
-- Variables psql : r1, r2 = réponses JSON des deux connexions.
-- =============================================================================
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\set A11 'aaaaaaaa-0000-0000-0000-000000000011'
\set A12 'aaaaaaaa-0000-0000-0000-000000000012'

select t.ok(((:'r1'::jsonb ? 'device_id')::int + (:'r2'::jsonb ? 'device_id')::int) = 1,
            'RACE exactement UN des deux appels concurrents réussit');
select t.ok(coalesce(:'r1'::jsonb ->> 'error', :'r2'::jsonb ->> 'error') = 'code_already_used',
            'RACE l''autre reçoit code_already_used');
select t.ok((select count(*) from public.devices where auth_user_id in (:'A11', :'A12')) = 1,
            'RACE une seule ligne devices créée');
select t.ok((select count(*) from public.memberships where user_id in (:'A11', :'A12')) = 1,
            'RACE une seule appartenance child créée');
select t.ok((select count(*) from public.audit_log a join public.devices d on d.id = a.target_id
             where a.action = 'device.enrolled' and d.auth_user_id in (:'A11', :'A12')) = 1,
            'RACE un seul audit device.enrolled');
