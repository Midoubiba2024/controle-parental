// Edge Function : pairing-complete — RETIRÉE (LOT 12). Ne fait plus RIEN : répond 410.
//
// L'appareil enfant ouvre une session ANONYME Supabase puis appelle supabase.rpc('pairing_complete', { p_code, p_device }).
// Remplacée par la RPC SECURITY DEFINER public.pairing_complete (migrations 0027/0028/0031).
//
// POURQUOI un bouchon plutôt que l'ancien code : l'ancienne version utilisait la
// clé service_role et, pour pairing-complete, répondait SANS JWT et SANS limite de
// tentatives (404/409/410/500 distincts) — un oracle de codes d'appairage qui
// contournait l'anti force brute de la RPC (revue de sécurité L12 #4). Ce bouchon
// n'utilise AUCUNE clé ni AUCUN secret et ne touche pas à la base.
// À dépublier (supabase functions delete pairing-complete) une fois les clients migrés ;
// retirer aussi le secret PAIRING_PEPPER des Edge Functions s'il est défini.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "endpoint_gone", use_rpc: "pairing_complete" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
