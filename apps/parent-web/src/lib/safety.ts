import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { labelMap, t, errorMessage } from "../i18n";
import type {
  PrivacyPause, SafetyCategory, SafetySettings, SafetySignal, SafetySeverity, SafetyStatus,
} from "./types";

/* =============================================================================
   LOT 6 — Chargement du BIEN-ÊTRE & SÉCURITÉ ado (module G + K6/K8) pour un
   enfant. Tout est lu sous RLS (le parent lit sa famille ; l'ado lit SES données
   → transparence/visibilité mutuelle K6).

   🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md) : on ne manipule QUE des signaux de
   MÉTADONNÉES — catégorie, gravité, app source, compteur, heure. JAMAIS le texte
   analysé, un extrait, ni un contenu. La détection a lieu SUR L'APPAREIL ; seule
   l'alerte remonte. La pause de confidentialité (K8) est NON silencieuse : on voit
   qu'une pause est active, jamais ce qu'elle masque.
   ============================================================================= */

export interface SafetyData {
  signals: SafetySignal[];
  settings: SafetySettings | null;
  status: SafetyStatus[];          // état de l'analyse par appareil (on/off transparent)
  openPauses: PrivacyPause[];      // pauses de confidentialité ACTIVES (K8)
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSafety(familyId: string | null, childId: string | null): SafetyData {
  const [signals, setSignals] = useState<SafetySignal[]>([]);
  const [settings, setSettings] = useState<SafetySettings | null>(null);
  const [status, setStatus] = useState<SafetyStatus[]>([]);
  const [openPauses, setOpenPauses] = useState<PrivacyPause[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // #9 — ne montrer le loader plein écran qu'au PREMIER chargement ; un reload
  // (acquittement, événement Realtime) ne doit pas faire clignoter toute la vue.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!familyId || !childId) { setLoading(false); return; }
    if (!loadedOnce.current) setLoading(true);
    setError(null);

    const [sg, se, st, pa] = await Promise.all([
      supabase.from("safety_signals").select("*").eq("child_id", childId)
        .order("occurred_at", { ascending: false }).limit(500),
      supabase.from("safety_settings").select("*").eq("child_id", childId).maybeSingle(),
      supabase.from("safety_status").select("*").eq("child_id", childId),
      supabase.from("privacy_pauses").select("*").eq("child_id", childId)
        .is("ended_at", null).order("started_at", { ascending: false }),
    ]);

    if (sg.error) setError(errorMessage(sg.error)); else setSignals(sg.data as SafetySignal[]);
    if (!se.error) setSettings((se.data as SafetySettings) ?? null);
    if (!st.error) setStatus(st.data as SafetyStatus[]);
    if (!pa.error) setOpenPauses(pa.data as PrivacyPause[]);

    loadedOnce.current = true;
    setLoading(false);
  }, [familyId, childId]);

  useEffect(() => { void load(); }, [load]);

  // #3 — Realtime : les alertes/pauses/état d'analyse arrivent en DIRECT. La RLS
  // s'applique au flux ; on filtre par child_id. Toute mutation → rechargement
  // (métadonnées seulement — aucun contenu ne transite, cf. ligne rouge).
  useEffect(() => {
    if (!childId) return;
    const channel = supabase
      .channel(`safety:${childId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "safety_signals", filter: `child_id=eq.${childId}` },
        () => { void load(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "safety_status", filter: `child_id=eq.${childId}` },
        () => { void load(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "privacy_pauses", filter: `child_id=eq.${childId}` },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [childId, load]);

  return { signals, settings, status, openPauses, loading, error, reload: load };
}

export function toSafetySettingsUpsert(s: SafetySettings | null, familyId: string, childId: string) {
  return {
    family_id: familyId,
    child_id: childId,
    analysis_enabled: s?.analysis_enabled ?? false,
    mutual_visibility: s?.mutual_visibility ?? true,
  };
}

/* --------------------------- Catalogue de catégories --------------------- */
// Chaque catégorie porte son identité par le LIBELLÉ + l'icône (components/
// icons.tsx), et une couleur CVD-safe via les variables --series-N (jamais
// rouge/vert seuls). Libellé et aide traduits (enums.safetyCategory.*), relus à
// chaque accès (getters).
export interface SafetyCatInfo { key: SafetyCategory; readonly label: string; readonly hint: string; }

const SAFETY_CATEGORY_KEYS: SafetyCategory[] = ["harassment", "grooming", "sexual_content", "self_harm", "drugs"];

export const SAFETY_CATEGORIES: SafetyCatInfo[] = SAFETY_CATEGORY_KEYS.map((key) => ({
  key,
  get label() { return t(`enums.safetyCategory.${key}.label`); },
  get hint() { return t(`enums.safetyCategory.${key}.hint`); },
}));

const SAFETY_CAT_ORDER: SafetyCategory[] =
  ["harassment", "grooming", "sexual_content", "self_harm", "drugs"];

export function safetyCategoryLabel(cat: SafetyCategory | null): string {
  return SAFETY_CATEGORIES.find((c) => c.key === cat)?.label ?? t("enums.safetyCategory.other");
}

export function safetyCategoryColor(cat: SafetyCategory | null): string {
  const i = cat ? SAFETY_CAT_ORDER.indexOf(cat) : -1;
  return `var(--series-${((i < 0 ? 0 : i) % 6) + 1})`;
}

/* --------------------------- Gravité ------------------------------------- */
export const SEVERITY_LABEL: Readonly<Record<SafetySeverity, string>> = labelMap(
  ["low", "medium", "high"], (k) => t(`enums.severity.${k}`));

// Couleur de gravité : on NE se repose PAS sur rouge/vert seul (CVD) — le libellé
// porte toujours le sens ; la couleur n'est qu'un renfort.
export function severityColor(sev: SafetySeverity): string {
  return sev === "high" ? "var(--danger)" : sev === "medium" ? "var(--warning)" : "var(--good)";
}

export const SEVERITY_ORDER: SafetySeverity[] = ["high", "medium", "low"];

/* --------------------------- Ressources d'aide (V12) --------------------- */
// Contenu STATIQUE informatif (3018, 3114, PHAROS). Aucun signalement automatisé
// en tranche 1 (voir docs/11-LOT6-BIEN-ETRE.md — reporté tranche 2). Services
// FRANÇAIS : nom et URL fixes, contact/description traduits (helpResources.*).
export interface HelpResource { name: string; url: string; readonly contact: string; readonly desc: string; }

const HELP_RESOURCE_DEFS: { id: "r3018" | "r3114" | "pharos"; name: string; url: string }[] = [
  { id: "r3018", name: "3018", url: "https://e-enfance.org/informer/3018/" },
  { id: "r3114", name: "3114", url: "https://3114.fr/" },
  { id: "pharos", name: "PHAROS", url: "https://www.internet-signalement.gouv.fr/" },
];

export const HELP_RESOURCES: HelpResource[] = HELP_RESOURCE_DEFS.map(({ id, name, url }) => ({
  name,
  url,
  get contact() { return t(`helpResources.${id}.contact`); },
  get desc() { return t(`helpResources.${id}.desc`); },
}));
