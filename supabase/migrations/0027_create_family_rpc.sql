-- =============================================================================
-- Création de famille via RPC SECURITY DEFINER (remplace l'Edge Function
-- `create-family`).
--
-- POURQUOI : sous le nouveau système de clés API Supabase, la clé service_role
-- n'est pas disponible de façon fiable côté Edge Functions ; `create-family`
-- s'exécutait alors sous un rôle non privilégié et échouait sur la RLS
-- (« permission denied for schema app »). Une RPC SECURITY DEFINER s'exécute comme
-- le propriétaire (postgres) : elle contourne proprement la RLS pour l'insert
-- atomique familles + appartenance owner, sans dépendre d'aucune clé service.
--
-- Garde-fou : exige un appelant authentifié (auth.uid()). La console appelle
--   supabase.rpc('create_family', { p_name: '<nom du foyer>' }).
-- Additif / idempotent (create or replace).
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
