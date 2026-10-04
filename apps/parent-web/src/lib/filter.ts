import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { errorMessage, labelMap, t } from "../i18n";
import type {
  AccessRequest, AgeProfile, DomainEvent, FilterCategory, FilterPolicy,
  FilterRule, FilterStatus, YoutubeMode,
} from "./types";

/* =============================================================================
   LOT 4 — Chargement + agrégation du FILTRAGE réseau pour un enfant.
   Tout est lu sous RLS (le parent écrit/lit sa famille ; l'enfant lit sa
   politique côté app → transparence). LIGNE ROUGE : on ne manipule que des
   MÉTADONNÉES de domaines (nom + catégorie + action + heure) — jamais d'URL,
   de requête ni de contenu. Filtrage = sinkhole DNS LOCAL, aucun MITM.
   ============================================================================= */

export interface FilterData {
  policy: FilterPolicy | null;
  rules: FilterRule[];
  events: DomainEvent[];         // journal de domaines (métadonnées)
  status: FilterStatus[];        // état du VPN par appareil (anti-contournement C9)
  browseRequests: AccessRequest[]; // demandes Ask-to-Browse (C6) en attente
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFilter(familyId: string | null, childId: string | null): FilterData {
  const [policy, setPolicy] = useState<FilterPolicy | null>(null);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [status, setStatus] = useState<FilterStatus[]>([]);
  const [browseRequests, setBrowseRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId || !childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const [pol, fr, ev, st, br] = await Promise.all([
      supabase.from("filter_policy").select("*").eq("child_id", childId).maybeSingle(),
      supabase.from("filter_rules").select("*").eq("child_id", childId).order("created_at"),
      supabase.from("domain_events").select("*").eq("child_id", childId)
        .order("occurred_at", { ascending: false }).limit(200),
      supabase.from("filter_status").select("*").eq("child_id", childId),
      supabase.from("requests").select("*").eq("child_id", childId)
        .eq("kind", "browse").eq("status", "pending").order("created_at", { ascending: false }),
    ]);

    if (pol.error) setError(errorMessage(pol.error)); else setPolicy((pol.data as FilterPolicy) ?? null);
    if (!fr.error) setRules(fr.data as FilterRule[]);
    if (!ev.error) setEvents(ev.data as DomainEvent[]);
    if (!st.error) setStatus(st.data as FilterStatus[]);
    if (!br.error) setBrowseRequests(br.data as AccessRequest[]);

    setLoading(false);
  }, [familyId, childId]);

  useEffect(() => { void load(); }, [load]);

  return { policy, rules, events, status, browseRequests, loading, error, reload: load };
}

/* --------------------------- Catalogue de catégories --------------------- */
// Chaque catégorie porte son identité par le LIBELLÉ + l'icône (jamais la
// couleur seule → CVD-safe). Le point coloré n'est que décoratif. Libellé et
// aide sont traduits (enums.filterCategory.*) et relus à chaque accès (getters).
export interface FilterCategoryInfo { key: FilterCategory; icon: string; readonly label: string; readonly hint: string }

const FILTER_CATEGORY_ICONS: [FilterCategory, string][] = [
  ["adult", "🔞"], ["violence", "⚔️"], ["gambling", "🎰"], ["drugs", "💊"],
  ["weapons", "🔫"], ["hate", "🚫"], ["dating", "💘"], ["social", "💬"],
  ["piracy", "🏴‍☠️"], ["malware", "🦠"], ["ads_trackers", "📊"],
];

export const FILTER_CATEGORIES: FilterCategoryInfo[] = FILTER_CATEGORY_ICONS.map(([key, icon]) => ({
  key,
  icon,
  get label() { return t(`enums.filterCategory.${key}.label`); },
  get hint() { return t(`enums.filterCategory.${key}.hint`); },
}));

export function categoryLabel(cat: FilterCategory | null): string {
  if (!cat) return t("enums.filterCategory.blacklist");
  return FILTER_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}

// Couleur décorative stable par catégorie (série CVD-safe, cycle 1..8).
export function filterCategoryColor(cat: FilterCategory | null): string {
  if (!cat) return "var(--muted)";
  const idx = FILTER_CATEGORIES.findIndex((c) => c.key === cat);
  return idx < 0 ? "var(--muted)" : `var(--series-${(idx % 8) + 1})`;
}

/* --------------------------- Presets par âge (C5) ------------------------ */
// Repères d'aide à la décision — ajustables par le parent à tout moment.
// adult (C7) est 'must' dans TOUS les presets. Graduation par âge :
//   jeune enfant → liste blanche stricte ; (pré)ado → catégories + Ask-to-Browse.
export interface FilterPreset {
  readonly label: string;    // traduit (getter : relu dans la langue active)
  blocked_categories: FilterCategory[];
  safe_search: boolean;
  youtube_restriction: YoutubeMode;
  whitelist_only: boolean;
  ask_to_browse: boolean;
}

export const FILTER_PRESETS: Record<AgeProfile, FilterPreset> = {
  young_child: {
    get label() { return t("enums.ageProfilePreset.young_child"); },
    blocked_categories: [
      "adult", "violence", "gambling", "drugs", "weapons", "hate",
      "dating", "piracy", "malware", "ads_trackers",
    ],
    safe_search: true,
    youtube_restriction: "strict",
    whitelist_only: true,   // liste blanche stricte
    ask_to_browse: false,
  },
  preteen: {
    get label() { return t("enums.ageProfilePreset.preteen"); },
    // 'dating' et 'social' bloqués par défaut (paramètres protecteurs K5 ; décision
    // du propriétaire pour ~12 ans). Le parent peut rouvrir chaque catégorie.
    blocked_categories: [
      "adult", "violence", "gambling", "drugs", "weapons", "hate", "dating", "social",
      "piracy", "malware",
    ],
    safe_search: true,
    youtube_restriction: "moderate",
    whitelist_only: false,
    ask_to_browse: true,    // co-régulation
  },
  teen: {
    get label() { return t("enums.ageProfilePreset.teen"); },
    blocked_categories: ["adult", "gambling", "malware"],
    safe_search: false,
    youtube_restriction: "off",
    whitelist_only: false,
    ask_to_browse: true,
  },
};

export const YOUTUBE_MODE_LABEL: Readonly<Record<YoutubeMode, string>> = labelMap(
  ["off", "moderate", "strict"], (k) => t(`enums.youtubeMode.${k}`));

export const DOMAIN_ACTION_LABEL: Readonly<Record<DomainEvent["action"], string>> = labelMap(
  ["blocked", "allowed", "rewritten"], (k) => t(`enums.domainAction.${k}`));

/* --------------------------- Normalisation de domaine -------------------- */
// Hostname nu, minuscules, sans schéma/chemin/port. Renvoie null si invalide.
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, "");   // retire http(s)://
  d = d.replace(/\/.*$/, "");          // retire le chemin
  d = d.replace(/:\d+$/, "");          // retire le port
  d = d.replace(/^\*\./, "");          // retire un wildcard de tête (*.ex.com → ex.com)
  if (!/^[a-z0-9.-]+$/.test(d)) return null;
  if (!d.includes(".") || d.startsWith(".") || d.endsWith(".")) return null;
  if (d.length > 253) return null;
  return d;
}

/** Base complète pour un upsert idempotent de la politique de filtrage. */
export function toPolicyUpsert(policy: FilterPolicy | null, familyId: string, childId: string) {
  return {
    family_id: familyId,
    child_id: childId,
    enabled: policy?.enabled ?? true,
    age_preset: policy?.age_preset ?? "young_child",
    blocked_categories: policy?.blocked_categories ?? ["adult"],
    safe_search: policy?.safe_search ?? true,
    youtube_restriction: policy?.youtube_restriction ?? "moderate",
    whitelist_only: policy?.whitelist_only ?? false,
    ask_to_browse: policy?.ask_to_browse ?? false,
    log_allowed: policy?.log_allowed ?? false,
    retention_days: policy?.retention_days ?? 30,
  };
}
