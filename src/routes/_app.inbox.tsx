import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Send, Search, Loader2, User as UserIcon, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Husada CRM" }] }),
  component: InboxPage,
});

type Profile = { id: string; full_name: string | null; email: string };
type Stage = { id: string; name: string; color: string | null };
type Contact = {
  id: string;
  full_name: string | null;
  whatsapp_number: string;
  stage_id: string | null;
};
type Conversation = {
  id: string;
  contact_id: string;
  status: string;
  assigned_agent_id: string | null;
  last_replied_by_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact?: Contact;
};
type Message = {
  id: string;
  conversation_id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  sent_at: string;
  sent_by_id: string | null;
  status: string;
};

function InboxPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [stages, setStages] = useState<Stage[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("*, contact:contacts(id, full_name, whatsapp_number, stage_id)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    setConversations((data as any) || []);
  }

  async function loadMeta() {
    const [p, s] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("stages").select("id, name, color").order("order_index"),
    ]);
    const pmap: Record<string, Profile> = {};
    (p.data || []).forEach((x: any) => { pmap[x.id] = x; });
    setProfiles(pmap);
    setAgents((p.data as any) || []);
    setStages((s.data as any) || []);
  }

  useEffect(() => { loadConversations(); loadMeta(); }, []);

  // Realtime: conversation list updates (new convs, unread, assignment, last message)
  useEffect(() => {
    const ch = supabase
      .channel("inbox-conversations-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts" }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Load messages on active change
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("sent_at", { ascending: true });
      setMessages((data as any) || []);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
    })();
  }, [activeId]);

  // Realtime messages for active conversation (mirror across agents/tabs)
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`messages-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === (payload.new as any).id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      !q ||
      c.contact?.full_name?.toLowerCase().includes(q) ||
      c.contact?.whatsapp_number?.includes(q)
    );
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeId);

  async function sendMessage() {
    if (!text.trim() || !activeId) return;
    setSending(true);
    const content = text.trim();
    setText("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://iqllohqbaqmdiyojygow.supabase.co/functions/v1/fonnte-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ conversation_id: activeId, content }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok || !json.ok) {
      toast.error(json.error || "Gagal kirim pesan");
      setText(content);
    }
  }

  async function assignAgent(agentId: string | null) {
    if (!activeId) return;
    const { error } = await supabase.from("conversations")
      .update({ assigned_agent_id: agentId }).eq("id", activeId);
    if (error) return toast.error(error.message);
    toast.success(agentId ? `Ditugaskan ke ${profiles[agentId]?.full_name || profiles[agentId]?.email}` : "Penugasan dihapus");
    loadConversations();
  }

  async function changeStage(stageId: string) {
    if (!active?.contact_id) return;
    const { error } = await supabase.from("contacts")
      .update({ stage_id: stageId }).eq("id", active.contact_id);
    if (error) return toast.error(error.message);
    toast.success("Stage diperbarui");
    loadConversations();
  }

  function agentName(id: string | null) {
    if (!id) return "Sistem";
    const p = profiles[id];
    return p?.full_name || p?.email?.split("@")[0] || "Agent";
  }

  return (
    <div className="h-full flex">
      <div className={cn("w-full md:w-80 border-r flex flex-col", activeId && "hidden md:flex")}>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kontak…" className="pl-8" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · {conversations.length} percakapan
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Belum ada percakapan.<br />
              <span className="text-xs">Pesan masuk via Fonnte webhook akan muncul real-time.</span>
            </div>
          )}
          {filtered.map((c) => {
            const stage = stages.find((s) => s.id === c.contact?.stage_id);
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b hover:bg-accent flex flex-col gap-1",
                  activeId === c.id && "bg-accent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {c.contact?.full_name || c.contact?.whatsapp_number}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 shrink-0">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || "—"}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {stage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: (stage.color || "#888") + "20", color: stage.color || "inherit" }}>
                      {stage.name}
                    </span>
                  )}
                  {c.assigned_agent_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <UserIcon className="size-2.5" /> {agentName(c.assigned_agent_id)}
                    </span>
                  )}
                  {!c.assigned_agent_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      Belum ditugaskan
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: idLocale })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("flex-1 flex flex-col min-w-0", !activeId && "hidden md:flex")}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
            Pilih percakapan untuk mulai chat.
          </div>
        ) : (
          <>
            <header className="px-4 py-3 border-b bg-card space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <button className="md:hidden text-xs text-primary mb-1" onClick={() => setActiveId(null)}>← Kembali</button>
                  <div className="font-semibold">{active.contact?.full_name || "Tanpa nama"}</div>
                  <div className="text-xs text-muted-foreground">{active.contact?.whatsapp_number}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Tag className="size-3.5 text-muted-foreground" />
                    <Select value={active.contact?.stage_id || ""} onValueChange={changeStage}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="size-3.5 text-muted-foreground" />
                    <Select
                      value={active.assigned_agent_id || "unassigned"}
                      onValueChange={(v) => assignAgent(v === "unassigned" ? null : v)}
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue placeholder="Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Belum ditugaskan</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name || a.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {user && (!active.assigned_agent_id || active.assigned_agent_id !== user.id) && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assignAgent(user.id)}>
                      Ambil chat ini
                    </Button>
                  )}
                </div>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3 bg-muted/30">
              {messages.map((m) => {
                const out = m.direction === "OUTBOUND";
                return (
                  <div key={m.id} className={cn("flex flex-col gap-0.5", out ? "items-end" : "items-start")}>
                    {out && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        {agentName(m.sent_by_id)}
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                        out
                          ? "bg-chat-out text-chat-out-foreground rounded-br-sm"
                          : "bg-chat-in text-chat-in-foreground border rounded-bl-sm"
                      )}
                    >
                      {m.content}
                      <div className="text-[10px] opacity-60 mt-1 text-right">
                        {new Date(m.sent_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">Belum ada pesan.</p>}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="border-t p-3 flex gap-2 bg-card">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Balas sebagai ${agentName(user?.id || null)}…`}
                disabled={sending}
                autoFocus
              />
              <Button type="submit" disabled={sending || !text.trim()}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
