import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Clock, TrendingUp, Inbox as InboxIcon, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Husada CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);

  const { startISO, endISO } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (range === "today") {}
    else if (range === "7d") start.setDate(start.getDate() - 6);
    else if (range === "30d") start.setDate(start.getDate() - 29);
    else if (range === "month") start.setDate(1);
    else if (range === "year") { start.setMonth(0); start.setDate(1); }
    else if (range === "custom" && from && to) {
      return { startISO: new Date(from + "T00:00:00").toISOString(), endISO: new Date(to + "T23:59:59").toISOString() };
    }
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [range, from, to]);

  useEffect(() => {
    (async () => {
      const [contacts, openConv, msgsRange, profiles, respMsgs, stages] = await Promise.all([
        supabase.from("contacts").select("id, estimated_revenue, stage_id, stages(name, color)"),
        supabase.from("conversations").select("id, assigned_agent_id, last_message_at", { count: "exact" }).eq("status", "OPEN"),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .gte("sent_at", startISO).lte("sent_at", endISO),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("messages").select("sent_by_id, response_seconds")
          .gte("sent_at", startISO).lte("sent_at", endISO)
          .eq("direction", "OUTBOUND").not("response_seconds", "is", null),
        supabase.from("stages").select("id, name, color").order("order_index"),
      ]);

      const byStage: Record<string, { name: string; color: string; count: number }> = {};
      let totalRevenue = 0;
      (contacts.data || []).forEach((r: any) => {
        const name = r.stages?.name || "Tanpa stage";
        const color = r.stages?.color || "#888";
        byStage[name] = byStage[name] || { name, color, count: 0 };
        byStage[name].count++;
        totalRevenue += Number(r.estimated_revenue) || 0;
      });
      const stageDist = Object.values(byStage).sort((a, b) => b.count - a.count);
      const topStage = stageDist[0];

      const allResp = (respMsgs.data || []) as any[];
      const teamAvg = allResp.length ? Math.round(allResp.reduce((s, m) => s + (m.response_seconds || 0), 0) / allResp.length) : 0;

      const perAgent: Record<string, { count: number; total: number }> = {};
      allResp.forEach((m: any) => {
        if (!m.sent_by_id) return;
        perAgent[m.sent_by_id] = perAgent[m.sent_by_id] || { count: 0, total: 0 };
        perAgent[m.sent_by_id].count++;
        perAgent[m.sent_by_id].total += m.response_seconds || 0;
      });
      const profMap: Record<string, any> = {};
      (profiles.data || []).forEach((p: any) => { profMap[p.id] = p; });
      const agentStats = Object.entries(perAgent).map(([id, v]) => ({
        id,
        name: profMap[id]?.full_name || profMap[id]?.email?.split("@")[0] || "Agent",
        avg: Math.round(v.total / v.count),
        count: v.count,
      })).sort((a, b) => a.avg - b.avg);

      const myInbox = (openConv.data || []).filter((c: any) => c.assigned_agent_id === user?.id).length;
      const myLeads = (contacts.data || []).filter((c: any) => false).length; // computed below
      // For my leads: need a per-contact assignment lookup
      const { data: myConvs } = await supabase.from("conversations").select("contact_id").eq("assigned_agent_id", user?.id || "00000000-0000-0000-0000-000000000000");
      const myLeadIds = new Set((myConvs || []).map((c: any) => c.contact_id));
      const myLeadCount = (contacts.data || []).filter((c: any) => myLeadIds.has(c.id)).length;

      setData({
        totalContacts: (contacts.data || []).length,
        openConv: openConv.count || 0,
        messagesRange: msgsRange.count || 0,
        teamAvg, agentStats, stageDist, topStage, totalRevenue,
        myInbox, myLeads: myLeadCount,
      });
    })();
  }, [startISO, endISO, user?.id]);

  function fmtSec(s: number) {
    if (!s) return "—";
    if (s < 60) return `${s}d`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}j`;
  }

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Performa tim & lead pipeline.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Rentang</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari ini</SelectItem>
                <SelectItem value="7d">7 hari terakhir</SelectItem>
                <SelectItem value="30d">30 hari terakhir</SelectItem>
                <SelectItem value="month">Bulan ini</SelectItem>
                <SelectItem value="year">Tahun ini</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <>
              <div><Label className="text-xs">Dari</Label><Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">Sampai</Label><Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={InboxIcon} label="My Inbox" value={data?.myInbox ?? "—"} />
        <StatCard icon={Users} label="My Leads" value={data?.myLeads ?? "—"} />
        <StatCard icon={MessageSquare} label="Percakapan Aktif" value={data?.openConv ?? "—"} />
        <StatCard icon={Clock} label="Avg Respon Tim" value={fmtSec(data?.teamAvg || 0)} />
        <StatCard icon={Users} label="Total Leads" value={data?.totalContacts ?? "—"} />
        <StatCard icon={MessageSquare} label="Pesan (Rentang)" value={data?.messagesRange ?? "—"} />
        <StatCard icon={TrendingUp} label="Stage Teratas" value={data?.topStage?.name ?? "—"} />
        <StatCard icon={Wallet} label="Est. Revenue" value={`Rp ${(data?.totalRevenue || 0).toLocaleString("id-ID")}`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Distribusi Stage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.stageDist || []).map((s: any) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="size-3 rounded-full" style={{ background: s.color }} />
                <div className="flex-1 text-sm">{s.name}</div>
                <div className="text-sm font-semibold">{s.count}</div>
              </div>
            ))}
            {!data?.stageDist?.length && <p className="text-sm text-muted-foreground">Belum ada lead.</p>}
          </CardContent>
        </Card>

        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Respon Time per Agent</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.agentStats || []).map((a: any) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="flex-1 text-sm">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.count} balasan</div>
                <div className="text-sm font-semibold tabular-nums">{fmtSec(a.avg)}</div>
              </div>
            ))}
            {!data?.agentStats?.length && <p className="text-sm text-muted-foreground">Belum ada data respon.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card className="glow-soft">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center glow-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-lg font-bold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
