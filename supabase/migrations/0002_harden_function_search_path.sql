-- LOT 0 — Durcissement : figer le search_path des fonctions trigger/hook
-- (corrige l'avertissement de sécurité Supabase "function_search_path_mutable").
-- Toutes ces fonctions ne référencent que des objets qualifiés ou pg_catalog.

alter function app.touch_updated_at()            set search_path = '';
alter function app.audit_log_immutable()         set search_path = '';
alter function public.custom_access_token_hook(jsonb) set search_path = '';
