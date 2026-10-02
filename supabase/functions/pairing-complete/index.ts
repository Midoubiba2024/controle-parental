// Edge Function : pairing-complete
// L'appareil enfant échange le code d'appairage contre un enrôlement.
// - vérifie le code (non consommé, non expiré)
// - crée/relie un compte auth "enfant" au profil children
// - crée la ligne devices (mode standard/renforcé)
// - renvoie une session Supabase pour que l'appareil agisse comme l'enfant
//
// Entrée : { code, device: { platform?, model?, os_version?, public_key?, label? } }
// Sortie : { device_id, family_id, child_id, session, supabase_url }
//
// Sécurité : pas de JWT requis (l'appareil n'est pas encore enrôlé). La garantie
// vient du code court, à usage unique et à durée de vie limitée, généré par le parent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS (voir supabase/functions/_shared/cors.ts pour la version de référence).
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPassword(): string {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PEPPER = Deno.env.get("PAIRING_PEPPER") ?? "";

  let body: { code?: string; device?: Record<string, string> };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const code = (body.code ?? "").trim();
  const device = body.device ?? {};
  if (!/^\d{8}$/.test(code)) return json({ error: "invalid_code_format" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const code_hash = await sha256Hex(`${PEPPER}:${code}`);
  const { data: pairing } = await admin
    .from("pairing_codes").select("*").eq("code_hash", code_hash).maybeSingle();

  if (!pairing) return json({ error: "code_not_found" }, 404);
  if (pairing.consumed_at) return json({ error: "code_already_used" }, 409);
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return json({ error: "code_expired" }, 410);
  }

  // Profil enfant + compte auth associé (créé si absent).
  const { data: child } = await admin
    .from("children").select("*").eq("id", pairing.child_id).single();

  const childEmail = `child.${child.id}@device.pair`;
  const password = randomPassword();
  let childUserId = child.user_id as string | null;

  if (!childUserId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: childEmail, password, email_confirm: true,
      app_metadata: { role: "child", child_id: child.id, family_id: pairing.family_id },
    });
    if (cErr || !created?.user) {
      return json({ error: "child_user_create_failed", detail: cErr?.message }, 500);
    }
    childUserId = created.user.id;
    await admin.from("children").update({ user_id: childUserId }).eq("id", child.id);
    // Appartenance "child" à la famille (pour la RLS côté enfant).
    await admin.from("memberships")
      .insert({ family_id: pairing.family_id, user_id: childUserId, role: "child" });
  } else {
    // Ré-appairage : réinitialiser le mot de passe pour obtenir une session.
    const { error: uErr } = await admin.auth.admin.updateUserById(childUserId, { password });
    if (uErr) return json({ error: "child_user_update_failed", detail: uErr.message }, 500);
  }

  // Création de l'appareil.
  const { data: dev, error: devErr } = await admin.from("devices").insert({
    family_id: pairing.family_id,
    child_id: child.id,
    platform: device.platform ?? "android",
    mode: pairing.mode,
    label: device.label ?? null,
    model: device.model ?? null,
    os_version: device.os_version ?? null,
    public_key: device.public_key ?? null,
    enrolled_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }).select().single();
  if (devErr) return json({ error: "device_insert_failed", detail: devErr.message }, 500);

  // Consommer le code (usage unique).
  await admin.from("pairing_codes").update({ consumed_at: new Date().toISOString() })
    .eq("id", pairing.id);

  // Session pour l'appareil (agit comme le compte enfant).
  const anonClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: sErr } =
    await anonClient.auth.signInWithPassword({ email: childEmail, password });
  if (sErr || !signIn?.session) {
    return json({ error: "child_signin_failed", detail: sErr?.message }, 500);
  }

  await admin.from("audit_log").insert({
    family_id: pairing.family_id, actor_id: childUserId, actor_role: "child",
    action: "device.enrolled", subject_child_id: child.id,
    target_table: "devices", target_id: dev.id,
    detail: { mode: pairing.mode, platform: dev.platform, model: dev.model },
  });

  return json({
    device_id: dev.id,
    family_id: pairing.family_id,
    child_id: child.id,
    mode: pairing.mode,
    supabase_url: SUPABASE_URL,
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
  });
});
