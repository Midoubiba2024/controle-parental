-- LOT 0 — Correctif : lever le blocage DELETE sur audit_log.
-- Le trigger de suppression empêchait la suppression en cascade d'une famille
-- (droit à l'effacement RGPD) et les purges de rétention. L'immutabilité du
-- contenu reste assurée par le trigger BEFORE UPDATE ; la protection contre la
-- suppression par un utilisateur vient de la RLS (aucune policy DELETE pour
-- 'authenticated' ; seul le service_role peut supprimer).
drop trigger if exists trg_audit_no_delete on public.audit_log;
