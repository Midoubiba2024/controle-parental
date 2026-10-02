// Edge Function : create-family
// Crée un foyer et l'appartenance "owner" du parent appelant, de façon atomique
// (via service_role, car la RLS interdit l'INSERT direct sur families/owner).
//
// Entrée  : { name: string }   (JWT parent requis dans Authorization)
// Sortie  : { family: {...} }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  // Client "utilisateur" pour identifier l'appelant depuis son JWT.
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);
  const user = userData.user;

  let body: { name?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 120) return json({ error: "invalid_name" }, 400);

  // Client privilégié : insertions atomiques (RLS contournée côté serveur).
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: family, error: famErr } = await admin
    .from("families")
    .insert({ name, created_by: user.id })
    .select()
    .single();
  if (famErr) return json({ error: "family_insert_failed", detail: famErr.message }, 500);

  const { error: memErr } = await admin
    .from("memberships")
    .insert({ family_id: family.id, user_id: user.id, role: "owner" });
  if (memErr) {
    // Compensation : éviter une famille orpheline sans owner.
    await admin.from("families").delete().eq("id", family.id);
    return json({ error: "membership_insert_failed", detail: memErr.message }, 500);
  }

  await admin.from("audit_log").insert({
    family_id: family.id, actor_id: user.id, actor_role: "owner",
    action: "family.created", target_table: "families", target_id: family.id,
    detail: { name },
  });

  return json({ family });
});
