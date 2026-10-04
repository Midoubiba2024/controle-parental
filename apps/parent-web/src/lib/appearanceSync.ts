import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  clearPending, DEVICE_OWNER, getAppearance, hasLocalAppearance, isPalette, isTheme, localOwner,
  onAppearanceChange, readPending, restoreDeviceAppearance, setAppearance, setAppearanceUser,
  type Appearance, type PendingSync,
} from "./theme";

/* -----------------------------------------------------------------------------
   Synchronisation de l'APPARENCE entre appareils, via les métadonnées du compte
   (supabase.auth.updateUser({ data: { palette, theme } }) → user_metadata) :
   aucune table, aucune migration. Ce ne sont que des préférences d'affichage,
   jamais utilisées pour une autorisation.

   - Connexion : la valeur du COMPTE prime sur la valeur locale, puis la valeur
     locale est mise à jour — SAUF si un choix fait ici n'a pas encore été
     enregistré (marqueur `cp.appearance.pending` de CE compte) : on le garde et
     on le renvoie.
   - Appareil partagé : la préférence locale d'un AUTRE compte n'est jamais
     envoyée ni conservée (retour à la préférence de l'appareil) ; à la
     déconnexion, retour à la préférence de l'appareil, sinon au défaut.
   - Choix de l'utilisateur : envoyé au compte (regroupé : 800 ms), et aussi
     tout de suite quand la page passe en arrière-plan ou se ferme, au retour
     du réseau, et AVANT la déconnexion (flushAppearance).
   - Erreur réseau : aucun blocage ; la valeur locale reste, le marqueur aussi.
   Toute valeur lue est validée (palette inconnue → ignorée, donc défaut local).
   ----------------------------------------------------------------------------- */

const PUSH_DELAY_MS = 800;
const FLUSH_TIMEOUT_MS = 2000;

let syncedUser: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function fromMetadata(meta: unknown): Partial<Appearance> {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    ...(isPalette(m.palette) ? { palette: m.palette } : {}),
    ...(isTheme(m.theme) ? { theme: m.theme } : {}),
  };
}

/** Envoie la valeur courante au compte ; efface le marqueur si l'envoi réussit. */
async function push(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const userId = syncedUser;
  if (!userId) return;
  const pending: PendingSync | null = readPending(userId);
  const a = getAppearance();
  try {
    const { error } = await supabase.auth.updateUser({ data: { palette: a.palette, theme: a.theme } });
    if (error) { console.warn("Apparence non synchronisée avec le compte :", error.message); return; }
    if (pending) clearPending(pending, a);
  } catch (e) {
    console.warn("Apparence non synchronisée avec le compte :", e);
  }
}

function hasPendingFor(userId: string | null): boolean {
  return !!userId && readPending(userId) !== null;
}

/**
 * À appeler AVANT supabase.auth.signOut() : envoie un choix encore en attente
 * (sans attendre plus de 2 s ; le marqueur sert de filet sinon).
 */
export async function flushAppearance(): Promise<void> {
  if (!timer && !hasPendingFor(syncedUser)) return;
  await Promise.race([push(), new Promise<void>((r) => setTimeout(r, FLUSH_TIMEOUT_MS))]);
}

/**
 * À monter une fois (App), avec la session courante. `ready` : la session
 * initiale est résolue (getSession terminé).
 */
export function useAccountAppearanceSync(session: Session | null, ready: boolean) {
  const userId = session?.user.id ?? null;
  const prevUser = useRef<string | null>(null);

  // Déconnexion (ou changement de compte) : retour à la préférence de l'appareil.
  useEffect(() => {
    if (prevUser.current && prevUser.current !== userId) restoreDeviceAppearance();
    prevUser.current = userId;
  }, [userId]);

  // Aucune session au démarrage (expirée pendant que l'appli était fermée) :
  // l'écran de connexion ne garde pas la préférence du compte précédent.
  useEffect(() => {
    if (ready && !userId && localOwner() !== DEVICE_OWNER) restoreDeviceAppearance();
  }, [ready, userId]);

  useEffect(() => {
    if (!userId || !session) return;
    let active = true;
    let userTouched = false;
    syncedUser = userId;
    setAppearanceUser(userId);

    const owner = localOwner();
    const pending = readPending(userId);
    const pendingHere = pending !== null;
    // Préférence locale d'un AUTRE compte : ni conservée, ni envoyée.
    if (!pendingHere && owner !== userId && owner !== DEVICE_OWNER) restoreDeviceAppearance();
    const localIsMine = pendingHere || owner === userId || owner === DEVICE_OWNER;

    const adopt = (meta: unknown): boolean => {
      const fromAccount = fromMetadata(meta);
      if (!fromAccount.palette && !fromAccount.theme) return false;
      setAppearance(fromAccount, "account");
      return true;
    };

    let known = false;
    if (pending && pendingHere) {
      // Un choix fait ici n'a pas atteint le compte : il prime, on le renvoie.
      setAppearance({ palette: pending.palette, theme: pending.theme }, "account");
      void push();
    } else {
      // 1. Immédiat : métadonnées de la session en mémoire (aucun aller-retour).
      known = adopt(session.user.user_metadata);
      // 2. Puis relecture du compte (un autre appareil a pu changer d'avis depuis
      //    l'émission du jeton), sans écraser un choix fait entre-temps ici.
      void supabase.auth.getUser().then(({ data, error }) => {
        // Pas d'adoption si un choix d'ici (cet onglet ou un autre) attend l'envoi.
        if (!active || userTouched || error || !data.user || hasPendingFor(userId)) return;
        const fresh = adopt(data.user.user_metadata);
        if (!fresh && !known && localIsMine && hasLocalAppearance()) void push();
      }).catch(() => { /* hors ligne : valeur locale */ });
    }

    const off = onAppearanceChange((_a, origin) => {
      if (origin !== "user") return;
      userTouched = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void push(); }, PUSH_DELAY_MS);
    });
    // Envoi immédiat si la page passe en arrière-plan ou se ferme ; nouvel
    // essai au retour du réseau.
    const flushNow = () => { if (timer || hasPendingFor(userId)) void push(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    window.addEventListener("online", flushNow);
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      off();
      window.removeEventListener("online", flushNow);
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) { clearTimeout(timer); timer = null; }   // le marqueur garde le choix
      syncedUser = null;
      setAppearanceUser(null);
    };
    // Une seule fois par utilisateur : updateUser renouvelle `session` (USER_UPDATED).
  }, [userId]);
}
