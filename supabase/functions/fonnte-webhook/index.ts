// Public webhook receiver for Fonnte incoming messages — runs Dynamic Workflow + mirrors device-sent outbound
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

function detectMediaType(url: string, ext?: string): "IMAGE" | "DOCUMENT" | "AUDIO" {
  const e = (ext || url.split(".").pop() || "").toLowerCase();
  if (/^(jpg|jpeg|png|gif|webp|bmp)$/.test(e)) return "IMAGE";
  if (/^(mp3|ogg|wav|m4a|opus|aac)$/.test(e)) return "AUDIO";
  return "DOCUMENT";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("Webhook ready", { headers: corsHeaders });

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

    const sender = payload.sender || payload.from || payload.number;
    const rawMessage = String(payload.message || payload.text || payload.body || "");
    const WATERMARK_RE = /\s*>?\s*_?Sent via fonnte\.com_?\s*$/i;
    const hasWatermark = /Sent via fonnte\.com/i.test(rawMessage);
    const message = rawMessage.replace(WATERMARK_RE, "").trim();
    const waName = (payload.name || payload.pushname || payload.sender_name || "").toString().trim() || null;
    const fonnteMsgId = payload.id || payload.message_id || null;
    const deviceField = payload.device || payload.device_number || null;
    const mediaUrl = (payload.url || payload.file || payload.media || "").toString().trim() || null;
    const mediaExt = (payload.extension || payload.filename || "").toString();
    const fromMe = payload.fromMe === true || payload.fromMe === "true" || payload.from_me === true || payload.fromme === true;

    if (!sender) return json({ ok: false, error: "no sender" }, 400);
    if (!rawMessage && !mediaUrl && (payload.state || payload.status)) return json({ ok: true, skip: "status-callback" });

    // For fromMe (device-sent outbound), `sender` is OUR device; the recipient is in payload.target/to/receiver.
    const target = (payload.target || payload.to || payload.receiver || payload.recipient || "").toString();
    const contactNumber = fromMe ? normalizePhone(target) : normalizePhone(sender);

    if (!contactNumber || contactNumber.length < 6) return json({ ok: true, skip: "no-contact-number" });

    const { data: settingsRows } = await admin.from("system_settings").select("key,value")
      .in("key", ["fonnte_device", "fonnte_api_key", "active_workflow_id"]);
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { settings[r.key] = r.value; });

    // Find/create contact based on the customer's number (not the device)
    let { data: contact } = await admin.from("contacts").select("*").eq("whatsapp_number", contactNumber).maybeSingle();
    if (!contact) {
      const { data: defaultStage } = await admin.from("stages").select("id").eq("is_default", true).maybeSingle();
      const { data: newC } = await admin.from("contacts").insert({
        whatsapp_number: contactNumber, full_name: fromMe ? null : waName, stage_id: defaultStage?.id || null,
        source: "whatsapp", last_interaction_at: new Date().toISOString(), total_messages: 0,
      }).select().single();
      contact = newC!;
    } else if (!fromMe && !contact.full_name && waName) {
      await admin.from("contacts").update({ full_name: waName }).eq("id", contact.id);
      contact.full_name = waName;
    }

    let { data: conv } = await admin.from("conversations").select("*").eq("contact_id", contact.id).eq("status", "OPEN").order("created_at", { ascending: false }).maybeSingle();
    if (!conv) {
      const { data: newConv } = await admin.from("conversations").insert({
        contact_id: contact.id, status: "OPEN",
        first_inbound_at: fromMe ? null : new Date().toISOString(),
      }).select().single();
      conv = newConv!;
    }

    // Duplicate guard by fonnte id
    if (fonnteMsgId) {
      const { data: dup } = await admin.from("messages").select("id").eq("fonnte_message_id", String(fonnteMsgId)).limit(1).maybeSingle();
      if (dup) return json({ ok: true, skip: "duplicate-id" });
    }

    // ===== Outbound device mirror (fromMe = true) =====
    if (fromMe) {
      // Echo guard: ignore messages we already saved (sent from inbox)
      if (hasWatermark) return json({ ok: true, skip: "watermark-echo" });
      const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data: echoMatch } = await admin.from("messages").select("id")
        .eq("conversation_id", conv.id).eq("direction", "OUTBOUND")
        .eq("content", message).gte("sent_at", twoMinAgo).limit(1).maybeSingle();
      if (echoMatch) return json({ ok: true, skip: "echo-content" });

      const msgType = mediaUrl ? detectMediaType(mediaUrl, mediaExt) : "TEXT";
      // Attribute mirror to the conversation's active agent (assigned, else last replier)
      const { data: convInfo } = await admin.from("conversations")
        .select("assigned_agent_id,last_replied_by_id").eq("id", conv.id).maybeSingle();
      const attributedAgent = convInfo?.assigned_agent_id || convInfo?.last_replied_by_id || null;
      const insert: any = {
        conversation_id: conv.id, direction: "OUTBOUND", type: msgType,
        content: message || (mediaUrl ? "(attachment)" : ""),
        status: "DELIVERED", sent_by_id: attributedAgent,
        media_url: mediaUrl,
      };
      if (fonnteMsgId) insert.fonnte_message_id = String(fonnteMsgId);
      await admin.from("messages").insert(insert);

      await admin.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: (message || "(attachment)").slice(0, 100),
      }).eq("id", conv.id);

      return json({ ok: true, mirrored: "device-outbound" });
    }

    // Watermark check only applies to inbound text (filter our own outbound bounce-backs)
    if (hasWatermark) return json({ ok: true, skip: "watermark-echo" });

    const deviceNumber = settings.fonnte_device ? normalizePhone(settings.fonnte_device) : null;
    if (deviceNumber && contactNumber === deviceNumber) return json({ ok: true, skip: "self-device" });
    if (deviceField && normalizePhone(String(deviceField)) === contactNumber) return json({ ok: true, skip: "device-equals-sender" });
    // Reject events from other devices on the same Fonnte account
    if (deviceNumber && deviceField) {
      const dev = normalizePhone(String(deviceField));
      if (dev && dev !== deviceNumber) return json({ ok: true, skip: "other-device", device: dev, expected: deviceNumber });
    }


    // Echo content guard for inbound (rare but possible)
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    if (message) {
      const { data: echoMatch } = await admin.from("messages").select("id")
        .eq("conversation_id", conv.id).eq("direction", "OUTBOUND")
        .eq("content", message).gte("sent_at", fiveMinAgo).limit(1).maybeSingle();
      if (echoMatch) return json({ ok: true, skip: "echo-content" });
    }

    const msgType = mediaUrl ? detectMediaType(mediaUrl, mediaExt) : "TEXT";
    const insert: any = {
      conversation_id: conv.id, direction: "INBOUND", type: msgType,
      content: message || (mediaUrl ? "(attachment)" : ""),
      status: "DELIVERED", media_url: mediaUrl,
    };
    if (fonnteMsgId) insert.fonnte_message_id = String(fonnteMsgId);
    await admin.from("messages").insert(insert);

    await admin.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: (message || "(attachment)").slice(0, 100),
      unread_count: (conv.unread_count || 0) + 1,
      first_inbound_at: conv.first_inbound_at || new Date().toISOString(),
    }).eq("id", conv.id);

    await admin.from("contacts").update({
      last_interaction_at: new Date().toISOString(),
      total_messages: (contact.total_messages || 0) + 1,
    }).eq("id", contact.id);

    if (contact.chatbot_state !== "done" && settings.active_workflow_id && message) {
      await runWorkflow(admin, contact, message, conv.id, settings.fonnte_api_key, settings.active_workflow_id);
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

async function runWorkflow(admin: any, contact: any, message: string, convId: string, api_key: string | undefined, workflowId: string) {
  const { data: wf } = await admin.from("workflows").select("id,status,is_enabled").eq("id", workflowId).maybeSingle();
  if (!wf || wf.status !== "published" || !wf.is_enabled) return;
  const { data: steps } = await admin.from("workflow_steps").select("*").eq("workflow_id", workflowId).order("position");
  if (!steps?.length) return;

  let state = contact.chatbot_state as string | null;
  const data = (contact.chatbot_data as any) || {};
  const contactUpdates: any = {};

  const findIndex = (id: string | null) => id ? steps.findIndex((s: any) => s.id === id) : -1;
  let idx = findIndex(state);

  if (idx >= 0) {
    const cur = steps[idx];
    const result = await consumeAnswer(admin, cur, message);
    if (!result.ok) {
      await sendReply(admin, contact, convId, result.error || "Mohon coba lagi.", api_key);
      return;
    }
    data[cur.id] = result.value;
    if (cur.mapping) applyMapping(contactUpdates, cur.mapping, result.value);
    idx = idx + 1;
  } else {
    idx = 0;
  }

  while (idx < steps.length) {
    const step = steps[idx];

    if (step.type === "conditional") {
      const branch = (step.config?.branches || []).find((b: any) => {
        const ans = String(data[b.if_step_id] ?? "");
        if (b.op === "contains") return ans.toLowerCase().includes(String(b.value || "").toLowerCase());
        return ans.toLowerCase() === String(b.value || "").toLowerCase();
      });
      if (branch?.goto_step_id) { idx = findIndex(branch.goto_step_id); if (idx < 0) break; }
      else { idx++; }
      continue;
    }

    if (step.type === "message") {
      const text = await renderPrompt(admin, step, data);
      await sendReply(admin, contact, convId, text, api_key);
      idx++; continue;
    }

    if (step.type === "closing") {
      const text = await renderPrompt(admin, step, data);
      await sendReply(admin, contact, convId, text, api_key);
      contactUpdates.chatbot_state = "done";
      contactUpdates.chatbot_data = data;
      await admin.from("contacts").update(contactUpdates).eq("id", contact.id);
      return;
    }

    const prompt = await renderPrompt(admin, step, data);
    await sendReply(admin, contact, convId, prompt, api_key);
    contactUpdates.chatbot_state = step.id;
    contactUpdates.chatbot_data = data;
    await admin.from("contacts").update(contactUpdates).eq("id", contact.id);
    return;
  }

  contactUpdates.chatbot_state = "done";
  contactUpdates.chatbot_data = data;
  await admin.from("contacts").update(contactUpdates).eq("id", contact.id);
}

function applyMapping(updates: any, mapping: string, value: any) {
  const [table, field] = mapping.split(".");
  if (table !== "contacts" || !field) return;
  if (field === "age") {
    const n = parseInt(String(value), 10); if (Number.isFinite(n)) updates[field] = n;
  } else {
    updates[field] = value;
  }
}

async function renderPrompt(admin: any, step: any, _data: any): Promise<string> {
  let text = step.prompt || step.label || "";
  const meta = step.config || {};
  if ((step.type === "dropdown" || step.type === "radio" || step.type === "checkbox") && meta.source !== "products") {
    const opts: string[] = meta.options || [];
    text += "\n\n" + opts.map((o, i) => `${i + 1}. ${o}`).join("\n");
    if (step.type === "checkbox") text += "\n\n(Boleh pilih lebih dari satu, pisahkan dengan koma — contoh: 1,3)";
  }
  if ((step.type === "dropdown" || step.type === "radio") && meta.source === "products") {
    const { data: products } = await admin.from("products").select("id,name").eq("is_active", true).order("sort_order").limit(20);
    text += "\n\n" + (products || []).map((p: any, i: number) => `${i + 1}. ${p.name}`).join("\n");
  }
  return text;
}

async function consumeAnswer(admin: any, step: any, message: string): Promise<{ ok: boolean; value?: any; error?: string }> {
  const cfg = step.config || {};
  const msg = message.trim();
  if (!msg) return { ok: false, error: "Mohon kirim jawaban Anda." };

  switch (step.type) {
    case "input_text":
    case "textarea":
      return { ok: true, value: msg };
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg)) return { ok: false, error: "Format email tidak valid." };
      return { ok: true, value: msg.toLowerCase() };
    case "phone":
      if (!/^[+\d][\d\s\-]{6,}$/.test(msg)) return { ok: false, error: "Nomor telepon tidak valid." };
      return { ok: true, value: msg };
    case "number": {
      const n = Number(msg.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: "Mohon kirim angka." };
      return { ok: true, value: n };
    }
    case "date":
      if (!/\d{1,4}[\/\-]\d{1,2}([\/\-]\d{1,4})?/.test(msg)) return { ok: false, error: "Format tanggal tidak dikenali." };
      return { ok: true, value: msg };
    case "file":
      return { ok: true, value: msg };
    case "dropdown":
    case "radio": {
      let options: { id?: string; name: string }[] = [];
      if (cfg.source === "products") {
        const { data: products } = await admin.from("products").select("id,name").eq("is_active", true).order("sort_order").limit(20);
        options = (products || []).map((p: any) => ({ id: p.id, name: p.name }));
      } else {
        options = (cfg.options || []).map((o: string) => ({ name: o }));
      }
      const idx = parseInt(msg, 10);
      if (!Number.isInteger(idx) || idx < 1 || idx > options.length) {
        return { ok: false, error: `Mohon balas dengan angka 1 - ${options.length}.` };
      }
      const pick = options[idx - 1];
      return { ok: true, value: pick.id || pick.name };
    }
    case "checkbox": {
      const options: string[] = cfg.options || [];
      const picks = msg.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length);
      if (!picks.length) return { ok: false, error: `Mohon kirim nomor pilihan, contoh: 1,3` };
      return { ok: true, value: picks.map((i) => options[i - 1]).join(", ") };
    }
    default:
      return { ok: true, value: msg };
  }
}

async function sendReply(admin: any, contact: any, convId: string, text: string, api_key?: string) {
  if (!text) return;
  if (!api_key) { console.warn("no api_key, skip send"); return; }
  const fd = new FormData();
  fd.append("target", contact.whatsapp_number);
  fd.append("message", text);
  try {
    const fres = await fetch("https://api.fonnte.com/send", { method: "POST", headers: { Authorization: api_key }, body: fd });
    const fdata = await fres.json().catch(() => ({}));
    const fonnteId = Array.isArray(fdata.id) ? String(fdata.id[0]) : (fdata.id ? String(fdata.id) : null);
    await admin.from("messages").insert({
      conversation_id: convId, direction: "OUTBOUND", type: "TEXT",
      content: text, status: "SENT", fonnte_message_id: fonnteId,
    });
    await admin.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 100),
    }).eq("id", convId);
  } catch (e) {
    console.error("send err", e);
  }
}
