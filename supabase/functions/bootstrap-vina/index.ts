// One-shot bootstrap: create vina@husada.com as super_admin with password 123456.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const j = (d: any, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const email = "vina@husada.com";
    const password = "123456";

    // Find existing
    let uid: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (found) {
      uid = found.id;
      await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: "Vina" },
      });
      if (error || !created.user) return j({ error: error?.message || "create failed" }, 400);
      uid = created.user.id;
    }

    await admin.from("profiles").upsert(
      { id: uid, email, full_name: "Vina", position: "Super Admin" },
      { onConflict: "id" },
    );
    await admin.from("user_roles").delete().eq("user_id", uid);
    await admin.from("user_roles").insert({ user_id: uid, role: "super_admin" });

    return j({ ok: true, id: uid, email, password });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
