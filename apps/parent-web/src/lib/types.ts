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

/* --- LOT 1 — Observation transparente (agrégats / métadonnées) ---------- */

export interface UsageDaily {
  id: string;
  child_id: string;
  device_id: string;
  day: string;               // YYYY-MM-DD
  package_name: string;
  app_label: string | null;
  category: string | null;
  total_foreground_ms: number;
  launch_count: number;
  last_used_at: string | null;
}

export interface AppInventory {
  id: string;
  child_id: string;
  device_id: string;
  package_name: string;
  app_label: string | null;
  category: string | null;
  is_system: boolean;
  installed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  removed_at: string | null;
}

export interface DeviceStatus {
  id: string;
  device_id: string;
  battery_level: number | null;
  is_charging: boolean | null;
  storage_total_bytes: number | null;
  storage_free_bytes: number | null;
  captured_at: string;
}

export type CommDirection = "incoming" | "outgoing" | "missed" | "rejected" | "blocked";

export interface CommEvent {
  id: string;
  child_id: string;
  device_id: string;
  kind: "call";
  direction: CommDirection;
  counterparty_hash: string | null;
  counterparty_label: string | null;
  duration_ms: number | null;
  occurred_at: string;
}

// Déduit un profil d'âge par défaut à partir de la date de naissance.
export function ageProfileFromBirth(birth: string | null): AgeProfile {
  if (!birth) return "young_child";
  const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 864e5);
  if (years < 11) return "young_child";
  if (years < 15) return "preteen";
  return "teen";
}
