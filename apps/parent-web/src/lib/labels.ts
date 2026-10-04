// Libellés français pour les valeurs techniques (enums, codes d'action) affichées
// dans la console. Objectif : jamais de code brut ni d'anglais côté interface.
import type { AgeProfile } from "./types";

export function ageProfileLabel(p: AgeProfile | string): string {
  switch (p) {
    case "young_child": return "Jeune enfant";
    case "preteen": return "Préado";
    case "teen": return "Ado";
    default: return String(p);
  }
}

export function roleLabel(r: string | null | undefined): string {
  switch (r) {
    case "owner": return "Propriétaire";
    case "parent": return "Parent";
    case "guardian": return "Tuteur";
    case "child": return "Enfant";
    default: return r ?? "—";
  }
}

// Actions du journal d'audit → phrases lisibles en français.
const AUDIT_LABELS: Record<string, string> = {
  "family.created": "Famille créée",
  "pairing.code_created": "Code d'appairage généré",
  "device.enrolled": "Appareil appairé",
  "rgpd.export": "Export des données (RGPD)",
  "rgpd.delete_child": "Suppression d'un profil enfant (RGPD)",
  "rgpd.delete_family": "Suppression de la famille (RGPD)",
};

export function auditActionLabel(action: string): string {
  if (AUDIT_LABELS[action]) return AUDIT_LABELS[action];
  // Repli lisible pour une action non répertoriée : « a.b_c » → « A b c ».
  const human = (action || "").replace(/[._]+/g, " ").trim();
  return human ? human.charAt(0).toUpperCase() + human.slice(1) : "Action";
}
