import {
  createContext, Fragment, useContext, useMemo, useSyncExternalStore,
  type ReactNode,
} from "react";
import { getLocale, resolveTemplate, setLocale, subscribe, t } from "./core";
import { fmt, type Fmt } from "./format";
import type { Locale } from "./config";
import type { MessageKey, ParamValue } from "./types";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: typeof t;
  fmt: Fmt;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Fournit la langue active à l'arbre React. Un changement de langue re-rend tous
 * les consommateurs de useI18n() (et donc leurs sous-arbres).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale);
  // Nouvel objet — et nouvelles références de `t`/`fmt` — à chaque changement de
  // langue : les consommateurs se re-rendent ET les useMemo/useCallback qui
  // dépendent de `t` ou `fmt` se recalculent.
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: ((key, ...args) => t(key, ...args)) as typeof t,
    fmt: { ...fmt },
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() doit être utilisé sous <I18nProvider>.");
  return ctx;
}

/**
 * Texte riche : balises simples du catalogue (« <b>Famille</b> ») rendues par
 * `tags`, et paramètres `{nom}` pouvant être des nœuds React. Les balises sont
 * analysées sur le GABARIT avant interpolation : une valeur fournie (nom saisi
 * par l'utilisateur…) n'est jamais interprétée comme du balisage.
 *
 *   <Trans k="dashboard.noChild" tags={{ b: (c) => <b>{c}</b> }} />
 */
export function Trans({ k, params, tags }: {
  k: MessageKey;
  params?: Record<string, ParamValue | ReactNode>;
  tags?: Record<string, (children: ReactNode) => ReactNode>;
}) {
  useI18n();   // s'abonne aux changements de langue
  const template = resolveTemplate(k, params as Record<string, unknown> | undefined);
  return <>{renderRich(template, params ?? {}, tags ?? {})}</>;
}

const TAG_RE = /<(\w+)>([\s\S]*?)<\/\1>/g;

function renderRich(
  template: string,
  params: Record<string, ParamValue | ReactNode>,
  tags: Record<string, (children: ReactNode) => ReactNode>,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of template.matchAll(TAG_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(...renderParams(template.slice(last, start), params, `t${i}`));
    const render = tags[m[1]];
    const inner = renderParams(m[2], params, `i${i}`);
    out.push(<Fragment key={`g${i}`}>{render ? render(inner) : inner}</Fragment>);
    last = start + m[0].length;
    i++;
  }
  if (last < template.length) out.push(...renderParams(template.slice(last), params, "end"));
  return out;
}

function renderParams(text: string, params: Record<string, ParamValue | ReactNode>, keyPrefix: string): ReactNode[] {
  // Découpe AVANT substitution : une valeur ne peut pas injecter de paramètre.
  return text.split(/(\{\w+\})/g).filter((part) => part !== "").map((part, j) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    if (!name || !(name in params)) return part;
    const v = params[name];
    return typeof v === "string" || typeof v === "number"
      ? String(v)
      : <Fragment key={`${keyPrefix}-${j}`}>{v}</Fragment>;
  });
}
