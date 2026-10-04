// Libellés traduits pour les valeurs techniques (enums, codes d'action) affichées
// dans la console. Objectif : jamais de code brut côté interface. Les textes
// vivent dans le catalogue i18n (enums.* / audit.*).
import { t } from "../i18n";
import type { AgeProfile, Role } from "./types";

const AGE_PROFILES: readonly AgeProfile[] = ["young_child", "preteen", "teen"];
const ROLES: readonly Role[] = ["owner", "parent", "guardian", "child"];

export function ageProfileLabel(p: AgeProfile | string): string {
  return (AGE_PROFILES as readonly string[]).includes(p) ? t(`enums.ageProfile.${p as AgeProfile}`) : String(p);
}

export function roleLabel(r: string | null | undefined): string {
  if (r && (ROLES as readonly string[]).includes(r)) return t(`enums.role.${r as Role}`);
  return r ?? t("common.none");
}

// Actions du journal d'audit (« rgpd.delete_child ») → clé audit.actions.rgpd_delete_child.
const AUDIT_ACTIONS = [
  "family_created", "pairing_code_created", "device_enrolled", "device_revoked",
  "rgpd_export", "rgpd_delete_child", "rgpd_delete_family",
] as const;
type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function auditActionLabel(action: string): string {
  const key = (action || "").replace(/\./g, "_");
  if ((AUDIT_ACTIONS as readonly string[]).includes(key)) return t(`audit.actions.${key as AuditAction}`);
  // Repli lisible pour une action non répertoriée : « a.b_c » → « A b c ».
  const human = (action || "").replace(/[._]+/g, " ").trim();
  return human ? human.charAt(0).toUpperCase() + human.slice(1) : t("audit.fallback");
}
