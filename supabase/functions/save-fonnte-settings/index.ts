// Save Fonnte settings (admin only). Validates key, auto-detects device, supports updates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const j = (d: any, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return j({ error: "Unauthorized (no token)" }, 401);

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return j({ error: "Unauthorized (invalid session)" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("is_admin", { _user_id: u.user.id });
    if (roleErr) return j({ error: "Role check failed: " + roleErr.message }, 500);
    if (!isAdmin) return j({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const api_key = typeof body.api_key === "string" ? body.api_key.trim() : "";
    const deviceIn = typeof body.device === "string" ? body.device.trim() : "";

    // Disconnect: when both fields cleared, remove stored settings.
    if (!api_key && !deviceIn) {
      await admin.from("system_settings").delete().in("key", ["fonnte_api_key", "fonnte_device"]);
      return j({ ok: true, disconnected: true, device: null });
    }

    let detectedDevice: string | null = null;
    let validateData: any = null;
    let validateOk = false;

    if (api_key) {
      try {
        const r = await fetch("https://api.fonnte.com/validate", {
          method: "GET", headers: { Authorization: api_key },
        });
        validateData = await r.json().catch(() => ({}));
        validateOk = r.ok && validateData?.status !== false;
        const d = validateData?.device;
        if (Array.isArray(d)) detectedDevice = String(d[0] || "");
        else if (d) detectedDevice = String(d);
      } catch (e) {
        console.error("validate fail", e);
      }

      const { error: e1 } = await admin
        .from("system_settings")
        .upsert({ key: "fonnte_api_key", value: api_key, updated_by: u.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (e1) return j({ error: "Save API key failed: " + e1.message }, 500);
    }

    const finalDevice = deviceIn || detectedDevice || "";
    if (finalDevice) {
      const { error: e2 } = await admin
        .from("system_settings")
        .upsert({ key: "fonnte_device", value: finalDevice, updated_by: u.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (e2) return j({ error: "Save device failed: " + e2.message }, 500);
    }

    return j({ ok: true, device: finalDevice || null, validate_ok: validateOk, validate: validateData });
  } catch (e) {
    console.error("save-fonnte-settings fatal", e);
    return j({ error: String(e) }, 500);
  }
});
