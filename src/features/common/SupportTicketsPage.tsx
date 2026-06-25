import { useState, useEffect } from "react";
import { LifeBuoy, Search, X, Send, MessageSquare, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getSupportTickets, replyToTicket, updateTicketStatus } from "@/shared/lib/api";
import { toast } from "sonner";
export type SupportTicket = {
  id: string;
  tenant: string;
  raisedBy: string;
  email: string;
  subject: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Critical" | "High" | "Medium" | "Low";
  category: "Billing" | "Technical" | "Account" | "Feature Request";
  createdAt: string;
  updatedAt: string;
  messages: { sender: string; text: string; time: string; isStaff: boolean }[];
};



const PRIORITY_COLORS: Record<SupportTicket["priority"], string> = {
  Critical: "bg-red-500/15 text-red-700 dark:text-red-400",
  High: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Low: "bg-[var(--gold-muted)] text-[var(--gold)]",
};
const STATUS_COLORS: Record<SupportTicket["status"], string> = {
  Open: "bg-red-500/15 text-red-700 dark:text-red-400",
  "In Progress": "bg-[var(--gold-muted)] text-[var(--gold)]",
  Resolved: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Closed: "bg-muted text-muted-foreground",
};
const CATEGORY_COLORS: Record<SupportTicket["category"], string> = {
  Billing: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Technical: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Account: "bg-[var(--gold-muted)] text-[var(--gold)]",
  "Feature Request": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

function TicketModal({ ticket, onClose, onRefresh }: { ticket: any; onClose: () => void; onRefresh: () => void }) {
  const [reply, setReply] = useState("");
  const [statusVal, setStatusVal] = useState(ticket.status || "Open");
  const [sending, setSending] = useState(false);
  const messages = ticket.messages || [];

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const { error } = await replyToTicket(ticket.id, reply, true);
    setSending(false);
    if (error) toast.error(error);
    else { toast.success("Reply sent!"); setReply(""); onRefresh(); }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusVal(newStatus);
    const { error } = await updateTicketStatus(ticket.id, newStatus);
    if (error) toast.error(error);
    else { toast.success(`Ticket marked as ${newStatus}`); onRefresh(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs text-muted-foreground">{ticket.id || ticket.subject?.slice(0,8)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[(ticket.priority || "Medium") as keyof typeof PRIORITY_COLORS] || "bg-muted text-muted-foreground"}`}>{ticket.priority || "Medium"}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[(ticket.status || "Open") as keyof typeof STATUS_COLORS] || "bg-muted text-muted-foreground"}`}>{ticket.status || "Open"}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">{ticket.category || "Technical"}</span>
            </div>
            <h2 className="text-base font-semibold text-foreground">{ticket.subject}</h2>
            <p className="text-sm text-muted-foreground">{ticket.institutions?.name || ticket.tenant || ""} · {ticket.profiles?.name || ticket.raisedBy || ""}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-muted/10">
          {messages.map((msg: any, i: number) => (
            <div key={i} className={`flex ${msg.isStaff || msg.is_staff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm shadow-sm ${msg.isStaff || msg.is_staff ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>
                {!(msg.isStaff || msg.is_staff) && <p className="text-xs font-medium mb-1 opacity-70">{msg.sender || msg.profiles?.name || "User"}</p>}
                <p>{msg.text || msg.content}</p>
                <p className={`text-[10px] mt-1 ${msg.isStaff || msg.is_staff ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{msg.time || new Date(msg.created_at || Date.now()).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex gap-2">
            <select value={statusVal} onChange={e => handleStatusChange(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
              <option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option>
            </select>
          </div>
          <div className="flex gap-2">
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Write a reply…" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" />
            <Button className="gap-2 self-end" onClick={handleReply} disabled={sending || !reply.trim()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Reply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupportTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [viewing, setViewing] = useState<any | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await getSupportTickets();
    if (!error && data) {
      setTickets(data as any[]);
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  const filtered = tickets.filter(t => {
    const matchTab = tab === "All" || (t.status || "Open") === tab;
    const subject = t.subject || "";
    const tenant = t.institutions?.name || t.tenant || "";
    const matchSearch = subject.toLowerCase().includes(search.toLowerCase()) || tenant.toLowerCase().includes(search.toLowerCase());
    const matchPriority = priorityFilter === "All" || (t.priority || "Medium") === priorityFilter;
    return matchTab && matchSearch && matchPriority;
  });

  const open = tickets.filter(t => t.status === "Open").length;
  const inProgress = tickets.filter(t => t.status === "In Progress").length;
  const critical = tickets.filter(t => t.priority === "Critical").length;

  return (
    <div className="p-8">
      {viewing && <TicketModal ticket={viewing} onClose={() => setViewing(null)} onRefresh={fetchTickets} />}

      <PageHeader title="Support Tickets" description="Manage tenant support requests, incidents, and feature requests." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Open tickets" value={String(open)} icon={LifeBuoy} trend={{ value: "Needs response", isPositive: false }} />
        <StatCard title="In progress" value={String(inProgress)} icon={MessageSquare} trend={{ value: "Being handled", isPositive: true }} />
        <StatCard title="Critical priority" value={String(critical)} icon={LifeBuoy} trend={{ value: "Immediate attention", isPositive: false }} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-lg w-fit">
        {(["All", "Open", "In Progress", "Resolved", "Closed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            <span className="ml-1.5 text-xs opacity-60">
              {t === "All" ? tickets.length : tickets.filter(tk => tk.status === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "Critical", "High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
        </select>
        {(search || priorityFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPriorityFilter("All"); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length} ticket{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <LifeBuoy className="w-10 h-10 mx-auto mb-2 opacity-30" />No tickets match your filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(ticket => (
              <div key={ticket.id} className="px-6 py-4 hover:bg-accent/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{ticket.id?.slice(0,8) || "#"}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[(ticket.priority as keyof typeof PRIORITY_COLORS)] || "bg-muted text-muted-foreground"}`}>{ticket.priority || "Medium"}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[(ticket.status as keyof typeof STATUS_COLORS)] || "bg-muted text-muted-foreground"}`}>{ticket.status || "Open"}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">{ticket.category || "Technical"}</span>
                    </div>
                    <p className="font-medium text-foreground">{ticket.subject}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{ticket.institutions?.name || ticket.tenant || ""} · {ticket.profiles?.name || ticket.raisedBy || ""}</p>
                    <p className="text-xs text-muted-foreground mt-1">Created {new Date(ticket.created_at || ticket.createdAt || Date.now()).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{(ticket.messages?.length ?? 0)} msg{(ticket.messages?.length ?? 0) !== 1 ? "s" : ""}</span>
                    <Button size="sm" onClick={() => setViewing(ticket)}>Open</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
