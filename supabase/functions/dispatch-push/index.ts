// Edge Function : dispatch-push  (LOT 5)
//
// Accélère la livraison des COMMANDES (pause/verrouillage…) et des MESSAGES vers
// l'appareil enfant en envoyant un push FCM "data-only" {type:"sync"} : l'appareil,
// réveillé, déclenche immédiatement sa synchro (commands/messages). Le modèle ne
// DÉPEND PAS de FCM — le polling (SupervisionService + WorkManager) reste le socle
// fiable sous Doze ; ce push ne fait que réduire la latence.
//
// CONFORMITÉ : le push ne transporte AUCUN contenu sensible — juste un signal
// "synchronise-toi". L'action visible (overlay, message) vient du contenu réel
// lu par l'appareil sous RLS. Aucun contenu de tiers.
//
// Entrée : { child_id }  (JWT parent requis). Pousse vers tous les appareils
//          actifs de cet enfant dans la famille du parent.
// Sortie : { sent, skipped, reason? }
//
// ACTIVATION (infra, à faire en L5/L8) : définir dans les secrets du projet
// (Vault / variables d'environnement de la fonction) un compte de service FCM :
//   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (PEM PKCS8).
// Et côté app enfant : google-services.json + réception FCM. Sans ces secrets,
// la fonction renvoie reason:"fcm_not_configured" (non bloquant).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") bytes = new TextEncoder().encode(data);
  else if (data instanceof Uint8Array) bytes = data;
  else bytes = new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// fetch borné dans le temps (#9) : évite qu'une fonction reste bloquée si Google
// ne répond pas. 5 s par appel réseau.
async function fetchWithTimeout(url: string, init: RequestInit, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Mint un jeton OAuth2 Google à partir du compte de service (grant JWT-bearer).
async function fcmAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64url(sig)}`;

  const resp = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tok = await resp.json();
  if (!resp.ok || !tok.access_token) {
    throw new Error(`oauth_failed: ${tok.error ?? resp.status}`);
  }
  return tok.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  let body: { child_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const childId = (body.child_id ?? "").trim();
  if (!childId) return json({ error: "missing_child_id" }, 400);

  // Identité de l'appelant + vérification d'appartenance via RLS : si le parent
  // n'est pas membre de la famille de l'enfant, la ligne children est invisible.
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);
  const { data: child, error: childErr } = await userClient
    .from("children").select("id, family_id").eq("id", childId).maybeSingle();
  if (childErr || !child) return json({ error: "forbidden" }, 403);

  // Jetons push des appareils actifs de l'enfant (service role).
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: devices } = await admin
    .from("devices").select("id").eq("child_id", childId).is("revoked_at", null);
  const deviceIds = (devices ?? []).map((d: { id: string }) => d.id);
  if (deviceIds.length === 0) return json({ sent: 0, skipped: 0, reason: "no_active_device" });

  const { data: tokens } = await admin
    .from("device_push_tokens").select("token").eq("provider", "fcm").in("device_id", deviceIds);
  const tokenList = (tokens ?? []).map((t: { token: string }) => t.token);
  if (tokenList.length === 0) return json({ sent: 0, skipped: 0, reason: "no_push_token" });

  // FCM configuré ?
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = (Deno.env.get("FCM_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    // Non bloquant : le polling de l'appareil prendra le relais.
    return json({ sent: 0, skipped: tokenList.length, reason: "fcm_not_configured" });
  }

  let accessToken: string;
  try {
    accessToken = await fcmAccessToken(clientEmail, privateKey);
  } catch (_e) {
    // #14 : non bloquant (comme fcm_not_configured) ; pas de détail brut exposé.
    // Le polling de l'appareil reste le socle de livraison.
    return json({ sent: 0, skipped: tokenList.length, reason: "fcm_auth_failed" });
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  let sent = 0;
  for (const token of tokenList) {
    const message = {
      message: {
        token,
        // Data-only : aucun contenu sensible, juste un signal de synchro.
        data: { type: "sync" },
        android: { priority: "HIGH" },
      },
    };
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (r.ok) sent++;
    } catch { /* best-effort (timeout inclus) : le polling reste le socle */ }
  }

  return json({ sent, skipped: tokenList.length - sent });
});
