-- =============================================================================
-- LOT 8b — CORRECTIF (revue) : débloque l'effacement RGPD (K10) côté UPDATE d'audit.
--
-- PROBLÈME (confirmé) : audit_log.subject_child_id est
--   FOREIGN KEY (subject_child_id) REFERENCES children(id) ON DELETE SET NULL (0001).
-- Quand rgpd_delete_child/rgpd_delete_family suppriment un enfant, Postgres exécute
-- en INTERNE un `UPDATE audit_log SET subject_child_id = NULL` sur les lignes d'audit
-- de cet enfant. Cet UPDATE déclenche le trigger BEFORE UPDATE `trg_audit_no_update`
-- (fonction `app.audit_log_immutable`, 0001) qui lève inconditionnellement
-- « audit_log est append-only » → TOUTE la transaction d'effacement avorte.
-- Retirer `trg_audit_no_delete` (bloc 0010) ne suffit donc PAS : c'est le trigger
-- UPDATE qui bloque ici.
--
-- CORRECTIF (additif, agnostique aux colonnes) : on autorise la SEULE action
-- référentielle ON DELETE SET NULL sur subject_child_id (non-NULL → NULL, sans
-- modifier AUCUNE autre colonne). Tout le reste des UPDATE reste refusé → le journal
-- demeure strictement append-only pour le CONTENU. La ligne « enfant supprimé »
-- conserve l'id historique dans `detail` (jsonb) : l'accountability RGPD est préservée.
--
-- Garde `tg_op = 'UPDATE'` AVANT tout accès à NEW : robuste même si le trigger
-- BEFORE DELETE `trg_audit_no_delete` est encore présent (il passe alors par le
-- `raise`, NEW n'étant pas accessible en DELETE).
--
-- Attributs recopiés à l'identique de l'original (0001) : LANGUAGE plpgsql,
-- SET search_path = '' (to_jsonb et l'opérateur jsonb « - » sont dans pg_catalog,
-- toujours résolus). Pas de SECURITY DEFINER (comme l'original).
--
-- ⚠️ À APPLIQUER PAR LE PROPRIÉTAIRE (modif d'une fonction d'audit bloquée via le
--    MCP). Ordre : dans docs/12 §3-A, JUSTE APRÈS le retrait de trg_audit_no_delete
--    (bloc 0010) et AVANT la création des fonctions rgpd_delete_* (migration 0022).
--    Idempotent (create or replace).
-- =============================================================================

create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Exception unique : l'action référentielle ON DELETE SET NULL sur
  -- subject_child_id (effacement RGPD d'un enfant), qui s'exécute comme un UPDATE.
  if tg_op = 'UPDATE'
     and old.subject_child_id is not null
     and new.subject_child_id is null
     and (to_jsonb(new) - 'subject_child_id') = (to_jsonb(old) - 'subject_child_id')
  then
    return new;
  end if;
  raise exception 'audit_log est append-only : % interdit', tg_op;
end;
$$;
