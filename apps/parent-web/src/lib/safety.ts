import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
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

  const load = useCallback(async () => {
    if (!familyId || !childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const [sg, se, st, pa] = await Promise.all([
      supabase.from("safety_signals").select("*").eq("child_id", childId)
        .order("occurred_at", { ascending: false }).limit(500),
      supabase.from("safety_settings").select("*").eq("child_id", childId).maybeSingle(),
      supabase.from("safety_status").select("*").eq("child_id", childId),
      supabase.from("privacy_pauses").select("*").eq("child_id", childId)
        .is("ended_at", null).order("started_at", { ascending: false }),
    ]);

    if (sg.error) setError(sg.error.message); else setSignals(sg.data as SafetySignal[]);
    if (!se.error) setSettings((se.data as SafetySettings) ?? null);
    if (!st.error) setStatus(st.data as SafetyStatus[]);
    if (!pa.error) setOpenPauses(pa.data as PrivacyPause[]);

    setLoading(false);
  }, [familyId, childId]);

  useEffect(() => { void load(); }, [load]);

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
// Chaque catégorie porte son identité par le LIBELLÉ + l'icône, et une couleur
// CVD-safe via les variables --series-N (jamais rouge/vert seuls).
export interface SafetyCatInfo { key: SafetyCategory; label: string; icon: string; hint: string; }

export const SAFETY_CATEGORIES: SafetyCatInfo[] = [
  { key: "harassment", label: "Harcèlement", icon: "💢",
    hint: "Insultes répétées, menaces, mise à l'écart." },
  { key: "grooming", label: "Contact suspect", icon: "🕵",
    hint: "Motif de sollicitation par un contact inconnu (secret, rendez-vous…)." },
  { key: "sexual_content", label: "Contenu sexuel", icon: "🔞",
    hint: "Sollicitation de photos / propos à caractère sexuel." },
  { key: "self_harm", label: "Mal-être", icon: "🫂",
    hint: "Détresse, auto-agression, idées noires." },
  { key: "drugs", label: "Drogues", icon: "🚫",
    hint: "Substances / produits illicites." },
];

const SAFETY_CAT_ORDER: SafetyCategory[] =
  ["harassment", "grooming", "sexual_content", "self_harm", "drugs"];

export function safetyCategoryLabel(cat: SafetyCategory | null): string {
  return SAFETY_CATEGORIES.find((c) => c.key === cat)?.label ?? "Autre";
}

export function safetyCategoryColor(cat: SafetyCategory | null): string {
  const i = cat ? SAFETY_CAT_ORDER.indexOf(cat) : -1;
  return `var(--series-${((i < 0 ? 0 : i) % 6) + 1})`;
}

/* --------------------------- Gravité ------------------------------------- */
export const SEVERITY_LABEL: Record<SafetySeverity, string> = {
  low: "Faible", medium: "Moyenne", high: "Élevée",
};

// Couleur de gravité : on NE se repose PAS sur rouge/vert seul (CVD) — le libellé
// porte toujours le sens ; la couleur n'est qu'un renfort.
export function severityColor(sev: SafetySeverity): string {
  return sev === "high" ? "var(--danger)" : sev === "medium" ? "var(--warning)" : "var(--good)";
}

export const SEVERITY_ORDER: SafetySeverity[] = ["high", "medium", "low"];

/* --------------------------- Ressources d'aide (V12) --------------------- */
// Contenu STATIQUE informatif (3018, 3114, PHAROS). Aucun signalement automatisé
// en tranche 1 (voir docs/11-LOT6-BIEN-ETRE.md — reporté tranche 2).
export interface HelpResource { name: string; contact: string; url: string; desc: string; }

export const HELP_RESOURCES: HelpResource[] = [
  { name: "3018", contact: "3018 (appel/chat)", url: "https://e-enfance.org/informer/3018/",
    desc: "Cyberharcèlement et violences numériques (e-Enfance). Gratuit, anonyme." },
  { name: "3114", contact: "3114 (24h/24)", url: "https://3114.fr/",
    desc: "Souffrance psychique et prévention du suicide. Écoute par des soignants." },
  { name: "PHAROS", contact: "internet-signalement.gouv.fr", url: "https://www.internet-signalement.gouv.fr/",
    desc: "Signalement officiel de contenus et comportements illicites en ligne." },
];
