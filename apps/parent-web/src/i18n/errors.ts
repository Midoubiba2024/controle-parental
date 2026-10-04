import { t } from "./core";
import type { MessageKey } from "./types";

/* =============================================================================
   Messages d'erreur traduits. On n'affiche JAMAIS le message brut d'une erreur
   (souvent en anglais, technique, ou figé en français côté SQL) : on reconnaît
   le code renvoyé par le backend (RPC, Edge Functions, Auth, PostgREST) et on
   le traduit ; à défaut, message générique. Le détail brut part en console pour
   le diagnostic.
   ============================================================================= */

type ErrorKey = Extract<MessageKey, `errors.${string}`>;

/**
 * Codes « métier » : levés par nos RPC / Edge Functions (raise exception 'code',
 * souvent repris comme MESSAGE) et codes Supabase Auth (AuthError.code).
 * Prioritaires sur le SQLSTATE : ex. create_family lève 'invalid_name' avec
 * l'errcode générique 22023 → on veut « Nom invalide », pas « Valeur invalide ».
 */
const CODE_KEYS = new Map<string, ErrorKey>(Object.entries({
  unauthenticated: "errors.unauthenticated",
  forbidden: "errors.forbidden",
  invalid_name: "errors.invalidName",
  missing_params: "errors.missingParams",
  missing_child_id: "errors.missingParams",
  child_not_in_family: "errors.childNotInFamily",
  invalid_code_format: "errors.invalidCode",
  code_not_found: "errors.invalidCode",
  code_expired: "errors.codeExpired",
  code_already_used: "errors.codeAlreadyUsed",
  // Supabase Auth (AuthError.code)
  invalid_credentials: "errors.invalidCredentials",
  email_not_confirmed: "errors.emailNotConfirmed",
  user_already_exists: "errors.userAlreadyExists",
  email_exists: "errors.userAlreadyExists",
  weak_password: "errors.weakPassword",
  same_password: "errors.samePassword",
  email_address_invalid: "errors.emailInvalid",
  email_address_not_authorized: "errors.emailNotAuthorized",
  signup_disabled: "errors.signupDisabled",
  email_provider_disabled: "errors.signupDisabled",
  validation_failed: "errors.invalidInput",
  captcha_failed: "errors.captchaFailed",
  user_banned: "errors.userBanned",
  over_email_send_rate_limit: "errors.rateLimited",
  over_request_rate_limit: "errors.rateLimited",
  session_expired: "errors.sessionExpired",
  PGRST301: "errors.sessionExpired",    // PostgREST : JWT expiré
} satisfies Record<string, ErrorKey>));

/** SQLSTATE PostgreSQL (repli après les codes métier et les messages connus). */
const SQLSTATE_KEYS = new Map<string, ErrorKey>(Object.entries({
  "42501": "errors.forbidden",          // insufficient_privilege (RLS)
  "28000": "errors.unauthenticated",
  "23505": "errors.duplicate",          // unique_violation
  "23503": "errors.notFound",           // foreign_key_violation (élément lié introuvable)
  "23514": "errors.invalidInput",       // check_violation
  "23502": "errors.invalidInput",       // not_null_violation
  "22001": "errors.invalidInput",       // string_data_right_truncation (trop long)
  "22P02": "errors.invalidInput",       // invalid_text_representation
  "22023": "errors.invalidInput",       // invalid_parameter_value
} satisfies Record<string, ErrorKey>));

/** Messages historiques en clair (RPC RGPD, migration 0022) et messages réseau → clés. */
const MESSAGE_PATTERNS: [RegExp, ErrorKey][] = [
  [/^enfant introuvable/i, "errors.childNotFound"],
  [/^accès refusé : seul le propriétaire/i, "errors.ownerRequired"],
  [/^accès refusé/i, "errors.forbidden"],
  [/invalid login credentials/i, "errors.invalidCredentials"],
  [/email not confirmed/i, "errors.emailNotConfirmed"],
  [/user already registered/i, "errors.userAlreadyExists"],
  [/jwt expired/i, "errors.sessionExpired"],
  [/failed to fetch|networkerror|load failed|network request failed/i, "errors.network"],
];

interface ErrorFields { code?: string; message?: string; name?: string; status?: number }

function fields(err: unknown): ErrorFields {
  if (err == null) return {};
  if (typeof err === "string") return { message: err };
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      code: str(o.code) ?? str(o.error),
      message: str(o.message) ?? str(o.error_description) ?? str(o.msg),
      name: str(o.name),
      status: typeof o.status === "number" ? o.status : undefined,
    };
  }
  return { message: String(err) };
}

/** Clé de traduction correspondant à une erreur (exportée pour les tests/usages fins). */
export function errorKey(err: unknown): ErrorKey {
  const { code, message, name, status } = fields(err);
  const byCode = code ? CODE_KEYS.get(code) : undefined;
  if (byCode) return byCode;
  const msg = message?.trim();
  if (msg) {
    // Les RPC lèvent souvent le code comme message (raise exception 'forbidden').
    const byMessage = CODE_KEYS.get(msg);
    if (byMessage) return byMessage;
    for (const [re, key] of MESSAGE_PATTERNS) if (re.test(msg)) return key;
  }
  const bySqlState = code ? SQLSTATE_KEYS.get(code) : undefined;
  if (bySqlState) return bySqlState;
  // Service Auth/API momentanément indisponible (5xx, ou échec réseau réessayable).
  if (name === "AuthRetryableFetchError" || (status !== undefined && status >= 500)) {
    return "errors.serviceUnavailable";
  }
  return "errors.generic";
}

/** Message d'erreur affichable, dans la langue active. */
export function errorMessage(err: unknown): string {
  const key = errorKey(err);
  if (key === "errors.generic" && err != null) console.warn("[erreur non répertoriée]", err);
  return t(key);
}
