-- Génération d'un code d'appairage via RPC SECURITY DEFINER (remplace l'Edge
-- Function `pairing-start`, inopérante faute de clé service_role côté Edge Functions).
-- Le code n'est renvoyé EN CLAIR qu'une fois ; seul son hash SHA-256 est stocké.
-- Source aléatoire cryptographique (pgcrypto gen_random_bytes). Pepper optionnel via
-- le paramètre serveur `app.pairing_pepper` (défaut '' ; le propriétaire peut le
-- définir : alter database postgres set app.pairing_pepper = '<secret>').
-- Garde-fou : appelant authentifié owner/parent/guardian de la famille, enfant de
-- cette famille. Appel console : supabase.rpc('pairing_start', { p_family_id, p_child_id, p_mode }).
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
  v_uid     uuid := auth.uid();
  v_role    text;
  v_mode    text := case when p_mode = 'reinforced' then 'reinforced' else 'standard' end;
  v_code    text;
  v_hash    text;
  v_expires timestamptz := now() + interval '10 minutes';
  v_pepper  text := coalesce(current_setting('app.pairing_pepper', true), '');
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
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

  -- Code à 8 chiffres, tiré d'une source CSPRNG, puis haché avant stockage.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48)::bigint % 100000000)::text, 8, '0');
  v_hash := encode(extensions.digest(v_pepper || ':' || v_code, 'sha256'), 'hex');

  insert into public.pairing_codes (family_id, child_id, code_hash, mode, expires_at, created_by)
  values (p_family_id, p_child_id, v_hash, v_mode::app.device_mode, v_expires, v_uid);

  perform app.audit(p_family_id, 'pairing.code_created', p_child_id, 'pairing_codes', null::uuid,
                    jsonb_build_object('mode', v_mode, 'ttl_minutes', 10, 'via', 'pairing_start_rpc'));

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'mode', v_mode);
end;
$$;

revoke execute on function public.pairing_start(uuid, uuid, text) from public, anon;
grant execute on function public.pairing_start(uuid, uuid, text) to authenticated;
