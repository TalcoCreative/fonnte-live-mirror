import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, Timer, MessageCircle, UserCheck, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend, Cell,
} from "recharts";

export const Route = createFileRoute("/_app/first-response")({
  head: () => ({ meta: [{ title: "First Response Dashboard — Husada CRM" }] }),
  component: FirstResponseDashboard,
});

type Bucket = { label: string; count: number };

function FirstResponseDashboard() {
  const [range, setRange] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [slaGreen, setSlaGreen] = useState(5);
  const [slaYellow, setSlaYellow] = useState(10);

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
      const { data: settings } = await supabase.from("system_settings").select("key,value").in("key", ["sla_green_minutes", "sla_yellow_minutes"]);
      (settings || []).forEach((s: any) => {
        if (s.key === "sla_green_minutes") setSlaGreen(Number(s.value) || 5);
        if (s.key === "sla_yellow_minutes") setSlaYellow(Number(s.value) || 10);
      });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      // Pull audit events in range: chat_in, chat_out, contact_created, assigned
      const { data: events } = await supabase
        .from("audit_events")
        .select("event_type, actor_id, contact_id, conversation_id, occurred_at, new_value")
        .gte("occurred_at", startISO).lte("occurred_at", endISO)
        .order("occurred_at", { ascending: true })
        .limit(5000);

      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
      const nameById: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameById[p.id] = p.full_name || p.email; });

      const evs = (events || []) as any[];
      const newLeads = evs.filter((e) => e.event_type === "contact_created").length;
      const firstAssigned = evs.filter((e) => e.event_type === "assigned").length;

      // Compute first response time per contact: first chat_in to first chat_out by an agent after it
      const inboundFirst: Record<string, number> = {};
      const responses: { contact_id: string; actor_id: string | null; seconds: number }[] = [];
      for (const e of evs) {
        if (e.event_type === "chat_in" && !inboundFirst[e.contact_id]) {
          inboundFirst[e.contact_id] = new Date(e.occurred_at).getTime();
        } else if (e.event_type === "chat_out" && inboundFirst[e.contact_id] && e.actor_id) {
          const seconds = Math.max(0, Math.round((new Date(e.occurred_at).getTime() - inboundFirst[e.contact_id]) / 1000));
          responses.push({ contact_id: e.contact_id, actor_id: e.actor_id, seconds });
          delete inboundFirst[e.contact_id];
        }
      }

      const totalResp = responses.length;
      const avgSec = totalResp ? Math.round(responses.reduce((s, r) => s + r.seconds, 0) / totalResp) : 0;
      const unresponded = Object.keys(inboundFirst).length;

      // SLA breakdown
      const greenS = slaGreen * 60;
      const yellowS = slaYellow * 60;
      const slaCount = { green: 0, yellow: 0, red: 0 };
      responses.forEach((r) => {
        if (r.seconds <= greenS) slaCount.green++;
        else if (r.seconds <= yellowS) slaCount.yellow++;
        else slaCount.red++;
      });

      // Per FR agent leaderboard
      const perAgent: Record<string, { name: string; count: number; total: number; green: number }> = {};
      responses.forEach((r) => {
        const name = (r.actor_id && nameById[r.actor_id]) || "Tidak Diketahui";
        perAgent[name] = perAgent[name] || { name, count: 0, total: 0, green: 0 };
        perAgent[name].count++;
        perAgent[name].total += r.seconds;
        if (r.seconds <= greenS) perAgent[name].green++;
      });
      const leaderboard = Object.values(perAgent)
        .map((a) => ({ name: a.name, avg: Math.round(a.total / a.count), count: a.count, slaPct: Math.round((a.green / a.count) * 100) }))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 10);

      // Hourly load (chat_in distribution by hour)
      const hourly: Record<number, number> = {};
      for (let h = 0; h < 24; h++) hourly[h] = 0;
      evs.filter((e) => e.event_type === "chat_in").forEach((e) => {
        const h = new Date(e.occurred_at).getHours();
        hourly[h]++;
      });
      const hourlyData = Object.entries(hourly).map(([h, c]) => ({ hour: `${h.padStart ? h.padStart(2, "0") : String(h).padStart(2, "0")}:00`, count: c }));

      // Daily trend (new leads vs first responses)
      const days: Record<string, { date: string; leads: number; responded: number }> = {};
      const dStart = new Date(startISO); const dEnd = new Date(endISO);
      for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        days[key] = { date: key.slice(5), leads: 0, responded: 0 };
      }
      evs.forEach((e) => {
        const key = e.occurred_at.slice(0, 10);
        if (!days[key]) return;
        if (e.event_type === "contact_created") days[key].leads++;
      });
      responses.forEach((r) => {
        const e = evs.find((x) => x.event_type === "chat_out" && x.contact_id === r.contact_id);
        if (!e) return;
        const key = e.occurred_at.slice(0, 10);
        if (days[key]) days[key].responded++;
      });
      const trend = Object.values(days);

      setData({
        newLeads, firstAssigned, totalResp, avgSec, unresponded,
        slaCount, leaderboard, hourlyData, trend,
        slaPct: totalResp ? Math.round((slaCount.green / totalResp) * 100) : 0,
      });
    })();
  }, [startISO, endISO, slaGreen, slaYellow]);

  if (!data) return <div className="container mx-auto p-6 text-muted-foreground">Memuat...</div>;

  const fmtTime = (s: number) => s < 60 ? `${s}d` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}d` : `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m`;

  const slaPie = [
    { name: `Green (<${slaGreen}m)`, value: data.slaCount.green, fill: "#10b981" },
    { name: `Yellow (${slaGreen}-${slaYellow}m)`, value: data.slaCount.yellow, fill: "#f59e0b" },
    { name: `Red (>${slaYellow}m)`, value: data.slaCount.red, fill: "#ef4444" },
  ];

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="size-6 text-primary" /> First Response Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Pantau kecepatan respon pertama berdasarkan log audit real-time.</p>
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={MessageCircle} label="Leads Baru" value={data.newLeads} color="text-blue-500" />
        <KPI icon={UserCheck} label="Sudah Dijawab" value={data.totalResp} color="text-emerald-500" />
        <KPI icon={Timer} label="Avg Respon" value={fmtTime(data.avgSec)} color="text-primary" />
        <KPI icon={Zap} label={`SLA <${slaGreen}m`} value={`${data.slaPct}%`} color="text-emerald-500" />
        <KPI icon={AlertTriangle} label="Belum Dijawab" value={data.unresponded} color="text-rose-500" />
      </div>

      {/* SLA + Hourly */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">SLA Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {slaPie.map((s) => (
                <div key={s.name} className="rounded-xl border p-3 text-center">
                  <div className="text-2xl font-bold" style={{ color: s.fill }}>{s.value}</div>
                  <div className="text-[11px] text-muted-foreground">{s.name}</div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={slaPie}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {slaPie.map((s, i) => <Cell key={i} fill={s.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Beban Per Jam (Inbound)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.hourlyData}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#hourGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      <Card className="glow-soft">
        <CardHeader><CardTitle className="text-base">Tren Harian: Leads Baru vs Direspon</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="leads" name="Leads Baru" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
              <Area type="monotone" dataKey="responded" name="Direspon" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className="glow-soft">
        <CardHeader><CardTitle className="text-base">Leaderboard FR Agent</CardTitle></CardHeader>
        <CardContent>
          {data.leaderboard.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">Belum ada data respon.</div>
          ) : (
            <div className="space-y-2">
              {data.leaderboard.map((a: any, i: number) => (
                <div key={a.name} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="size-8 grid place-items-center rounded-lg bg-primary/10 text-primary font-semibold">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.count} respon</div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">{fmtTime(a.avg)}</Badge>
                  <Badge className={a.slaPct >= 80 ? "bg-emerald-500/15 text-emerald-500" : a.slaPct >= 50 ? "bg-amber-500/15 text-amber-500" : "bg-rose-500/15 text-rose-500"}>
                    {a.slaPct}% SLA
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="glow-soft">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`size-4 ${color}`} />
        </div>
        <div className="text-xl md:text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
