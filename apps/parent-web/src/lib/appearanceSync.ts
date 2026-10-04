import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  getAppearance, hasLocalAppearance, isPalette, isTheme, onAppearanceChange, setAppearance,
  type Appearance,
} from "./theme";

/* -----------------------------------------------------------------------------
   Synchronisation de l'APPARENCE entre appareils, via les métadonnées du compte
   (supabase.auth.updateUser({ data: { palette, theme } }) → user_metadata) :
   aucune table, aucune migration. Ce ne sont que des préférences d'affichage,
   jamais utilisées pour une autorisation.

   - Connexion : la valeur du COMPTE prime sur la valeur locale, puis la valeur
     locale (localStorage) est mise à jour. Si le compte n'a encore rien, il
     reçoit le choix fait sur cet appareil (s'il y en a un).
   - Choix de l'utilisateur : envoyé au compte (regroupé : 800 ms).
   - Erreur réseau : aucun blocage, la valeur locale reste en vigueur.
   Toute valeur lue est validée (palette inconnue → ignorée, donc défaut local).
   ----------------------------------------------------------------------------- */

const PUSH_DELAY_MS = 800;

function fromMetadata(meta: unknown): Partial<Appearance> {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    ...(isPalette(m.palette) ? { palette: m.palette } : {}),
    ...(isTheme(m.theme) ? { theme: m.theme } : {}),
  };
}

async function push(a: Appearance) {
  try {
    const { error } = await supabase.auth.updateUser({ data: { palette: a.palette, theme: a.theme } });
    if (error) console.warn("Apparence non synchronisée avec le compte :", error.message);
  } catch (e) {
    console.warn("Apparence non synchronisée avec le compte :", e);
  }
}

/** À monter une fois par session connectée (App). */
export function useAccountAppearanceSync(session: Session | null) {
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId || !session) return;
    let active = true;
    let userTouched = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const adopt = (meta: unknown): boolean => {
      const fromAccount = fromMetadata(meta);
      if (!fromAccount.palette && !fromAccount.theme) return false;
      setAppearance(fromAccount, "account");
      return true;
    };

    // 1. Immédiat : métadonnées de la session en mémoire (aucun aller-retour).
    const known = adopt(session.user.user_metadata);

    // 2. Puis relecture du compte (un autre appareil a pu changer d'avis depuis
    //    l'émission du jeton), sans écraser un choix fait entre-temps ici.
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || userTouched || error || !data.user) return;
      const fresh = adopt(data.user.user_metadata);
      if (!fresh && !known && hasLocalAppearance()) void push(getAppearance());
    }).catch(() => { /* hors ligne : valeur locale */ });

    const off = onAppearanceChange((a, origin) => {
      if (origin !== "user") return;
      userTouched = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void push(a); }, PUSH_DELAY_MS);
    });

    return () => {
      active = false;
      off();
      // Choix encore en attente (déconnexion rapide) : on l'envoie tout de suite.
      if (timer) { clearTimeout(timer); void push(getAppearance()); }
    };
    // Une seule fois par utilisateur : updateUser renouvelle `session` (USER_UPDATED).
  }, [userId]);
}
