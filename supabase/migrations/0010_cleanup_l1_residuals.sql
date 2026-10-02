-- =============================================================================
-- NETTOYAGE des résidus L0/L1 (dette technique). Instructions DESTRUCTIVES.
--
-- ⚠️ À APPLIQUER MANUELLEMENT — ces DROP ne passent PAS via l'outil MCP Supabase
--    (gating de confirmation ⇒ timeout). Exécuter via le SQL Editor du dashboard
--    ou `supabase db push`. Toutes les instructions sont idempotentes (IF EXISTS).
--
-- Contexte (vérifié en live le 2026-10-02) :
--   1. public._l1_write_probe : table sonde d'écriture L1, sans RLS → seul finding
--      de get_advisors(security). Plus utilisée.
--   2. public.comm_events.counterparty_label : colonne désormais TOUJOURS NULL
--      (depuis le durcissement L1 : on ne stocke plus le nom du contact en clair).
--      Suppression = minimisation RGPD.
--   3. trg_audit_no_delete sur public.audit_log : trigger BEFORE DELETE qui
--      bloquait la suppression (cassait l'effacement RGPD en cascade et les purges
--      de rétention). La migration 0003 le supprimait mais n'a jamais été appliquée
--      en live. L'immutabilité du CONTENU reste assurée par trg_audit_no_update
--      (BEFORE UPDATE) ; la protection contre la suppression par un utilisateur
--      vient de la RLS (aucune policy DELETE pour 'authenticated').
-- =============================================================================

-- 1) Sonde d'écriture L1 ------------------------------------------------------
drop table if exists public._l1_write_probe;

-- 2) Colonne de nom de contact (toujours NULL) --------------------------------
alter table public.comm_events drop column if exists counterparty_label;

-- 3) Trigger anti-DELETE résiduel sur audit_log (cf. migration 0003) ----------
drop trigger if exists trg_audit_no_delete on public.audit_log;
