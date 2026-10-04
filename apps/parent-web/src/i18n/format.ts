import { getLocale, t } from "./core";

/* =============================================================================
   Formats dépendant de la langue active : TOUT passe par Intl.* (dates, heures,
   nombres, temps relatif, règles de pluriel) ; seuls les gabarits d'unités
   (« {h} h {mm} », « Ko »…) viennent du catalogue (`units.*`). Jamais de
   « fr-FR » codé en dur ailleurs dans l'appli.
   ============================================================================= */

type DateInput = string | number | Date;

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
  kind: string, opts: object, make: (locale: string) => T,
): T {
  const locale = getLocale();
  const k = `${kind}|${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(k) as T | undefined;
  if (!f) { f = make(locale); cache.set(k, f); }
  return f;
}

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

/** Date/heure avec options Intl libres (ex. { weekday: "short", day: "numeric" }). */
export function date(d: DateInput, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return cached("dt", opts, (l) => new Intl.DateTimeFormat(l, opts)).format(toDate(d));
}

/** Date et heure courtes : « 04/10 07:43 ». */
export function dateTime(d: DateInput): string {
  return date(d, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Heure : « 07:43 » (ou avec secondes si demandé). */
export function time(d: DateInput, opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }): string {
  return date(d, opts);
}

/** Nombre selon la langue (séparateurs décimaux et de milliers). */
export function number(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return cached("num", opts, (l) => new Intl.NumberFormat(l, opts)).format(n);
}

/** Durée lisible à partir de millisecondes : « 2 h 35 », « 48 min », « 40 s ». */
export function duration(ms: number): string {
  if (!ms || ms < 0) return t("units.duration.minutes", { m: number(0) });
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return t("units.duration.seconds", { s: number(Math.round(ms / 1000)) });
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("units.duration.minutes", { m: number(m) });
  return m === 0
    ? t("units.duration.hours", { h: number(h) })
    : t("units.duration.hoursMinutes", { h: number(h), mm: number(m, { minimumIntegerDigits: 2 }) });
}

/** Durée courte pour axes : « 2h », « 45m », « 2h30 ». */
export function durationShort(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("units.durationShort.minutes", { m: number(m) });
  return m === 0
    ? t("units.durationShort.hours", { h: number(h) })
    : t("units.durationShort.hoursMinutes", { h: number(h), m: number(m) });
}

/** Taille en octets : « 512 o », « 1,5 Mo », « 12 Go ». null → « — ». */
export function bytes(value: number | null): string {
  if (value == null) return t("common.none");
  const units = [
    t("units.bytes.b"), t("units.bytes.kb"), t("units.bytes.mb"), t("units.bytes.gb"), t("units.bytes.tb"),
  ];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const digits = v >= 10 || i === 0 ? 0 : 1;
  return t("units.bytes.pattern", {
    value: number(v, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    unit: units[i],
  });
}

/** Temps écoulé : « à l'instant », « il y a 5 min », « il y a 2 h », « il y a 3 j ». */
export function ago(d: DateInput): string {
  const diff = Date.now() - toDate(d).getTime();
  const min = Math.floor(diff / 60000);
  if (diff < 0 || min < 1) return t("units.justNow");
  const rtf = cached("rel", {}, (l) => new Intl.RelativeTimeFormat(l, { style: "short", numeric: "always" }));
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.floor(h / 24), "day");
}

/** Libellé court d'un jour (clé YYYY-MM-DD) : « lun. 30 ». */
export function dayLabel(day: string): string {
  return date(new Date(day + "T00:00:00"), { weekday: "short", day: "numeric" });
}

/** Liste lisible : « a, b et c » (Intl.ListFormat). */
export function list(items: string[], type: "conjunction" | "disjunction" | "unit" = "conjunction"): string {
  const ListFormat = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format(i: string[]): string } }).ListFormat;
  if (!ListFormat) return items.join(", ");
  return new ListFormat(getLocale(), { style: "long", type }).format(items);
}

/** Nom d'une langue dans SA propre langue (« français », « العربية »). */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

export const fmt = { date, dateTime, time, number, duration, durationShort, bytes, ago, dayLabel, list, languageName };
export type Fmt = typeof fmt;
