import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trophy, MessageSquare, ArrowRightLeft, CheckCircle2, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/performance")({
  head: () => ({ meta: [{ title: "Performance — Husada CRM" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  const { startISO, endISO } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (range === "today") {}
    else if (range === "7d") start.setDate(start.getDate() - 6);
    else if (range === "30d") start.setDate(start.getDate() - 29);
    else if (range === "month") start.setDate(1);
    else if (range === "custom" && from && to) {
      return { startISO: new Date(from + "T00:00:00").toISOString(), endISO: new Date(to + "T23:59:59").toISOString() };
    }
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [range, from, to]);

  useEffect(() => {
    (async () => {
      const [{ data: events }, { data: profiles }, { data: stages }] = await Promise.all([
        supabase.from("audit_events")
          .select("event_type, actor_id, contact_id, new_value, occurred_at")
          .gte("occurred_at", startISO).lte("occurred_at", endISO)
          .limit(10000),
        supabase.from("profiles").select("id, full_name, email, position"),
        supabase.from("stages").select("id, name, order_index").order("order_index"),
      ]);

      const evs = (events || []) as any[];
      const stageById: Record<string, string> = {};
      (stages || []).forEach((s: any) => { stageById[s.id] = s.name; });

      const wonStageNames = new Set(["Closed Won", "Treatment"]);
      const wonStageIds = new Set((stages || []).filter((s: any) => wonStageNames.has(s.name)).map((s: any) => s.id));

      // first inbound time per contact
      const firstIn: Record<string, number> = {};
      const responses: Record<string, { total: number; count: number }> = {};
      evs.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      for (const e of evs) {
        if (e.event_type === "chat_in" && !firstIn[e.contact_id]) {
          firstIn[e.contact_id] = new Date(e.occurred_at).getTime();
        } else if (e.event_type === "chat_out" && firstIn[e.contact_id] && e.actor_id) {
          const sec = Math.max(0, Math.round((new Date(e.occurred_at).getTime() - firstIn[e.contact_id]) / 1000));
          responses[e.actor_id] = responses[e.actor_id] || { total: 0, count: 0 };
          responses[e.actor_id].total += sec;
          responses[e.actor_id].count++;
          delete firstIn[e.contact_id];
        }
      }

      const perAgent: Record<string, any> = {};
      const ensure = (id: string) => {
        if (!perAgent[id]) {
          const p = (profiles || []).find((x: any) => x.id === id);
          perAgent[id] = {
            id, name: p?.full_name || p?.email || "Tidak dikenal", position: p?.position || "",
            outbound: 0, assigned: 0, stageChanges: 0, won: 0, avgResp: 0,
          };
        }
        return perAgent[id];
      };

      evs.forEach((e) => {
        if (!e.actor_id) return;
        const a = ensure(e.actor_id);
        if (e.event_type === "chat_out") a.outbound++;
        else if (e.event_type === "assigned" || e.event_type === "reassigned" || e.event_type === "conv_assigned" || e.event_type === "conv_takeover") a.assigned++;
        else if (e.event_type === "stage_changed") {
          a.stageChanges++;
          const newId = e.new_value?.stage_id;
          if (newId && wonStageIds.has(newId)) a.won++;
        }
      });

      Object.entries(responses).forEach(([id, r]) => {
        const a = ensure(id);
        a.avgResp = Math.round(r.total / r.count);
        a.respCount = r.count;
      });

      const list = Object.values(perAgent).sort((a: any, b: any) => b.outbound - a.outbound);
      setRows(list);
    })();
  }, [startISO, endISO]);

  const fmtTime = (s: number) => !s ? "-" : s < 60 ? `${s}d` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m`;

  const chartData = rows.slice(0, 10).map((r) => ({ name: r.name.split(" ")[0], Reply: r.outbound, Assign: r.assigned, Stage: r.stageChanges, Won: r.won }));

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="size-6 text-primary" /> Performance Agent
          </h1>
          <p className="text-sm text-muted-foreground">Metrik berbasis audit log: balasan, assign, perpindahan stage, dan deal won.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Rentang</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari ini</SelectItem>
                <SelectItem value="7d">7 hari</SelectItem>
                <SelectItem value="30d">30 hari</SelectItem>
                <SelectItem value="month">Bulan ini</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <>
              <div><Label className="text-xs">Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
        </div>
      </div>

      <Card className="glow-soft">
        <CardHeader><CardTitle className="text-base">Top 10 Agent — Aktivitas</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">Belum ada data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Reply" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Assign" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Stage" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Won" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="glow-soft">
        <CardHeader><CardTitle className="text-base">Detail per Agent</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Agent</th>
                <th className="text-left py-2 px-2">Jabatan</th>
                <th className="text-right py-2 px-2"><MessageSquare className="size-3 inline" /> Reply</th>
                <th className="text-right py-2 px-2"><ArrowRightLeft className="size-3 inline" /> Assign</th>
                <th className="text-right py-2 px-2">Stage Δ</th>
                <th className="text-right py-2 px-2"><CheckCircle2 className="size-3 inline" /> Won</th>
                <th className="text-right py-2 px-2"><Clock className="size-3 inline" /> Avg Respon</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Belum ada aktivitas pada rentang ini.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="py-2 px-2 font-medium">{r.name}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{r.position || "-"}</td>
                  <td className="py-2 px-2 text-right">{r.outbound}</td>
                  <td className="py-2 px-2 text-right">{r.assigned}</td>
                  <td className="py-2 px-2 text-right">{r.stageChanges}</td>
                  <td className="py-2 px-2 text-right">
                    {r.won > 0 ? <Badge className="bg-emerald-500/15 text-emerald-500">{r.won}</Badge> : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">{fmtTime(r.avgResp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
