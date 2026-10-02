-- =============================================================================
-- LOT 5 — Messagerie INTERNE parent ↔ enfant (H2/H4).
--
-- Principes (docs/02-CONFORMITE.md) :
--   * ADDITIF ; RLS 100 % ; search_path figé.
--   * Messagerie PROPRIÉTAIRE uniquement — on n'intercepte JAMAIS les messages
--     d'apps tierces (ligne rouge). Ici, seuls des messages échangés DANS notre
--     app, entre le parent et l'enfant, consentis et visibles des deux côtés.
--   * Pas de contenu de correspondances de tiers ; pas de pièces jointes dans
--     cette tranche (texte court seulement).
-- =============================================================================

do $$ begin
  create type app.message_sender as enum ('parent', 'child');
exception when duplicate_object then null; end $$;

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  -- Fil de discussion rattaché à un enfant (le parent écrit À cet enfant).
  child_id    uuid not null references public.children (id) on delete cascade,
  sender      app.message_sender not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_by  uuid references auth.users (id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_child  on public.messages (child_id, created_at desc);
create index if not exists idx_messages_family on public.messages (family_id, created_at desc);

alter table public.messages enable row level security;

-- SELECT : parent de la famille + enfant concerné (visibilité mutuelle).
create policy messages_select on public.messages
  for select to authenticated
  using (app.is_parent_of(family_id) or child_id = app.current_child_id());

-- INSERT : le parent envoie (sender='parent') ; l'enfant envoie (sender='child').
-- Le rôle d'expéditeur est contraint pour empêcher l'usurpation.
create policy messages_insert_parent on public.messages
  for insert to authenticated
  with check (app.is_parent_of(family_id)
              and sender = 'parent'
              and family_id = (select c.family_id from public.children c where c.id = child_id));
create policy messages_insert_child on public.messages
  for insert to authenticated
  with check (child_id = app.current_child_id()
              and sender = 'child'
              and family_id = (select c.family_id from public.children c where c.id = child_id));

-- UPDATE : accusé de lecture (read_at). Parent sur les messages de l'enfant,
-- enfant sur ceux du parent. (Le corps reste visible des deux côtés de toute
-- façon ; cette tranche ne vise que read_at.)
create policy messages_update_parent on public.messages
  for update to authenticated
  using (app.is_parent_of(family_id)) with check (app.is_parent_of(family_id));
create policy messages_update_child on public.messages
  for update to authenticated
  using (child_id = app.current_child_id()) with check (child_id = app.current_child_id());
