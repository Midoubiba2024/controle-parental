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

// Formateurs TOTAUX : une date invalide ou un nombre non fini (donnée absente,
// corrompue…) s'affiche « — » au lieu de lever une RangeError (écran blanc).
const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

/** Date/heure avec options Intl libres ; par défaut comme toLocaleDateString() : « 04/10/2026 ». */
export function date(
  d: DateInput, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" },
): string {
  const value = toDate(d);
  if (!isValidDate(value)) return t("common.none");
  return cached("dt", opts, (l) => new Intl.DateTimeFormat(l, opts)).format(value);
}

const HM: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function relative(d: DateInput, inSentence: boolean): string {
  const value = toDate(d);
  if (!isValidDate(value)) return t("common.none");
  const now = new Date();
  const time = date(value, HM);
  if (sameDay(value, now)) return inSentence ? t("units.when.today", { time }) : time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(value, yesterday)) return t("units.when.yesterday", { time });
  const day = date(value, value.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
  return t(inSentence ? "units.when.datedInSentence" : "units.when.dated", { date: day, time });
}

/**
 * Date et heure RELATIVES, sans secondes, format unique des cellules et listes :
 * « 06:40 » (aujourd'hui), « hier à 18:12 », « 2 oct. à 18:12 » (cette année),
 * « 2 oct. 2025 à 18:12 » (années précédentes).
 */
export function dateTime(d: DateInput): string {
  return relative(d, false);
}

/**
 * Même chose, mais à insérer DANS une phrase (« dernier signal {when} ») :
 * « à 06:40 », « hier à 18:12 », « le 2 oct. à 18:12 ».
 */
export function at(d: DateInput): string {
  return relative(d, true);
}

/** Pourcentage à partir d'un nombre 0–100 : « 76 % » ; `signed` → « +32 % » / « −5 % ». */
export function percent(value: number, signed = false): string {
  if (!Number.isFinite(value)) return t("common.none");
  return number(value / 100, { style: "percent", maximumFractionDigits: 0, ...(signed ? { signDisplay: "exceptZero" } : {}) });
}

/** Heure ; par défaut sans secondes : « 07:43 ». */
export function time(d: DateInput, opts: Intl.DateTimeFormatOptions = HM): string {
  return date(d, opts);
}

/** Nombre selon la langue (séparateurs décimaux et de milliers). */
export function number(n: number, opts: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(n)) return t("common.none");
  return cached("num", opts, (l) => new Intl.NumberFormat(l, opts)).format(n);
}

/** Durée lisible à partir de millisecondes : « 2 h 35 », « 48 min », « 40 s ». */
export function duration(ms: number): string {
  if (Number.isNaN(ms) || ms === Infinity) return t("common.none");
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

/** Durée courte (étiquettes de barres) : « 45 min », « 2 h », « 2 h 30 ». */
export function durationShort(ms: number): string {
  if (!Number.isFinite(ms)) return t("common.none");
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("units.durationShort.minutes", { m: number(m) });
  return m === 0
    ? t("units.durationShort.hours", { h: number(h) })
    : t("units.durationShort.hoursMinutes", { h: number(h), m: number(m, { minimumIntegerDigits: 2 }) });
}

/** Taille en octets : « 512 o », « 1,5 Mo », « 12 Go ». null → « — ». */
export function bytes(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return t("common.none");
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
  const value = toDate(d);
  if (!isValidDate(value)) return t("common.none");
  const diff = Date.now() - value.getTime();
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

/** Nom d'une langue dans SA propre langue (« français », « العربية »). */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

export const fmt = { date, dateTime, at, time, number, percent, duration, durationShort, bytes, ago, dayLabel, languageName };
export type Fmt = typeof fmt;
