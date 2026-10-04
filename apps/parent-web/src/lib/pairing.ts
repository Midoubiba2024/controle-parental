// Code d'appairage (LOT 12) : 10 caractères de l'alphabet base32 de Crockford
// (0-9 A-Z sans I, L, O, U), générés par la RPC public.pairing_start et affichés
// en deux groupes de 5 : « 7KQ2M-X9D4F ». La saisie côté appareil est tolérante
// (minuscules, espaces, tirets, O→0, I/L→1) : la forme groupée copiée par le
// parent est donc acceptée telle quelle.

/** Réponse de la RPC public.pairing_start. `code_display` : forme groupée (0031). */
export type PairingStartResult = {
  code: string;
  code_display?: string;
  expires_at: string;
  mode?: string;
};

/** Longueur d'un code et taille d'un groupe à l'affichage. */
export const PAIRING_CODE_LENGTH = 10;
const GROUP = 5;

/**
 * Forme affichée et copiée : « 7KQ2M-X9D4F ». Espaces/tirets retirés et
 * majuscules d'abord ; un code d'une autre longueur est rendu tel quel
 * (nettoyé), sans inventer de découpage.
 */
export function formatPairingCode(code: string): string {
  const raw = code.replace(/[\s-]+/g, "").toUpperCase();
  if (raw.length !== PAIRING_CODE_LENGTH) return raw;
  return `${raw.slice(0, GROUP)}-${raw.slice(GROUP)}`;
}

/** Forme groupée renvoyée par le serveur, sinon calculée à partir de `code`. */
export function pairingDisplay(r: Pick<PairingStartResult, "code" | "code_display">): string {
  return r.code_display && r.code_display.trim() ? r.code_display.trim() : formatPairingCode(r.code);
}

/** Groupes à afficher (séparés visuellement par un tiret). */
export function pairingGroups(display: string): string[] {
  const parts = display.split("-").filter(Boolean);
  return parts.length ? parts : [display];
}
