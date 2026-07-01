import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Megaphone, Trophy, Copy, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

export const Route = createFileRoute("/_app/ads-content")({
  head: () => ({ meta: [{ title: "Ads Content — Husada CRM" }] }),
  component: AdsContentPage,
});

type ContentCode = {
  id: string; code: string; name: string;
  content_link: string | null; notes: string | null;
  is_active: boolean; created_at: string;
};
type LeadRow = {
  id: string; full_name: string | null; whatsapp_number: string;
  content_code_id: string | null; source: string | null; created_at: string;
};

function AdsContentPage() {
  const [codes, setCodes] = useState<ContentCode[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<ContentCode | null>(null);
  const [form, setForm] = useState({ code: "", name: "", content_link: "", notes: "", is_active: true });

  async function load() {
    const [c, l] = await Promise.all([
      supabase.from("content_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, full_name, whatsapp_number, content_code_id, source, created_at").order("created_at", { ascending: false }).limit(2000),
    ]);
    setCodes((c.data as any) || []);
    setLeads((l.data as any) || []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("ads-content-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "content_codes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const byCode: Record<string, number> = {};
    let organik = 0, ads = 0, unassigned = 0;
    leads.forEach((l) => {
      if (l.content_code_id) { byCode[l.content_code_id] = (byCode[l.content_code_id] || 0) + 1; ads++; }
      else if ((l.source || "").toLowerCase() === "organik") organik++;
      else unassigned++;
    });
    return { byCode, organik, ads, unassigned, total: leads.length };
  }, [leads]);

  const ranked = useMemo(() => {
    return [...codes]
      .map((c) => ({ ...c, hits: stats.byCode[c.id] || 0 }))
      .sort((a, b) => b.hits - a.hits);
  }, [codes, stats]);

  function openEdit(c: ContentCode) {
    setEditing(c);
    setForm({ code: c.code, name: c.name, content_link: c.content_link || "", notes: c.notes || "", is_active: c.is_active });
    setOpenNew(true);
  }
  function openCreate() {
    setEditing(null);
    setForm({ code: "", name: "", content_link: "", notes: "", is_active: true });
    setOpenNew(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      content_link: form.content_link.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    if (!payload.code || !payload.name) return toast.error("Kode & nama wajib diisi");
    const { error } = editing
      ? await supabase.from("content_codes").update(payload).eq("id", editing.id)
      : await supabase.from("content_codes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Kode diperbarui" : "Kode ditambahkan");
    setOpenNew(false);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("content_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Kode dihapus");
    load();
  }

  const chartData = ranked.slice(0, 10).map((c) => ({ name: c.code, hits: c.hits }));
  const COLORS = ["#0ea5e9","#06b6d4","#14b8a6","#10b981","#84cc16","#f59e0b","#f97316","#ef4444","#a855f7","#8b5cf6"];

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="size-6 text-primary" /> Ads Content Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Deteksi konten yang menghasilkan leads paling banyak berdasarkan kode pembuka chat WhatsApp.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4 mr-1.5" /> Kode Baru</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Leads" value={stats.total} tone="primary" icon={<Sparkles className="size-4" />} />
        <Kpi label="Dari Ads (kode terdeteksi)" value={stats.ads} tone="emerald" />
        <Kpi label="Organik" value={stats.organik} tone="blue" />
        <Kpi label="Belum Terklasifikasi" value={stats.unassigned} tone="amber" />
      </div>

      <Card className="glow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> Winning Content (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">Belum ada leads yang terdeteksi dari kode. Tambahkan kode di bawah.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" style={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} style={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="hits" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="glow-soft overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daftar Kode Konten</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Kode</th>
                  <th className="text-left p-3 font-medium">Nama</th>
                  <th className="text-left p-3 font-medium">Link Konten</th>
                  <th className="text-right p-3 font-medium">Leads</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-accent/40">
                    <td className="p-3">
                      <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success(`Kode "${c.code}" disalin`); }}
                        className="font-mono font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        {c.code} <Copy className="size-3 opacity-60" />
                      </button>
                    </td>
                    <td className="p-3">
                      <button className="hover:text-primary text-left" onClick={() => openEdit(c)}>{c.name}</button>
                      {c.notes && <div className="text-xs text-muted-foreground line-clamp-1">{c.notes}</div>}
                    </td>
                    <td className="p-3">
                      {c.content_link ? (
                        <a href={c.content_link} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                          <ExternalLink className="size-3" /> Buka
                        </a>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right font-bold text-lg">{c.hits}</td>
                    <td className="p-3 text-center">
                      {c.is_active
                        ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Aktif</Badge>
                        : <Badge variant="outline">Nonaktif</Badge>}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="size-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus kode "{c.code}"?</AlertDialogTitle>
                              <AlertDialogDescription>Leads yang terhubung akan kehilangan referensi konten (source tetap "ads").</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(c.id)}>Hapus</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
                {ranked.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Belum ada kode. Tambahkan kode pertama untuk mulai tracking.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kode Konten" : "Kode Konten Baru"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kode <span className="text-muted-foreground text-xs">(mis. IG001, TIKTOK-A, FB-MCU)</span></Label>
              <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="IG001" className="font-mono uppercase" />
              <p className="text-[11px] text-muted-foreground">
                Sistem akan menganggap leads sebagai "ads" jika pesan pertama mereka mengandung kode ini (case-insensitive).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Nama Konten</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Instagram Reels — Medical Check Up Juni" />
            </div>
            <div className="space-y-1.5">
              <Label>Link Konten (opsional)</Label>
              <Input value={form.content_link} onChange={(e) => setForm({ ...form, content_link: e.target.value })}
                placeholder="https://instagram.com/reel/..." />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Copywriter: Aura. Anggaran: Rp 2jt." />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Aktif</div>
                <div className="text-xs text-muted-foreground">Nonaktifkan untuk berhenti mendeteksi kode ini pada leads baru.</div>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
              <Button type="submit">{editing ? "Simpan" : "Tambah"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number; tone: "primary" | "emerald" | "blue" | "amber"; icon?: React.ReactNode }) {
  const tones: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 text-primary",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400",
  };
  return (
    <Card className={`glow-soft bg-gradient-to-br ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">{icon} {label}</div>
        <div className="text-3xl font-bold mt-1">{value.toLocaleString("id-ID")}</div>
      </CardContent>
    </Card>
  );
}
