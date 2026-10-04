/* =============================================================================
   Données 100 % fictives — n'y ajouter aucune donnée réelle.

   Fixtures RÉALISTES pour les captures visuelles (e2e/visual.mjs) — HORS
   production : ces données ne vivent que dans ce script, servies par
   interception réseau (page.route). Aucun mode démo dans l'application.

   Famille fictive « DURAND », enfant « Léa » (profil jeune enfant), une
   tablette appairée, 30 jours de temps d'écran, inventaire d'apps, appels,
   journal d'audit, règles, zones… Les dates sont relatives à « maintenant ».
   ============================================================================= */

const MIN = 60_000;
const H = 60 * MIN;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(now - ms);
/** Clé de jour LOCALE (même calcul que lib/format.ts) décalée de -offset jours. */
export function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const USER = {
  id: "8d1f5b8e-1d7b-4c3e-9a51-6f0c2b7e4a11",
  aud: "authenticated",
  role: "authenticated",
  email: "parent@exemple.fr",
  email_confirmed_at: ago(90 * 24 * H),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: ago(90 * 24 * H),
  updated_at: ago(24 * H),
};

const FAM = "f0a1b2c3-0000-4000-8000-000000000001";
const CHILD = "c0a1b2c3-0000-4000-8000-000000000002";
const DEV = "d0a1b2c3-0000-4000-8000-000000000003";

const families = [{ id: FAM, name: "DURAND", created_at: ago(40 * 24 * H) }];

const children = [{
  id: CHILD, family_id: FAM, display_name: "Léa", birth_date: `${new Date().getFullYear() - 6}-03-14`,
  age_profile: "young_child", user_id: null, created_at: ago(39 * 24 * H),
}];

const devices = [{
  id: DEV, family_id: FAM, child_id: CHILD, platform: "android", mode: "standard",
  label: "Tablette Android", model: "Tablette Android", enrolled_at: ago(38 * 24 * H),
  last_seen_at: ago(5 * MIN), revoked_at: null,
}];

const device_status = [{
  id: "s1", device_id: DEV, child_id: CHILD, battery_level: 76, is_charging: false,
  storage_total_bytes: 64 * 1024 ** 3, storage_free_bytes: Math.round(18.4 * 1024 ** 3),
  perm_usage_access: true, perm_overlay: true, perm_notifications: true, perm_location: true,
  captured_at: ago(5 * MIN),
}];

/* --- Applications & temps d'écran (30 jours) ----------------------------- */
const APPS = [
  { pkg: "org.khanacademy.kids", label: "Khan Academy Kids", cat: "productivity", base: 48 },
  { pkg: "com.google.android.apps.youtube.kids", label: "YouTube Kids", cat: "video", base: 40 },
  { pkg: "com.tocaboca.tocalifeworld", label: "Toca Boca World", cat: "game", base: 25 },
  { pkg: "com.android.camera", label: "Appareil photo", cat: "image", base: 9 },
  { pkg: "com.kids.drawing", label: "Dessin", cat: "image", base: 6 },
  { pkg: "com.spotify.kids", label: "Spotify Kids", cat: "audio", base: 7 },
];
// Profil hebdomadaire réaliste (minutes totales par jour, aujourd'hui en dernier).
const WEEK = [100, 125, 110, 150, 75, 190, 135];

const usage_daily = [];
for (let off = 29; off >= 0; off--) {
  const target = off < 7 ? WEEK[6 - off] : 70 + ((off * 37) % 80);
  const weight = APPS.reduce((s, a) => s + a.base, 0);
  APPS.forEach((a, i) => {
    const minutes = Math.max(1, Math.round((a.base / weight) * target * (0.85 + ((off + i) % 4) * 0.08)));
    usage_daily.push({
      id: `u-${off}-${i}`, child_id: CHILD, device_id: DEV, day: dayKey(off),
      package_name: a.pkg, app_label: a.label, category: a.cat,
      total_foreground_ms: minutes * MIN, launch_count: 2 + ((off + i) % 6),
      last_used_at: iso(now - off * 24 * H - (i + 1) * 40 * MIN),
    });
  });
}
usage_daily.sort((a, b) => b.day.localeCompare(a.day));

const EXTRA_APPS = [
  ["com.android.chrome", "Chrome", null, true], ["com.google.android.calculator", "Calculatrice", "productivity", true],
  ["com.android.settings", "Paramètres", null, true], ["com.duolingo", "Duolingo ABC", "productivity", false],
  ["com.lego.duplo.world", "LEGO DUPLO World", "game", false], ["com.storytel.kids", "Histoires du soir", "audio", false],
];
const app_inventory = [
  ...APPS.map((a, i) => ({
    id: `inv-${i}`, family_id: FAM, child_id: CHILD, device_id: DEV, package_name: a.pkg, app_label: a.label, category: a.cat,
    is_system: a.pkg === "com.android.camera", installed_at: ago((30 + i * 9) * 24 * H),
    first_seen_at: ago(38 * 24 * H), last_seen_at: ago(5 * MIN), removed_at: null,
  })),
  ...EXTRA_APPS.map(([pkg, label, cat, sys], i) => ({
    id: `inv-x${i}`, family_id: FAM, child_id: CHILD, device_id: DEV, package_name: pkg, app_label: label, category: cat,
    is_system: sys, installed_at: i === 5 ? ago(26 * H) : ago((60 + i) * 24 * H),
    first_seen_at: i === 5 ? ago(26 * H) : ago(38 * 24 * H), last_seen_at: ago(5 * MIN), removed_at: null,
  })),
];

const comm_events = [
  ["incoming", 4 * MIN + 12_000, 2 * H, "a91f3c"], ["outgoing", 2 * MIN, 5 * H, "7be20d"],
  ["missed", null, 26 * H, "a91f3c"], ["incoming", 11 * MIN, 30 * H, "c40e88"],
  // Dernier appel : RÉELLEMENT anonyme (numéro masqué par l'appelant). L'app enfant
  // envoie un hash NULL pour un numéro absent, privé ou masqué (CounterpartyHash,
  // migration 0029) ; la console affiche alors « Numéro masqué ».
  ["outgoing", 45_000, 52 * H, "a91f3c"], ["blocked", null, 70 * H, null],
].map(([direction, duration_ms, back, hash], i) => ({
  id: `call-${i}`, child_id: CHILD, device_id: DEV, kind: "call", direction,
  counterparty_hash: hash ? `${hash}5f0e2d9c` : null, duration_ms, occurred_at: ago(back),
}));

const audit_log = [
  ["pairing_code_created", 22 * MIN], ["device_enrolled", 38 * 24 * H], ["pairing_code_created", 38 * 24 * H + 10 * MIN],
  ["family_created", 40 * 24 * H],
].map(([action, back], i) => ({
  id: `audit-${i}`, action, actor_role: "owner", subject_child_id: CHILD, created_at: ago(back), detail: {},
}));

/* --- Règles ---------------------------------------------------------------- */
const access_policies = [{
  id: "pol-1", family_id: FAM, child_id: CHILD, enforcement_mode: "standard", daily_limit_minutes: 150,
  grace_enabled: true, grace_minutes: 1, grace_uses_per_day: 1, block_new_apps: true,
  max_content_rating: "PEGI 7", lock_system_settings: false, vacation_from: null, vacation_until: null,
}];
const app_rules = [
  { id: "ar-1", family_id: FAM, child_id: CHILD, target_type: "category", target_value: "game", action: "limit", daily_limit_minutes: 30, created_at: ago(30 * 24 * H) },
  { id: "ar-2", family_id: FAM, child_id: CHILD, target_type: "category", target_value: "video", action: "limit", daily_limit_minutes: 45, created_at: ago(30 * 24 * H) },
  { id: "ar-3", family_id: FAM, child_id: CHILD, target_type: "package", target_value: "org.khanacademy.kids", action: "always_allow", daily_limit_minutes: null, created_at: ago(30 * 24 * H) },
];
const schedules = [{ id: "sch-1", family_id: FAM, name: "Nuit en semaine", kind: "downtime", created_at: ago(30 * 24 * H) }];
const schedule_windows = [{ id: "win-1", schedule_id: "sch-1", dow_mask: 0b0111110, start_minute: 19 * 60 + 30, end_minute: 7 * 60 }];
const child_schedules = [{ id: "cs-1", family_id: FAM, child_id: CHILD, schedule_id: "sch-1", enabled: true }];
const commands = [{
  id: "cmd-1", family_id: FAM, child_id: CHILD, device_id: DEV, type: "ring", payload: {}, status: "acked",
  expires_at: ago(-H), delivered_at: ago(2 * H), acked_at: ago(2 * H), created_at: ago(2 * H),
}];

/* --- Échanges ------------------------------------------------------------- */
const requests = [
  { id: "req-1", family_id: FAM, child_id: CHILD, device_id: DEV, kind: "extra_time", payload: { minutes: 15, scope: "global" }, status: "pending", child_note: "Je finis mon dessin animé", parent_note: null, decided_by: null, decided_at: null, created_at: ago(12 * MIN) },
  { id: "req-2", family_id: FAM, child_id: CHILD, device_id: DEV, kind: "unblock_app", payload: { package_name: "com.lego.duplo.world" }, status: "pending", child_note: null, parent_note: null, decided_by: null, decided_at: null, created_at: ago(3 * H) },
  { id: "req-3", family_id: FAM, child_id: CHILD, device_id: DEV, kind: "extra_time", payload: { minutes: 10, scope: "global" }, status: "approved", child_note: null, parent_note: null, decided_by: USER.id, decided_at: ago(27 * H), created_at: ago(27 * H) },
];
const messages = [
  ["parent", "Coucou Léa, on part au parc à 16 h !", 3 * H, true],
  ["child", "D'accord ! Je peux prendre mon vélo ?", 3 * H - 4 * MIN, true],
  ["parent", "Oui, n'oublie pas ton casque.", 3 * H - 6 * MIN, true],
].map(([sender, body, back, read], i) => ({
  id: `msg-${i}`, family_id: FAM, child_id: CHILD, sender, body, read_at: read ? ago(back - MIN) : null, created_at: ago(back),
}));

/* --- Localisation & sécurité ---------------------------------------------- */
// Centre d'un grand parc public (aucun sens résidentiel).
const HOME = [45.7772, 4.8556];
const location_settings = [{
  id: "ls-1", family_id: FAM, child_id: CHILD, enabled: true, mode: "periodic",
  periodic_interval_sec: 900, retention_days: 30, high_accuracy: false,
  geofence_alerts_enabled: true,   // migration 0030
}];
const location_fixes = Array.from({ length: 12 }, (_, i) => ({
  id: `fix-${i}`, child_id: CHILD, device_id: DEV, captured_at: ago(i * 15 * MIN + 4 * MIN),
  latitude: HOME[0] + Math.sin(i / 2) * 0.0022, longitude: HOME[1] + i * 0.00045, accuracy_m: 12 + (i % 4) * 3,
  source: "periodic", battery_level: 76,
}));
const geofences = [
  { id: "gf-1", family_id: FAM, child_id: CHILD, name: "Maison", type: "home", center_lat: HOME[0], center_lng: HOME[1], radius_m: 150, enabled: true, notify_enter: true, notify_exit: true, created_at: ago(30 * 24 * H) },
  { id: "gf-2", family_id: FAM, child_id: CHILD, name: "École des Tilleuls", type: "school", center_lat: HOME[0] + 0.004, center_lng: HOME[1] + 0.006, radius_m: 200, enabled: true, notify_enter: true, notify_exit: false, created_at: ago(30 * 24 * H) },
];
const geofence_events = [
  { id: "ge-1", child_id: CHILD, device_id: DEV, geofence_id: "gf-1", geofence_name: "Maison", transition: "enter", occurred_at: ago(50 * MIN) },
  { id: "ge-2", child_id: CHILD, device_id: DEV, geofence_id: "gf-2", geofence_name: "École des Tilleuls", transition: "exit", occurred_at: ago(80 * MIN) },
];
const sos_events = [{
  id: "sos-1", family_id: FAM, child_id: CHILD, device_id: DEV, status: "resolved", message: null,
  started_at: ago(9 * 24 * H), acked_by: USER.id, acked_at: ago(9 * 24 * H - 2 * MIN), ended_at: ago(9 * 24 * H - 20 * MIN),
}];
const safety_alerts = [{
  id: "sa-1", child_id: CHILD, device_id: DEV, kind: "low_battery", battery_level: 14, location_fix_id: null,
  acknowledged_at: ago(2 * 24 * H), acknowledged_by: USER.id, created_at: ago(2 * 24 * H + H),
}];

/* --- Filtrage ------------------------------------------------------------- */
const filter_policy = [{
  id: "fp-1", family_id: FAM, child_id: CHILD, enabled: true, age_preset: "young_child",
  blocked_categories: ["adult", "violence", "gambling", "drugs", "weapons", "hate", "dating", "malware"],
  safe_search: true, youtube_restriction: "strict", whitelist_only: false, ask_to_browse: true,
  log_allowed: false, retention_days: 30,
}];
const filter_rules = [
  { id: "fr-1", family_id: FAM, child_id: CHILD, domain: "lumni.fr", action: "allow", note: null, created_at: ago(20 * 24 * H) },
  { id: "fr-2", family_id: FAM, child_id: CHILD, domain: "vikidia.org", action: "allow", note: "ask_to_browse", created_at: ago(6 * 24 * H) },
  { id: "fr-3", family_id: FAM, child_id: CHILD, domain: "exemple-jeux-en-ligne.com", action: "block", note: null, created_at: ago(15 * 24 * H) },
];
const filter_status = [{ id: "fs-1", child_id: CHILD, device_id: DEV, vpn_active: true, last_revoked_at: null, updated_at: ago(2 * MIN) }];
const domain_events = [
  { id: "de-1", child_id: CHILD, device_id: DEV, domain: "casino-exemple.com", category: "gambling", action: "blocked", occurred_at: ago(4 * H) },
  { id: "de-2", child_id: CHILD, device_id: DEV, domain: "pubs-exemple.net", category: "ads_trackers", action: "blocked", occurred_at: ago(6 * H) },
];

export const TABLES = {
  families, children, devices, device_status, usage_daily, app_inventory, comm_events, audit_log,
  access_policies, screen_time_limits: [], app_rules, schedules, schedule_windows, child_schedules,
  time_grants: [], commands, requests, messages, location_settings, location_fixes, geofences,
  geofence_events, sos_events, safety_alerts, filter_policy, filter_rules, filter_status, domain_events,
  safety_settings: [], safety_signals: [], safety_status: [], privacy_pauses: [],
};

export const RPC = {
  // Code FICTIF au format LOT 12 : 10 caractères base32 Crockford, groupé 5+5.
  pairing_start: () => ({ code: "7KQ2MX9D4F", code_display: "7KQ2M-X9D4F", expires_at: iso(now + 10 * MIN), mode: "standard" }),
};
