// Edge Function : pairing-start
// Le parent génère un code d'appairage court pour un appareil enfant.
// Le code n'est renvoyé EN CLAIR qu'une seule fois ; seul son hash est stocké.
//
// Entrée : { family_id, child_id, mode?: "standard"|"reinforced" }  (JWT parent)
// Sortie : { code: string, expires_at: string }

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

const TTL_MINUTES = 10;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Code à 8 chiffres, tiré d'une source cryptographique.
function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000;
  return n.toString().padStart(8, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PEPPER = Deno.env.get("PAIRING_PEPPER") ?? ""; // secret serveur optionnel

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);
  const user = userData.user;

  let body: { family_id?: string; child_id?: string; mode?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { family_id, child_id } = body;
  const mode = body.mode === "reinforced" ? "reinforced" : "standard";
  if (!family_id || !child_id) return json({ error: "missing_params" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Autorisation : l'appelant doit être parent/owner/guardian de la famille…
  const { data: membership } = await admin
    .from("memberships").select("role")
    .eq("family_id", family_id).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "parent", "guardian"].includes(membership.role)) {
    return json({ error: "forbidden" }, 403);
  }
  // …et l'enfant doit appartenir à cette famille.
  const { data: child } = await admin
    .from("children").select("id").eq("id", child_id).eq("family_id", family_id).maybeSingle();
  if (!child) return json({ error: "child_not_in_family" }, 404);

  const code = generateCode();
  const code_hash = await sha256Hex(`${PEPPER}:${code}`);
  const expires_at = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();

  const { error: insErr } = await admin.from("pairing_codes").insert({
    family_id, child_id, code_hash, mode, expires_at, created_by: user.id,
  });
  if (insErr) return json({ error: "pairing_insert_failed", detail: insErr.message }, 500);

  await admin.from("audit_log").insert({
    family_id, actor_id: user.id, actor_role: membership.role,
    action: "pairing.code_created", subject_child_id: child_id,
    target_table: "pairing_codes", detail: { mode, ttl_minutes: TTL_MINUTES },
  });

  return json({ code, expires_at, mode });
});
