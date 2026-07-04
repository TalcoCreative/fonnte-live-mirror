import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { MessageSquare, Inbox as InboxIcon } from "lucide-react";

export const Route = createFileRoute("/_app/invitations")({
  head: () => ({ meta: [{ title: "Invitation — Husada CRM" }] }),
  component: InvitationsListPage,
});

function InvitationsListPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  async function load() {
    if (!user) return;
    const col = tab === "incoming" ? "to_user_id" : "from_user_id";
    const { data } = await supabase.from("assignment_invitations")
      .select("id, status, created_at, responded_at, note, reject_reason, contact_id, conversation_id, from_user_id, to_user_id")
      .eq(col, user.id).order("created_at", { ascending: false }).limit(200);
    const invs = (data as any[]) || [];
    setRows(invs);
    // Enrich with contact + profile names
    const contactIds = Array.from(new Set(invs.map((i) => i.contact_id)));
    const userIds = Array.from(new Set(invs.flatMap((i) => [i.from_user_id, i.to_user_id])));
    const [{ data: ct }, { data: pf }] = await Promise.all([
      contactIds.length ? supabase.from("contacts").select("id, full_name, whatsapp_number").in("id", contactIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const map: Record<string, any> = {};
    ((ct as any[]) || []).forEach((c) => { map["c:" + c.id] = c; });
    ((pf as any[]) || []).forEach((p) => { map["u:" + p.id] = p; });
    setProfiles(map);
  }
  useEffect(() => { load(); }, [user?.id, tab]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("invitations-list-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_invitations" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, tab]);

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="size-6 text-primary" /> Undangan Penugasan
        </h1>
        <p className="text-sm text-muted-foreground">Undangan chat dari First Response yang harus Anda terima/tolak.</p>
      </header>
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-card border">
        {(["incoming", "outgoing"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/70 hover:bg-accent"}`}>
            {t === "incoming" ? "Masuk (untuk Anda)" : "Dikirim (dari Anda)"}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          <InboxIcon className="size-8 mx-auto mb-2 opacity-40" />
          Belum ada undangan.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const ct = profiles["c:" + r.contact_id];
            const from = profiles["u:" + r.from_user_id];
            const to = profiles["u:" + r.to_user_id];
            const badge =
              r.status === "pending" ? "bg-amber-500/15 text-amber-600" :
              r.status === "accepted" ? "bg-emerald-500/15 text-emerald-600" :
              r.status === "rejected" ? "bg-rose-500/15 text-rose-600" :
              "bg-muted text-muted-foreground";
            return (
              <Link key={r.id} to="/invitation/$id" params={{ id: r.id }} className="block">
                <Card className="hover:bg-accent/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{ct?.full_name || ct?.whatsapp_number || "Kontak"}</span>
                        <Badge className={badge}>{r.status}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {tab === "incoming"
                          ? <>Dari <b>{from?.full_name || from?.email?.split("@")[0]}</b></>
                          : <>Untuk <b>{to?.full_name || to?.email?.split("@")[0]}</b></>}
                        {" · "}{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: idLocale })}
                      </div>
                      {r.note && <div className="text-xs text-foreground/80 mt-1 line-clamp-1 italic">"{r.note}"</div>}
                      {r.reject_reason && <div className="text-xs text-rose-600 mt-1 line-clamp-1">Ditolak: {r.reject_reason}</div>}
                    </div>
                    <Button size="sm" variant="outline">Buka</Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
