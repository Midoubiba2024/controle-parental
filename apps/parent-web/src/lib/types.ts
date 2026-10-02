export type Role = "owner" | "parent" | "guardian" | "child";
export type DeviceMode = "standard" | "reinforced";
export type AgeProfile = "young_child" | "preteen" | "teen";

export interface Family {
  id: string;
  name: string;
  created_at: string;
}

export interface Child {
  id: string;
  family_id: string;
  display_name: string;
  birth_date: string | null;
  age_profile: AgeProfile;
  user_id: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  family_id: string;
  child_id: string;
  platform: string;
  mode: DeviceMode;
  label: string | null;
  model: string | null;
  enrolled_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor_role: string | null;
  subject_child_id: string | null;
  created_at: string;
  detail: Record<string, unknown>;
}

// Déduit un profil d'âge par défaut à partir de la date de naissance.
export function ageProfileFromBirth(birth: string | null): AgeProfile {
  if (!birth) return "young_child";
  const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 864e5);
  if (years < 11) return "young_child";
  if (years < 15) return "preteen";
  return "teen";
}
