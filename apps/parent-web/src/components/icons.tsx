import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Ban, Briefcase, Bug, Clapperboard, Dices, Download, FileText, Gamepad2, Globe, HeartCrack,
  HeartHandshake, House, Image, KeyRound, Map, MessageCircle, MessageSquareWarning, Music,
  Newspaper, Pill, Shapes, ShieldAlert, Skull, Smartphone, Swords, Trash2, UserX, Users,
  VenetianMask, Megaphone, Heart,
} from "lucide-react";
import type { FilterCategory, SafetyCategory } from "../lib/types";

/* =============================================================================
   Icônes de la console : lucide-react (licence ISC), importées une à une
   (tree-shaking). Règle commune : 18–20 px, trait 1,75, DÉCORATIVES
   (aria-hidden) — le sens est toujours porté par un libellé texte voisin.
   ============================================================================= */

/** Propriétés communes : à étaler sur chaque icône (`<Clock {...ic} />`). */
export const ic: LucideProps = { size: 20, strokeWidth: 1.75, "aria-hidden": true, focusable: false };
/** Variante compacte (pastilles, méta-données). */
export const icSm: LucideProps = { size: 16, strokeWidth: 2, "aria-hidden": true, focusable: false };

/** Logo maison : bouclier + cœur (protection bienveillante). */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 15.5s-3.2-1.9-3.2-4.1a1.8 1.8 0 0 1 3.2-1.1 1.8 1.8 0 0 1 3.2 1.1c0 2.2-3.2 4.1-3.2 4.1z" />
    </svg>
  );
}

/* --- Catégories d'applications (usage) ------------------------------------ */
const APP_CATEGORY_ICON: Record<string, LucideIcon> = {
  social: Users, game: Gamepad2, video: Clapperboard, audio: Music,
  productivity: Briefcase, maps: Map, news: Newspaper, image: Image,
};
export function appCategoryIcon(cat: string | null): LucideIcon {
  return (cat && APP_CATEGORY_ICON[cat]) || Shapes;
}

/* --- Catégories de filtrage web (LOT 4) ----------------------------------- */
const FILTER_CATEGORY_ICON: Record<FilterCategory, LucideIcon> = {
  adult: ShieldAlert, violence: Swords, gambling: Dices, drugs: Pill, weapons: Skull,
  hate: Megaphone, dating: Heart, social: MessageCircle, piracy: VenetianMask,
  malware: Bug, ads_trackers: Ban,
};
export function filterCategoryIcon(cat: FilterCategory): LucideIcon {
  return FILTER_CATEGORY_ICON[cat] ?? Globe;
}

/* --- Catégories de sécurité ado (LOT 6) ----------------------------------- */
const SAFETY_CATEGORY_ICON: Record<SafetyCategory, LucideIcon> = {
  harassment: MessageSquareWarning, grooming: UserX, sexual_content: ShieldAlert,
  self_harm: HeartHandshake, drugs: Pill,
};
export function safetyCategoryIcon(cat: SafetyCategory): LucideIcon {
  return SAFETY_CATEGORY_ICON[cat] ?? HeartCrack;
}

/* --- Actions du journal d'audit ------------------------------------------- */
type Tone = "accent" | "plum" | "sage" | "sand" | "danger" | "neutral";
export function auditIcon(action: string): { Icon: LucideIcon; tone: Tone } {
  const a = (action || "").replace(/\./g, "_");
  if (a === "family_created") return { Icon: House, tone: "plum" };
  if (a === "pairing_code_created") return { Icon: KeyRound, tone: "accent" };
  if (a === "device_enrolled") return { Icon: Smartphone, tone: "sage" };
  if (a === "rgpd_export") return { Icon: Download, tone: "sand" };
  if (a.startsWith("rgpd_delete")) return { Icon: Trash2, tone: "danger" };
  return { Icon: FileText, tone: "neutral" };
}
