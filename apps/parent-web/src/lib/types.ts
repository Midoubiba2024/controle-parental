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
  // counterparty_label retiré (colonne supprimée — cf. migration 0010) : le nom
  // du contact n'est jamais stocké (métadonnées/agrégats uniquement).
  duration_ms: number | null;
  occurred_at: string;
}

/* --- LOT 2 — Règles d'accès --------------------------------------------- */

export type RuleAction = "block" | "allow" | "limit" | "always_allow";
export type RuleTarget = "package" | "category";
export type ScheduleKind = "downtime" | "allowed" | "blocked" | "school";

export interface AccessPolicy {
  id: string;
  family_id: string;
  child_id: string;
  enforcement_mode: DeviceMode;
  daily_limit_minutes: number | null;
  grace_enabled: boolean;
  grace_minutes: number;
  grace_uses_per_day: number;
  block_new_apps: boolean;
  max_content_rating: string | null;
  lock_system_settings: boolean;
  vacation_from: string | null;   // YYYY-MM-DD
  vacation_until: string | null;  // YYYY-MM-DD
}

export interface ScreenTimeLimit {
  id: string;
  family_id: string;
  child_id: string;
  day_of_week: number | null;     // 0=dimanche … 6=samedi, null=défaut
  limit_minutes: number;
}

export interface AppRule {
  id: string;
  family_id: string;
  child_id: string;
  target_type: RuleTarget;
  target_value: string;
  action: RuleAction;
  daily_limit_minutes: number | null;
}

export interface Schedule {
  id: string;
  family_id: string;
  name: string;
  kind: ScheduleKind;
  created_at: string;
}

export interface ScheduleWindow {
  id: string;
  schedule_id: string;
  dow_mask: number;               // bitmask : bit 0=dimanche … bit 6=samedi
  start_minute: number;           // minutes depuis minuit local
  end_minute: number;             // end<=start ⇒ franchit minuit
}

export interface ChildSchedule {
  id: string;
  family_id: string;
  child_id: string;
  schedule_id: string;
  enabled: boolean;
}

export type CommandType = "lock_now" | "pause" | "resume" | "ring" | "message";
export type CommandStatus = "pending" | "delivered" | "acked" | "expired" | "cancelled";

export interface Command {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  expires_at: string;
  delivered_at: string | null;
  acked_at: string | null;
  created_at: string;
}

export type RequestKind = "extra_time" | "unblock_app" | "reward";
export type RequestStatus = "pending" | "approved" | "denied" | "cancelled";

export interface AccessRequest {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string | null;
  kind: RequestKind;
  payload: { minutes?: number; package_name?: string; scope?: "app" | "global"; [k: string]: unknown };
  status: RequestStatus;
  child_note: string | null;
  parent_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type GrantSource = "request" | "reward" | "manual";

export interface TimeGrant {
  id: string;
  family_id: string;
  child_id: string;
  grant_date: string;             // YYYY-MM-DD
  bonus_minutes: number;
  scope_package: string | null;
  source: GrantSource;
  request_id: string | null;
  created_at: string;
}

/* --- LOT 5 — Messagerie interne parent ↔ enfant ------------------------- */

export type MessageSender = "parent" | "child";

export interface Message {
  id: string;
  family_id: string;
  child_id: string;
  sender: MessageSender;
  body: string;
  read_at: string | null;
  created_at: string;
}

// Déduit un profil d'âge par défaut à partir de la date de naissance.
export function ageProfileFromBirth(birth: string | null): AgeProfile {
  if (!birth) return "young_child";
  const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 864e5);
  if (years < 11) return "young_child";
  if (years < 15) return "preteen";
  return "teen";
}
