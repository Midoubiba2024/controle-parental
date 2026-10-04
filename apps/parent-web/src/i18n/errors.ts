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

/** Codes « métier » levés par nos RPC / Edge Functions (raise exception 'code'). */
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
  over_email_send_rate_limit: "errors.rateLimited",
  over_request_rate_limit: "errors.rateLimited",
  session_expired: "errors.sessionExpired",
  // PostgreSQL / PostgREST
  "42501": "errors.forbidden",          // insufficient_privilege (RLS)
  "23505": "errors.duplicate",          // unique_violation
  "28000": "errors.unauthenticated",
  PGRST301: "errors.sessionExpired",    // JWT expiré
} satisfies Record<string, ErrorKey>));

/** Messages historiques en clair (RPC RGPD, migration 0022) → clés. */
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

function fields(err: unknown): { code?: string; message?: string } {
  if (err == null) return {};
  if (typeof err === "string") return { message: err };
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      code: str(o.code) ?? str(o.error),
      message: str(o.message) ?? str(o.error_description) ?? str(o.msg),
    };
  }
  return { message: String(err) };
}

/** Clé de traduction correspondant à une erreur (exportée pour les tests/usages fins). */
export function errorKey(err: unknown): ErrorKey {
  const { code, message } = fields(err);
  const byCode = code ? CODE_KEYS.get(code) : undefined;
  if (byCode) return byCode;
  if (message) {
    // Les RPC lèvent souvent le code comme message (raise exception 'forbidden').
    const asCode = message.trim();
    const byMessage = CODE_KEYS.get(asCode);
    if (byMessage) return byMessage;
    for (const [re, key] of MESSAGE_PATTERNS) if (re.test(asCode)) return key;
  }
  return "errors.generic";
}

/** Message d'erreur affichable, dans la langue active. */
export function errorMessage(err: unknown): string {
  const key = errorKey(err);
  if (key === "errors.generic" && err != null) console.warn("[erreur non répertoriée]", err);
  return t(key);
}
