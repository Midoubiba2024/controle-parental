import type fr from "./locales/fr";

/* =============================================================================
   Types du catalogue. Le catalogue français (`locales/fr.ts`, déclaré `as const`)
   est la SOURCE : sa forme définit `Messages`, que tout autre catalogue doit
   satisfaire (`satisfies Messages`) → une clé manquante OU en trop fait échouer
   le typecheck (et donc la CI).
   ============================================================================= */

/**
 * Formes plurielles (catégories CLDR, cf. Intl.PluralRules). Seule `other` est
 * obligatoire : le français utilise `one`/`other`, l'arabe en utilise six, etc.
 * Une valeur du catalogue est plurielle si TOUTES ses clés sont des catégories
 * CLDR (dont `other`) — un enum possédant une clé « other » n'est donc pas visé.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type PluralCategory = keyof PluralForms;

/** Nœud pluriel = objet dont TOUTES les clés sont des catégories CLDR, dont `other`. */
type IsPlural<T> = T extends { readonly other: string }
  ? Exclude<keyof T, PluralCategory> extends never ? true : false
  : false;

/** Élargit le catalogue source : chaînes littérales → string, pluriels → PluralForms. */
type Widen<T> = T extends string
  ? string
  : IsPlural<T> extends true
    ? PluralForms
    : { [K in keyof T]: Widen<T[K]> };

type Source = typeof fr;

/** Forme que doit avoir CHAQUE catalogue (mêmes clés que le français). */
export type Messages = Widen<Source>;

/** Chemins pointés vers les feuilles (chaînes ou pluriels) : « nav.overview »… */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : IsPlural<T[K]> extends true
      ? `${P}${K}`
      : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Source>;

type ValueAt<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T ? ValueAt<T[H], R> : never
  : K extends keyof T ? T[K] : never;

/** Noms des paramètres `{nom}` présents dans une chaîne. */
type Placeholders<S> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | Placeholders<Rest>
  : never;

type LeafParams<V> = V extends string
  ? Placeholders<V>
  : IsPlural<V> extends true
    ? Placeholders<V[keyof V]> | "count"
    : never;

export type ParamValue = string | number;

/** Paramètres attendus par une clé (déduits du texte français). */
export type ParamsOf<K extends MessageKey> = { [P in LeafParams<ValueAt<Source, K>>]: ParamValue };

/** `t(clé)` sans paramètre si le texte n'en a pas ; sinon `t(clé, { … })` obligatoire. */
export type ParamArgs<K extends MessageKey> =
  [LeafParams<ValueAt<Source, K>>] extends [never] ? [params?: Record<string, ParamValue>] : [params: ParamsOf<K>];
