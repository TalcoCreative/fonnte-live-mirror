// Public webhook receiver for Fonnte incoming messages
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function normalizePhone(p: string): string {
  let n = String(p || "").replace(/[^\d]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("Fonnte webhook ready", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const json = (d: any, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    let payload: Record<string, any> = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) payload = await req.json();
    else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) payload[k] = typeof v === "string" ? v : "";
    }

    console.log("[fonnte-webhook] payload:", JSON.stringify(payload));

    const sender = payload.sender || payload.from || payload.number;
    const message = String(payload.message || payload.text || payload.body || "").trim();
    const name = payload.name || null;
    const fonnteMsgId = payload.id || payload.message_id || null;

    if (!sender) return json({ ok: false, error: "no sender" }, 400);
    if (payload.fromMe === true || payload.fromMe === "true") return json({ ok: true, skip: "fromMe" });

    const phone = normalizePhone(sender);

    let { data: contact } = await admin.from("contacts").select("*").eq("whatsapp_number", phone).maybeSingle();

    if (!contact) {
      const { data: defaultStage } = await admin.from("stages").select("id").eq("is_default", true).maybeSingle();
      const { data: newC } = await admin.from("contacts").insert({
        whatsapp_number: phone,
        full_name: name,
        stage_id: defaultStage?.id || null,
        source: "whatsapp",
        last_interaction_at: new Date().toISOString(),
        total_messages: 0,
      }).select().single();
      contact = newC!;
    }

    let { data: conv } = await admin.from("conversations").select("*").eq("contact_id", contact.id).eq("status", "OPEN").order("created_at", { ascending: false }).maybeSingle();
    if (!conv) {
      const { data: newConv } = await admin.from("conversations").insert({
        contact_id: contact.id, status: "OPEN", first_inbound_at: new Date().toISOString(),
      }).select().single();
      conv = newConv!;
    }

    const insert: any = {
      conversation_id: conv.id, direction: "INBOUND", type: "TEXT",
      content: message, status: "DELIVERED",
    };
    if (fonnteMsgId) insert.fonnte_message_id = `in_${fonnteMsgId}`;
    const { error: msgErr } = await admin.from("messages").insert(insert);
    if (msgErr && !msgErr.message.includes("duplicate")) console.error("msg insert err", msgErr);

    const convUpdates: any = {
      last_message_at: new Date().toISOString(),
      last_message_preview: message.slice(0, 100),
      unread_count: (conv.unread_count || 0) + 1,
    };
    if (!conv.first_inbound_at) convUpdates.first_inbound_at = new Date().toISOString();
    await admin.from("conversations").update(convUpdates).eq("id", conv.id);

    await admin.from("contacts").update({
      last_interaction_at: new Date().toISOString(),
      total_messages: (contact.total_messages || 0) + 1,
    }).eq("id", contact.id);

    // Chatbot
    if (contact.chatbot_state !== "done") {
      await runChatbot(admin, contact, message, conv.id);
    }

    return json({ ok: true, contact_id: contact.id, conversation_id: conv.id });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

async function runChatbot(admin: any, contact: any, message: string, convId: string) {
  const state = contact.chatbot_state;
  const data = contact.chatbot_data || {};
  let reply = "";
  let nextState = state;
  const updates: any = {};

  const { data: products } = await admin.from("products").select("id,name").eq("is_active", true).order("sort_order").limit(9);
  const productList = (products || []).map((p: any, i: number) => `${i + 1}. ${p.name}`).join("\n");

  if (!state || state === "greet") {
    reply = `Halo, selamat datang di Rumah Sakit Husada.\n\nMohon pilih layanan yang Anda butuhkan dengan mengetik angkanya:\n\n${productList}`;
    nextState = "ask_product";
  } else if (state === "ask_product") {
    const idx = parseInt(message, 10);
    if (Number.isInteger(idx) && products && idx >= 1 && idx <= products.length) {
      updates.interested_product_id = products[idx - 1].id;
      data.product_name = products[idx - 1].name;
      reply = `Anda memilih: ${products[idx - 1].name}.\n\nBoleh tahu nama lengkap Anda?`;
      nextState = "ask_name";
    } else {
      reply = `Mohon balas dengan angka pilihan layanan:\n\n${productList}`;
    }
  } else if (state === "ask_name") {
    updates.full_name = message.trim();
    reply = `Terima kasih, ${message.trim()}.\n\nDomisili Anda di kota mana?`;
    nextState = "ask_domicile";
  } else if (state === "ask_domicile") {
    updates.domicile = message.trim();
    reply = `Baik. Mohon ceritakan keluhan atau pertanyaan Anda secara singkat.`;
    nextState = "ask_complaint";
  } else if (state === "ask_complaint") {
    updates.chief_complaint = message.trim();
    reply = `Terima kasih atas informasinya. Tim agent Rumah Sakit Husada akan segera membalas Anda. Mohon menunggu.`;
    nextState = "done";
  }

  updates.chatbot_state = nextState;
  updates.chatbot_data = data;
  await admin.from("contacts").update(updates).eq("id", contact.id);

  if (reply) {
    const { data: settings } = await admin.from("system_settings").select("value").eq("key", "fonnte_api_key").maybeSingle();
    const api_key = settings?.value;
    if (api_key) {
      const fd = new FormData();
      fd.append("target", contact.whatsapp_number);
      fd.append("message", reply);
      try {
        const fres = await fetch("https://api.fonnte.com/send", { method: "POST", headers: { Authorization: api_key }, body: fd });
        const fdata = await fres.json().catch(() => ({}));
        const fonnteId = Array.isArray(fdata.id) ? String(fdata.id[0]) : (fdata.id ? String(fdata.id) : null);
        await admin.from("messages").insert({
          conversation_id: convId, direction: "OUTBOUND", type: "TEXT",
          content: reply, status: "SENT", fonnte_message_id: fonnteId,
        });
        await admin.from("conversations").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: reply.slice(0, 100),
        }).eq("id", convId);
      } catch (e) { console.error("chatbot send fail", e); }
    }
  }
}
