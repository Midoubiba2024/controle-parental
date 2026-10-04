// Sélection des appareils d'un enfant (LOT 12).
//
// Un enfant peut avoir PLUSIEURS appareils, et un téléphone réinitialisé puis
// ré-appairé laisse un ancien appareil tant que le parent ne l'a pas retiré. Les
// vues qui ciblent « l'appareil » (Localiser, commandes instantanées) doivent donc
// viser l'appareil ACTIF le plus RÉCENT, jamais le premier créé (revue L12 #9).
import type { Device } from "./types";

/** Horodatage d'activité d'un appareil : dernier contact, sinon appairage. */
function activity(d: Pick<Device, "last_seen_at" | "enrolled_at">): number {
  const seen = d.last_seen_at ? Date.parse(d.last_seen_at) : NaN;
  const enrolled = d.enrolled_at ? Date.parse(d.enrolled_at) : NaN;
  const best = Math.max(Number.isNaN(seen) ? -Infinity : seen, Number.isNaN(enrolled) ? -Infinity : enrolled);
  return Number.isFinite(best) ? best : -Infinity;
}

/** Appareils non révoqués, du plus récent au plus ancien (ordre stable sinon). */
export function activeDevicesNewestFirst<T extends Device>(devices: readonly T[]): T[] {
  return devices
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => !d.revoked_at)
    .sort((a, b) => activity(b.d) - activity(a.d) || b.i - a.i)
    .map(({ d }) => d);
}

/** Appareil actif le plus récent (null si aucun). */
export function latestActiveDevice<T extends Device>(devices: readonly T[]): T | null {
  return activeDevicesNewestFirst(devices)[0] ?? null;
}
