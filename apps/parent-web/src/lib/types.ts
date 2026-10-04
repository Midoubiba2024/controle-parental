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
  child_id?: string;
  battery_level: number | null;
  is_charging: boolean | null;
  storage_total_bytes: number | null;
  storage_free_bytes: number | null;
  // LOT 8b — état des protections (null = non renseigné par un ancien client).
  perm_usage_access: boolean | null;
  perm_overlay: boolean | null;
  perm_notifications: boolean | null;
  perm_location: boolean | null;
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

export type CommandType = "lock_now" | "pause" | "resume" | "ring" | "message" | "locate";
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

export type RequestKind = "extra_time" | "unblock_app" | "reward" | "browse";
export type RequestStatus = "pending" | "approved" | "denied" | "cancelled";

export interface AccessRequest {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string | null;
  kind: RequestKind;
  payload: { minutes?: number; package_name?: string; scope?: "app" | "global"; domain?: string; [k: string]: unknown };
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

/* --- LOT 3 — Localisation & Sécurité ------------------------------------ */

export type LocationMode = "off" | "on_demand" | "periodic";
export type LocationSource = "periodic" | "on_demand" | "sos";
export type GeofenceType = "home" | "school" | "custom";
export type GeofenceTransition = "enter" | "exit" | "dwell";
export type SosStatus = "active" | "acked" | "resolved";
export type SafetyAlertKind = "low_battery";

export interface LocationSettings {
  id: string;
  family_id: string;
  child_id: string;
  enabled: boolean;
  mode: LocationMode;
  periodic_interval_sec: number;
  retention_days: number;
  high_accuracy: boolean;
  // Alertes d'entrée/sortie de zones, indépendantes du mode (migration 0030).
  // Absent tant que la migration n'est pas appliquée.
  geofence_alerts_enabled?: boolean;
}

export interface LocationFix {
  id: string;
  child_id: string;
  device_id: string;
  captured_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: LocationSource;
  battery_level: number | null;
}

export interface Geofence {
  id: string;
  family_id: string;
  child_id: string;
  name: string;
  type: GeofenceType;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  enabled: boolean;
  notify_enter: boolean;
  notify_exit: boolean;
  created_at: string;
}

export interface GeofenceEvent {
  id: string;
  child_id: string;
  device_id: string;
  geofence_id: string | null;
  geofence_name: string | null;
  transition: GeofenceTransition;
  occurred_at: string;
}

export interface SosEvent {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  status: SosStatus;
  message: string | null;
  started_at: string;
  acked_by: string | null;
  acked_at: string | null;
  ended_at: string | null;
}

export interface SafetyAlert {
  id: string;
  child_id: string;
  device_id: string;
  kind: SafetyAlertKind;
  battery_level: number | null;
  location_fix_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

/* --- LOT 4 — Filtrage réseau & contenu ---------------------------------- */

export type FilterCategory =
  | "adult" | "violence" | "gambling" | "drugs" | "weapons" | "hate"
  | "dating" | "social" | "piracy" | "malware" | "ads_trackers";
export type FilterRuleAction = "allow" | "block";
export type YoutubeMode = "off" | "moderate" | "strict";
export type DomainEventAction = "blocked" | "allowed" | "rewritten";

export interface FilterPolicy {
  id: string;
  family_id: string;
  child_id: string;
  enabled: boolean;
  age_preset: AgeProfile;
  blocked_categories: FilterCategory[];
  safe_search: boolean;
  youtube_restriction: YoutubeMode;
  whitelist_only: boolean;
  ask_to_browse: boolean;
  log_allowed: boolean;
  retention_days: number;
}

export interface FilterRule {
  id: string;
  family_id: string;
  child_id: string;
  domain: string;
  action: FilterRuleAction;
  note: string | null;
  created_at: string;
}

export interface DomainEvent {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  domain: string;
  category: FilterCategory | null;
  action: DomainEventAction;
  occurred_at: string;
}

export interface FilterStatus {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  vpn_active: boolean;
  last_active_at: string | null;
  last_revoked_at: string | null;
  updated_at: string;
}

// Déduit un profil d'âge par défaut à partir de la date de naissance.
export function ageProfileFromBirth(birth: string | null): AgeProfile {
  if (!birth) return "young_child";
  const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 864e5);
  if (years < 11) return "young_child";
  if (years < 15) return "preteen";
  return "teen";
}

/* --- LOT 6 — Bien-être & sécurité ado (signaux ON-DEVICE) --------------- */
// 🔴 LIGNE ROUGE : ces types ne portent QUE des métadonnées (catégorie, gravité,
// compteur, app source). Aucun champ de contenu/texte/extrait — voir
// docs/11-LOT6-BIEN-ETRE.md.

export type SafetyCategory =
  | "harassment" | "grooming" | "sexual_content" | "self_harm" | "drugs";
export type SafetySeverity = "low" | "medium" | "high";

export interface SafetySignal {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  category: SafetyCategory;
  severity: SafetySeverity;
  source_app: string | null;   // nom de paquet/libellé (métadonnée) — jamais le texte
  occurrence_count: number;
  occurred_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export interface SafetySettings {
  id: string;
  family_id: string;
  child_id: string;
  analysis_enabled: boolean;    // consentement (OFF par défaut, privacy by default)
  mutual_visibility: boolean;   // mode ado (K6)
  updated_at: string;
}

export interface SafetyStatus {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  analysis_active: boolean;     // l'analyse tourne (transparence on/off)
  last_active_at: string | null;
  last_revoked_at: string | null;
  updated_at: string;
}

export interface PrivacyPause {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  started_at: string;
  expires_at: string | null;
  ended_at: string | null;      // null = pause encore active (K8, non silencieuse)
  created_at: string;
}
