import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// tabs replaced with custom pill nav
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Husada CRM" }] }),
  component: SettingsPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function SettingsPage() {
  const [tab, setTab] = useState("gateway");
  const tabs = [
    { v: "gateway", label: "WhatsApp Gateway" },
    { v: "workflow", label: "Workflow" },
    { v: "quick", label: "Quick Replies" },
    { v: "products", label: "Produk" },
    { v: "team", label: "Tim Agent" },
    { v: "ops", label: "Shift & SLA" },
    { v: "webhook", label: "Webhook" },
  ];
  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi sistem, integrasi WhatsApp, tim, dan template balasan cepat.</p>
      </header>

      {/* Segmented pill nav — wraps cleanly on mobile */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-card border glow-soft">
        {tabs.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs md:text-sm font-medium transition-all ${
              tab === t.v ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/70 hover:bg-accent"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "gateway" && <FonnteTab />}
        {tab === "workflow" && <WorkflowTab />}
        {tab === "quick" && <QuickRepliesTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "team" && <TeamTab />}
        {tab === "ops" && <OpsTab />}
        {tab === "webhook" && <WebhookTab />}
      </div>

    </div>
  );
}


function QuickRepliesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    const { data } = await supabase.from("templates").select("*").eq("is_quick_reply", true).order("sort_order");
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !content.trim()) return toast.error("Nama & isi wajib diisi");
    const { error } = await supabase.from("templates").insert({
      name, content, is_quick_reply: true, sort_order: (rows[rows.length - 1]?.sort_order || 0) + 1, category: "custom",
    });
    if (error) toast.error(error.message);
    else { setName(""); setContent(""); load(); toast.success("Quick reply ditambahkan"); }
  }
  async function update(id: string, patch: any) {
    const { error } = await supabase.from("templates").update(patch).eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Dihapus"); load(); }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Tambah Quick Reply</CardTitle>
          <CardDescription>Gunakan placeholder <code className="text-xs bg-muted px-1 rounded">{"{agent}"}</code> untuk otomatis isi nama agent yang membalas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nama template (cth: Opening)" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea rows={3} placeholder="Isi pesan..." value={content} onChange={(e) => setContent(e.target.value)} />
          <Button onClick={add}>Tambah</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Quick Replies ({rows.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2">
              <Input value={r.name} onChange={(e) => setRows(rows.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))}
                onBlur={() => update(r.id, { name: r.name })} className="font-medium" />
              <Textarea rows={2} value={r.content}
                onChange={(e) => setRows(rows.map(x => x.id === r.id ? { ...x, content: e.target.value } : x))}
                onBlur={() => update(r.id, { content: r.content })} />
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>Hapus</Button>
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">Belum ada quick reply.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function FonnteTab() {
  const [apiKey, setApiKey] = useState("");
  const [device, setDevice] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testMsg, setTestMsg] = useState("Test pesan dari Husada CRM ✅");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_settings").select("key,value").in("key", ["fonnte_api_key", "fonnte_device"]);
      data?.forEach((r) => {
        if (r.key === "fonnte_api_key") setApiKey(r.value || "");
        if (r.key === "fonnte_device") setDevice(r.value || "");
      });
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/save-fonnte-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ api_key: apiKey, device }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(j.error || "Gagal menyimpan"); return; }
    if (j.device) { setDevice(j.device); toast.success(`Tersimpan · Device terhubung: ${j.device}`); }
    else { toast.success("Tersimpan (device tidak terdeteksi, periksa token)"); }
  }


  async function testConnection() {
    if (!apiKey) { toast.error("Masukkan API key dulu"); return; }
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fonnte-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const j = await res.json();
    setTestResult(j);
    setTesting(false);
    if (j.ok) toast.success("Gateway terkoneksi!");
    else toast.error("Koneksi gagal. Cek API key.");
  }

  async function testSend() {
    if (!testNumber) { toast.error("Masukkan nomor tujuan"); return; }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fonnte-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ target: testNumber, content: testMsg, is_test: true }),
    });
    const j = await res.json();
    setSending(false);
    if (j.ok) toast.success("Pesan test terkirim! Cek WhatsApp.");
    else toast.error(j.error || JSON.stringify(j.gateway || j.fonnte));
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5" /> WhatsApp Gateway API Key</CardTitle>
          <CardDescription>
            Hubungkan WhatsApp Gateway untuk mengirim dan menerima pesan otomatis. Token didapat dari dashboard penyedia gateway Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {device && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <div>
                <div className="font-medium text-emerald-700 dark:text-emerald-300">Device Aktif</div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-mono">{device}</div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API Token</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Token gateway WhatsApp" />
            <p className="text-[11px] text-muted-foreground">Setelah Simpan, sistem otomatis mendeteksi nomor device dari token ini.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nomor Device (opsional, otomatis terdeteksi)</Label>
            <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="628xxx (otomatis)" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing || !apiKey}>
              {testing && <Loader2 className="size-4 mr-2 animate-spin" />} Test Koneksi
            </Button>
          </div>
          {testResult && (
            <div className={`mt-2 p-3 rounded-md text-sm border ${testResult.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                {testResult.ok ? "Gateway terhubung" : "Gagal terhubung"}
              </div>
              <pre className="text-[11px] mt-2 overflow-x-auto opacity-80">{JSON.stringify(testResult.data || testResult, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Kirim Pesan</CardTitle>
          <CardDescription>Kirim pesan WhatsApp ke nomor manapun untuk memverifikasi koneksi end-to-end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nomor Tujuan (628xxx)</Label>
            <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="628123456789" />
          </div>
          <div className="space-y-1.5">
            <Label>Pesan</Label>
            <Textarea rows={3} value={testMsg} onChange={(e) => setTestMsg(e.target.value)} />
          </div>
          <Button onClick={testSend} disabled={sending}>
            {sending && <Loader2 className="size-4 mr-2 animate-spin" />} Kirim Test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookTab() {
  const url = `${SUPABASE_URL}/functions/v1/fonnte-webhook`;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Webhook URL untuk WhatsApp Gateway</CardTitle>
        <CardDescription>Copy URL ini ke <strong>dashboard gateway Anda → Device → URL Webhook</strong>, lalu centang event <em>incoming</em>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Disalin"); }}>
            <Copy className="size-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>✅ Pesan masuk akan otomatis bikin/lookup kontak + conversation.</p>
          <p>✅ Chatbot onboarding (3 pertanyaan) akan jalan untuk kontak baru.</p>
          <p>✅ UI Inbox menerima pesan secara realtime tanpa refresh.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function load() {
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name) return;
    const { error } = await supabase.from("products").insert({ name, description: desc });
    if (error) toast.error(error.message);
    else { setName(""); setDesc(""); load(); toast.success("Produk ditambahkan"); }
  }

  async function toggle(id: string, active: boolean) {
    await supabase.from("products").update({ is_active: !active }).eq("id", id);
    load();
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Tambah Produk</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nama produk" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Deskripsi (opsional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button onClick={add}>Tambah</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Produk</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-2">
                <div>
                  <div className="font-medium">{p.name} {!p.is_active && <Badge variant="secondary">nonaktif</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggle(p.id, p.is_active)}>
                  {p.is_active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </div>
            ))}
            {!products.length && <p className="text-sm text-muted-foreground">Belum ada produk.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  // Add-agent form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("62");
  const [role, setRole] = useState("agent");

  async function load() {
    setLoading(true);
    const [{ data: u }, { data: profiles }, { data: roles }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("id, email, full_name, position, phone, created_at").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setMe(u.user?.id || null);
    const roleMap: Record<string, string[]> = {};
    (roles || []).forEach((r: any) => { roleMap[r.user_id] = [...(roleMap[r.user_id] || []), r.role]; });
    setRows((profiles || []).map((p: any) => ({ ...p, roles: roleMap[p.id] || [] })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function callManageAgent(body: any) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Gagal");
    return j;
  }

  function normPhone(v: string): string {
    const d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) return "62" + d.slice(1);
    if (d.startsWith("62")) return d;
    return "62" + d;
  }

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast.error("Nama, email, dan password (min 6) wajib diisi");
      return;
    }
    setBusy(true);
    try {
      await callManageAgent({ action: "create", full_name: fullName, email, password, position, phone: normPhone(phone), role });
      toast.success(`Agent ${fullName} ditambahkan`);
      setFullName(""); setEmail(""); setPassword(""); setPosition(""); setPhone("62"); setRole("agent");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function deleteAgent(id: string, name: string) {
    if (id === me) { toast.error("Tidak bisa hapus akun sendiri"); return; }
    if (!confirm(`Hapus agent "${name}"? Aksi ini permanen.`)) return;
    setBusy(true);
    try {
      await callManageAgent({ action: "delete", user_id: id });
      toast.success("Agent dihapus");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function savePosition(id: string, value: string) {
    try {
      await callManageAgent({ action: "update", user_id: id, position: value });
      toast.success("Jabatan diperbarui");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Tambah Agent Baru</CardTitle>
          <CardDescription>
            Buat akun agent langsung — tanpa konfirmasi email. Pendaftaran mandiri di halaman login sudah dinonaktifkan, semua akun dibuat dari sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addAgent} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nama Lengkap</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Andi" />
            </div>
            <div className="space-y-1.5">
              <Label>Jabatan</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="cth: Front Office, Dokter, Supervisor" />
            </div>
            <div className="space-y-1.5">
              <Label>No. WhatsApp (62...)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6281234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@husada.id" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="agent">Agent</option>
                <option value="first_response">First Response Agent</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy} className="w-full md:w-auto">
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Tambah Agent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tim Agent ({rows.length})</CardTitle>
          <CardDescription>Semua agent dapat melihat & membalas chat di Inbox secara real-time.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Memuat...</div>
          ) : (
            <div className="border rounded-md divide-y">
              {rows.map((r) => (
                <div key={r.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      {r.full_name || r.email}
                      {r.id === me && <Badge variant="outline" className="text-[10px]">Anda</Badge>}
                      {r.roles.map((role: string) => (
                        <Badge key={role} variant={role.includes("admin") ? "default" : "secondary"} className="text-[10px]">
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                  </div>
                  <Input
                    defaultValue={r.position || ""}
                    placeholder="Jabatan..."
                    className="h-9 text-xs w-full md:w-44"
                    onBlur={(e) => {
                      if (e.target.value !== (r.position || "")) savePosition(r.id, e.target.value);
                    }}
                  />
                  <Input
                    defaultValue={r.phone || ""}
                    placeholder="62..."
                    className="h-9 text-xs w-full md:w-40"
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.phone || "")) {
                        try { await callManageAgent({ action: "update", user_id: r.id, phone: v }); toast.success("Nomor diperbarui"); load(); }
                        catch (err: any) { toast.error(err.message); }
                      }
                    }}
                  />
                  <Button
                    size="sm" variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={busy || r.id === me}
                    onClick={() => deleteAgent(r.id, r.full_name || r.email)}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
              {!rows.length && <p className="p-3 text-sm text-muted-foreground">Belum ada anggota tim.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Shift = { id: string; name: string; start_time: string; end_time: string; days_of_week: number[] | null; is_active: boolean };
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function OpsTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [slaGreen, setSlaGreen] = useState("5");
  const [slaYellow, setSlaYellow] = useState("10");
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [{ data: s }, { data: sg }, { data: sy }] = await Promise.all([
      supabase.from("shifts").select("*").order("start_time"),
      supabase.from("system_settings").select("value").eq("key", "sla_green_minutes").maybeSingle(),
      supabase.from("system_settings").select("value").eq("key", "sla_yellow_minutes").maybeSingle(),
    ]);
    setShifts((s as any) || []);
    if (sg?.value) setSlaGreen(String(sg.value).replace(/"/g, ""));
    if (sy?.value) setSlaYellow(String(sy.value).replace(/"/g, ""));
  }
  useEffect(() => { loadAll(); }, []);

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function addShift() {
    if (!name.trim()) return toast.error("Nama shift wajib");
    setBusy(true);
    const { error } = await supabase.from("shifts").insert({
      name, start_time: startTime + ":00", end_time: endTime + ":00",
      days_of_week: days, is_active: true,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Shift ditambahkan"); setName(""); loadAll(); }
  }

  async function toggleShift(id: string, active: boolean) {
    const { error } = await supabase.from("shifts").update({ is_active: active }).eq("id", id);
    if (error) toast.error(error.message); else loadAll();
  }

  async function removeShift(id: string, name: string) {
    if (!confirm(`Hapus shift "${name}"?`)) return;
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Shift dihapus"); loadAll(); }
  }

  async function saveSla() {
    const g = parseInt(slaGreen, 10);
    const y = parseInt(slaYellow, 10);
    if (!Number.isFinite(g) || !Number.isFinite(y) || g <= 0 || y <= g) {
      return toast.error("SLA tidak valid. Kuning harus > Hijau.");
    }
    setBusy(true);
    const { error } = await supabase.from("system_settings").upsert([
      { key: "sla_green_minutes", value: String(g) },
      { key: "sla_yellow_minutes", value: String(y) },
    ], { onConflict: "key" });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Ambang SLA disimpan");
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Ambang SLA Inbox</CardTitle>
          <CardDescription>
            Indikator warna untuk percakapan belum dibaca: <span className="text-emerald-600 font-medium">Hijau</span> kurang dari ambang,
            {" "}<span className="text-amber-600 font-medium">Kuning</span> di antara ambang, <span className="text-rose-600 font-medium">Merah</span> melewati ambang kuning.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Hijau &lt; (menit)</Label>
            <Input type="number" min={1} value={slaGreen} onChange={(e) => setSlaGreen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kuning &lt; (menit)</Label>
            <Input type="number" min={2} value={slaYellow} onChange={(e) => setSlaYellow(e.target.value)} />
          </div>
          <Button onClick={saveSla} disabled={busy}>
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Simpan SLA
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tambah Shift</CardTitle>
          <CardDescription>Atur jam kerja & hari aktif setiap shift.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Nama Shift</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: Pagi" />
            </div>
            <div className="space-y-1.5">
              <Label>Mulai</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Selesai</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Hari Aktif</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent"
                  }`}>{d}</button>
              ))}
            </div>
          </div>
          <Button onClick={addShift} disabled={busy}>Tambah Shift</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Shift ({shifts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y">
            {shifts.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {s.name}
                    {!s.is_active && <Badge variant="outline" className="text-[10px]">Nonaktif</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                    {" · "}
                    {(s.days_of_week || []).map((d) => DAY_LABELS[d]).join(", ") || "Setiap hari"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleShift(s.id, !s.is_active)}>
                  {s.is_active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeShift(s.id, s.name)}>Hapus</Button>
              </div>
            ))}
            {!shifts.length && <p className="p-3 text-sm text-muted-foreground">Belum ada shift.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkflowTab() {
  const [stages, setStages] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load() {
    const [{ data: st }, { data: cs }] = await Promise.all([
      supabase.from("stages").select("*").order("order_index"),
      supabase.from("contacts").select("stage_id"),
    ]);
    setStages(st || []);
    const c: Record<string, number> = {};
    (cs || []).forEach((r: any) => { if (r.stage_id) c[r.stage_id] = (c[r.stage_id] || 0) + 1; });
    setCounts(c);
  }
  useEffect(() => { load(); }, []);

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("stages").update(patch).eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  async function move(id: string, dir: -1 | 1) {
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return;
    const a = stages[i], b = stages[j];
    await Promise.all([
      supabase.from("stages").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("stages").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    load();
  }

  async function add() {
    if (!newName.trim()) return toast.error("Nama stage wajib diisi");
    const nextIdx = (stages[stages.length - 1]?.order_index || 0) + 1;
    const { error } = await supabase.from("stages").insert({
      name: newName.trim(), color: newColor, order_index: nextIdx, is_default: false, is_terminal: false,
    });
    if (error) toast.error(error.message);
    else { setNewName(""); toast.success("Stage ditambahkan"); load(); }
  }

  async function remove(s: any) {
    if (counts[s.id]) return toast.error(`Tidak bisa dihapus: ${counts[s.id]} lead masih di stage ini.`);
    if (s.is_default) return toast.error("Stage default tidak dapat dihapus.");
    if (!confirm(`Hapus stage "${s.name}"?`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) toast.error(error.message); else { toast.success("Stage dihapus"); load(); }
  }

  async function setDefault(id: string) {
    await supabase.from("stages").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("stages").update({ is_default: true }).eq("id", id);
    toast.success("Default stage diperbarui");
    load();
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Workflow Builder</CardTitle>
          <CardDescription>
            Atur stage pipeline: ubah nama, warna, urutan, tandai sebagai default (stage awal saat lead masuk) atau terminal (akhir).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border bg-muted/30">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label className="text-xs">Nama stage baru</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="cth: Negosiasi" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Warna</Label>
              <Input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-16 h-10 p-1" />
            </div>
            <Button onClick={add}>Tambah Stage</Button>
          </div>

          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card">
                <span className="size-8 grid place-items-center rounded-lg bg-muted text-xs font-mono">{i + 1}</span>
                <Input type="color" value={s.color} onChange={(e) => update(s.id, { color: e.target.value })} className="w-12 h-9 p-1" />
                <Input value={s.name} onChange={(e) => setStages(stages.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))}
                  onBlur={() => update(s.id, { name: s.name })} className="flex-1 min-w-[160px]" />
                <Badge variant="outline" className="text-xs">{counts[s.id] || 0} lead</Badge>
                {s.is_default && <Badge className="bg-blue-500/15 text-blue-500 text-xs">Default</Badge>}
                {s.is_terminal && <Badge className="bg-emerald-500/15 text-emerald-500 text-xs">Terminal</Badge>}
                <div className="flex gap-1 ml-auto">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(s.id, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" disabled={i === stages.length - 1} onClick={() => move(s.id, 1)}>↓</Button>
                  {!s.is_default && (
                    <Button size="sm" variant="outline" onClick={() => setDefault(s.id)}>Set Default</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => update(s.id, { is_terminal: !s.is_terminal })}>
                    {s.is_terminal ? "Unset Terminal" : "Set Terminal"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s)}>Hapus</Button>
                </div>
              </div>
            ))}
            {!stages.length && <p className="text-sm text-muted-foreground">Belum ada stage.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

