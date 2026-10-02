-- =============================================================================
-- LOT 5 (correctifs revue) — Durcissement de la messagerie `messages`.
--
-- 0011 (création de la table) est DÉJÀ appliquée en live ; ces correctifs base
-- passent donc par cette migration ADDITIVE. Aucun DROP (REVOKE/GRANT, ALTER
-- POLICY, CREATE TRIGGER, ALTER PUBLICATION ne sont pas des DROP et passent via
-- l'outil MCP). Idempotent (do$$/duplicate_object, IF).
-- =============================================================================

-- #10/#11 — Auteur par défaut = compte courant (l'app n'a plus à le renseigner,
-- et le WITH CHECK ci-dessous interdit d'usurper un autre auteur).
alter table public.messages alter column created_by set default auth.uid();

-- #1 — IMMUABILITÉ DU CONTENU. Un message est « visible des deux côtés » : son
-- corps ne doit JAMAIS être réécrit (ni par le parent, ni par l'enfant). On
-- restreint le privilège UPDATE à la SEULE colonne read_at (accusé de lecture),
-- + trigger de défense en profondeur.
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

create or replace function app.messages_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
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
do $$ begin
  create trigger trg_messages_guard_update
    before update on public.messages
    for each row execute function app.messages_guard_update();
exception when duplicate_object then null; end $$;

-- #1 (sens de l'accusé) — on ne marque read_at que sur les messages qui NOUS
-- sont adressés : l'enfant sur les messages du parent, le parent sur ceux de
-- l'enfant. (ALTER POLICY, jamais DROP.)
alter policy messages_update_child on public.messages
  using (child_id = app.current_child_id() and sender = 'parent')
  with check (child_id = app.current_child_id() and sender = 'parent');
alter policy messages_update_parent on public.messages
  using (app.is_parent_of(family_id) and sender = 'child')
  with check (app.is_parent_of(family_id) and sender = 'child');

-- #10 — INSERT : created_by ne peut être que null (→ défaut auth.uid()) ou
-- l'utilisateur courant. Empêche d'attribuer un message à un tiers.
alter policy messages_insert_parent on public.messages
  with check (app.is_parent_of(family_id)
              and sender = 'parent'
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and (created_by is null or created_by = (select auth.uid())));
alter policy messages_insert_child on public.messages
  with check (child_id = app.current_child_id()
              and sender = 'child'
              and family_id = (select c.family_id from public.children c where c.id = child_id)
              and (created_by is null or created_by = (select auth.uid())));

-- #6 — Diffusion Realtime du fil (la RLS SELECT s'applique au flux). Permet au
-- parent de voir en direct les réponses/accusés sans recharger.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
