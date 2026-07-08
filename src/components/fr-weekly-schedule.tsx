import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAME_PREFIX = "__fr_weekly:"; // shift.name convention: __fr_weekly:{agentId}:{day}

type Agent = { id: string; full_name: string | null; email: string | null };
type Cell = { shiftId?: string; agentShiftId?: string; start: string; end: string; enabled: boolean };

/** Grid mingguan (Sen–Min × jam) per FR agent. Data disimpan sebagai shift bernama
 * `__fr_weekly:{agentId}:{day}` + baris agent_shifts, jadi kompatibel dgn perhitungan dashboard. */
export function FRWeeklySchedule() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "first_response");
    const ids = (roles || []).map((r: any) => r.user_id);
    if (!ids.length) { setAgents([]); setCells({}); setLoading(false); return; }
    const [{ data: pf }, { data: sh }, { data: asg }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", ids),
      supabase.from("shifts").select("*").like("name", `${NAME_PREFIX}%`),
      supabase.from("agent_shifts").select("*"),
    ]);
    setAgents(((pf as any[]) || []).sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")));

    const shiftByKey: Record<string, any> = {};
    (sh || []).forEach((s: any) => { shiftByKey[s.name] = s; });
    const asgByShift: Record<string, any> = {};
    (asg || []).forEach((a: any) => { asgByShift[a.shift_id] = a; });

    const next: Record<string, Cell> = {};
    ids.forEach((aid: string) => {
      for (let d = 0; d < 7; d++) {
        const key = `${aid}:${d}`;
        const shift = shiftByKey[`${NAME_PREFIX}${aid}:${d}`];
        if (shift) {
          const link = asgByShift[shift.id];
          next[key] = {
            shiftId: shift.id,
            agentShiftId: link?.id,
            start: (shift.start_time || "08:00").slice(0, 5),
            end: (shift.end_time || "17:00").slice(0, 5),
            enabled: !!link,
          };
        } else {
          next[key] = { start: "08:00", end: "17:00", enabled: false };
        }
      }
    });
    setCells(next);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function updateCell(agentId: string, day: number, patch: Partial<Cell>) {
    const key = `${agentId}:${day}`;
    setCells((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  async function saveCell(agentId: string, day: number) {
    const key = `${agentId}:${day}`;
    const cell = cells[key];
    if (!cell) return;
    setSaving(key);
    try {
      const shiftName = `${NAME_PREFIX}${agentId}:${day}`;
      let shiftId = cell.shiftId;
      if (!shiftId) {
        const { data, error } = await supabase.from("shifts").insert({
          name: shiftName,
          start_time: cell.start, end_time: cell.end,
          color: "#0ea5e9", days_of_week: [day], is_active: true,
        } as any).select("id").maybeSingle();
        if (error) throw error;
        shiftId = data?.id;
      } else {
        const { error } = await supabase.from("shifts").update({
          start_time: cell.start, end_time: cell.end, days_of_week: [day], is_active: true,
        } as any).eq("id", shiftId);
        if (error) throw error;
      }

      let linkId = cell.agentShiftId;
      if (cell.enabled && !linkId) {
        const { data, error } = await supabase.from("agent_shifts")
          .insert({ agent_id: agentId, shift_id: shiftId } as any).select("id").maybeSingle();
        if (error) throw error;
        linkId = data?.id;
      } else if (!cell.enabled && linkId) {
        await supabase.from("agent_shifts").delete().eq("id", linkId);
        linkId = undefined;
      }
      updateCell(agentId, day, { shiftId, agentShiftId: linkId });
      toast.success("Tersimpan");
    } catch (e: any) {
      toast.error(e.message || "Gagal simpan");
    } finally {
      setSaving(null);
    }
  }

  async function clearCell(agentId: string, day: number) {
    const key = `${agentId}:${day}`;
    const cell = cells[key];
    if (!cell?.shiftId) { updateCell(agentId, day, { enabled: false, start: "08:00", end: "17:00" }); return; }
    setSaving(key);
    try {
      if (cell.agentShiftId) await supabase.from("agent_shifts").delete().eq("id", cell.agentShiftId);
      await supabase.from("shifts").delete().eq("id", cell.shiftId);
      setCells((c) => ({ ...c, [key]: { start: "08:00", end: "17:00", enabled: false } }));
      toast.success("Dikosongkan");
    } catch (e: any) {
      toast.error(e.message || "Gagal");
    } finally { setSaving(null); }
  }

  async function copyMondayToWeekdays(agentId: string) {
    const src = cells[`${agentId}:1`];
    if (!src) return;
    for (let d = 2; d <= 5; d++) {
      updateCell(agentId, d, { start: src.start, end: src.end, enabled: src.enabled });
    }
    toast.info("Klik Simpan di tiap sel untuk menyimpan.");
  }

  if (loading) return <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Jadwal Mingguan FR</CardTitle>
          <CardDescription>
            Atur jam kerja setiap First Response per hari. Metrik dashboard FR (avg first response, SLA, beban per jam) dihitung
            <b> hanya di dalam jam ini</b>. Kosongkan hari = FR tidak dijadwalkan hari itu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada agent dengan role First Response.</p>
          ) : (
            <div className="space-y-6">
              {agents.map((a) => (
                <div key={a.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <div className="font-semibold">{a.full_name || a.email}</div>
                      <div className="text-[11px] text-muted-foreground">{a.email}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copyMondayToWeekdays(a.id)}>
                      Sen → Sen–Jum
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                    {DAY_LABELS.map((label, day) => {
                      const key = `${a.id}:${day}`;
                      const cell = cells[key];
                      const busy = saving === key;
                      return (
                        <div key={day} className={`rounded-lg border p-2 ${cell?.enabled ? "border-primary/60 bg-primary/5" : "bg-muted/20"}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                              <input type="checkbox" checked={!!cell?.enabled}
                                onChange={(e) => updateCell(a.id, day, { enabled: e.target.checked })}
                                className="size-3.5 cursor-pointer" />
                              {label}
                            </label>
                            {cell?.shiftId && (
                              <button onClick={() => clearCell(a.id, day)} className="text-destructive/70 hover:text-destructive" title="Hapus">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Input type="time" value={cell?.start || "08:00"}
                              onChange={(e) => updateCell(a.id, day, { start: e.target.value })}
                              disabled={!cell?.enabled}
                              className="h-7 text-xs px-1.5" />
                            <Input type="time" value={cell?.end || "17:00"}
                              onChange={(e) => updateCell(a.id, day, { end: e.target.value })}
                              disabled={!cell?.enabled}
                              className="h-7 text-xs px-1.5" />
                            <Button size="sm" className="w-full h-7 text-[11px]" disabled={busy}
                              onClick={() => saveCell(a.id, day)}>
                              {busy ? <Loader2 className="size-3 animate-spin" /> : "Simpan"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
