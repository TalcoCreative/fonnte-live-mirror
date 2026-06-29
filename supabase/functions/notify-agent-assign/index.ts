// Notify agent via WhatsApp when assigned to a conversation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

  function json(d: any, s = 200) {
    return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const assigner = userRes.user;
    if (!assigner) return json({ error: "Unauthorized" }, 401);

    const { conversation_id, agent_id } = await req.json();
    if (!conversation_id || !agent_id) return json({ error: "conversation_id & agent_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Don't notify self-assign
    if (agent_id === assigner.id) return json({ ok: true, skipped: "self-assign" });

    const [{ data: agent }, { data: assignerProf }, { data: conv }, { data: settings }] = await Promise.all([
      admin.from("profiles").select("id, full_name, email, phone").eq("id", agent_id).maybeSingle(),
      admin.from("profiles").select("full_name, email").eq("id", assigner.id).maybeSingle(),
      admin.from("conversations").select("id, contact:contacts(full_name, whatsapp_number, chief_complaint, interested_product_id, product:products!contacts_interested_product_id_fkey(name))").eq("id", conversation_id).maybeSingle(),
      admin.from("system_settings").select("key,value").in("key", ["fonnte_api_key", "fonnte_device"]),
    ]);

    if (!agent?.phone) return json({ ok: false, skipped: "agent has no phone" });
    const api_key = settings?.find((s: any) => s.key === "fonnte_api_key")?.value;
    const deviceNum = settings?.find((s: any) => s.key === "fonnte_device")?.value;
    if (!api_key) return json({ ok: false, skipped: "no api key" });


    const c: any = conv?.contact || {};
    const productName = c.product?.name || "—";
    const assignerName = assignerProf?.full_name || assignerProf?.email?.split("@")[0] || "Admin";

    const message = `🔔 *Penugasan Baru*\n\nHi *${agent.full_name || "Agent"}*, kamu di-assign oleh *${assignerName}* untuk merespon lead:\n\n👤 Nama: *${c.full_name || "—"}*\n📱 WhatsApp: ${c.whatsapp_number || "—"}\n🩺 Keluhan: ${c.chief_complaint || "—"}\n📦 Produk: ${productName}\n\nMohon segera ditindaklanjuti di CRM.`;

    // Normalize phone: ensure starts with 62
    let phone = String(agent.phone).replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    if (!phone.startsWith("62")) phone = "62" + phone;

    const fd = new FormData();
    fd.append("target", phone);
    fd.append("message", message);
    const fres = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: api_key },
      body: fd,
    });
    const fdata = await fres.json().catch(() => ({}));
    return json({ ok: fres.ok, fonnte: fdata });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
