// Après un redéploiement (GitHub Pages), les chunks de l'ancienne version ont
// disparu : un import paresseux échoue. main.tsx recharge alors UNE seule fois la
// page (drapeau de session). Le drapeau est effacé dès qu'une vue paresseuse s'est
// montée avec succès, ou à défaut 30 s après le démarrage.
export const RELOAD_FLAG = "cp.chunkReload";

export function clearChunkReloadFlag() {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* stockage indisponible */ }
}
