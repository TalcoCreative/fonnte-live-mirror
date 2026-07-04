// Notify agent via WhatsApp when assigned to a conversation, or send a test message.
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

    const body = await req.json();
    const { conversation_id, agent_id, test, message: customMessage, mode, invitation_id } = body;
    if (!agent_id) return json({ error: "agent_id required" }, 400);
    if (!test && !conversation_id) return json({ error: "conversation_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Don't notify self-assign unless explicit test
    if (!test && agent_id === assigner.id) return json({ ok: true, skipped: "self-assign" });

    const [{ data: agent }, { data: assignerProf }, { data: settings }] = await Promise.all([
      admin.from("profiles").select("id, full_name, email, phone").eq("id", agent_id).maybeSingle(),
      admin.from("profiles").select("full_name, email").eq("id", assigner.id).maybeSingle(),
      admin.from("system_settings").select("key,value").in("key", ["fonnte_api_key", "fonnte_device"]),
    ]);

    if (!agent?.phone) return json({ ok: false, skipped: "agent has no phone" });
    const api_key = settings?.find((s: any) => s.key === "fonnte_api_key")?.value;
    const deviceNum = settings?.find((s: any) => s.key === "fonnte_device")?.value;
    if (!api_key) return json({ ok: false, skipped: "no api key" });

    let message: string;
    if (test) {
      message = customMessage?.trim() ||
        `Hi ${agent.full_name || "Agent"}, ini pesan test penugasan dari CRM Husada. Jika kamu menerima pesan ini, berarti nomor WhatsApp kamu sudah terhubung dengan benar.`;
    } else {
      const { data: conv } = await admin
        .from("conversations")
        .select("id, contact:contacts(full_name, whatsapp_number, chief_complaint, interested_product_id, product:products!contacts_interested_product_id_fkey(name))")
        .eq("id", conversation_id).maybeSingle();
      const c: any = conv?.contact || {};
      const productName = c.product?.name || "—";
      const assignerName = assignerProf?.full_name || assignerProf?.email?.split("@")[0] || "Admin";
      if (mode === "invitation") {
        message =
          `Hi ${agent.full_name || "Agent"}, kamu dapet *INVITATION* penugasan lead dari *${assignerName}* (First Response) di CRM Husada.\n\n` +
          `Nama Lead   : ${c.full_name || "—"}\n` +
          `WhatsApp    : ${c.whatsapp_number || "—"}\n` +
          `Produk      : ${productName}\n` +
          `Keluhan     : ${c.chief_complaint || "—"}\n\n` +
          `Kamu diundang untuk mengambil alih lead ini. Mohon cek dulu apakah data & isi chat sudah sesuai — bisa TERIMA untuk ambil alih, atau TOLAK jika belum layak follow-up (lead akan balik ke First Response).\n\n` +
          `Buka: /invitation/${invitation_id || ""}`;
      } else {
        message =
          `Hi ${agent.full_name || "Agent"}, kamu ditugaskan oleh ${assignerName} untuk menjawab lead di Inbox CRM Husada.\n\n` +
          `Nama Lead   : ${c.full_name || "—"}\n` +
          `WhatsApp    : ${c.whatsapp_number || "—"}\n` +
          `Produk      : ${productName}\n` +
          `Keluhan     : ${c.chief_complaint || "—"}\n\n` +
          `Mohon segera ditindaklanjuti.`;
      }
    }

    let phone = String(agent.phone).replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    if (!phone.startsWith("62")) phone = "62" + phone;

    const fd = new FormData();
    fd.append("target", phone);
    fd.append("message", message);
    if (deviceNum) fd.append("device", String(deviceNum).replace(/\D/g, ""));
    fd.append("countryCode", "62");

    const fres = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: api_key },
      body: fd,
    });
    const fdata = await fres.json().catch(() => ({}));
    const okFlag = fres.ok && (fdata?.status === true || fdata?.status === "true" || fdata?.detail?.toString().toLowerCase().includes("success") || fres.status === 200);
    return json({ ok: okFlag, gateway: fdata });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
