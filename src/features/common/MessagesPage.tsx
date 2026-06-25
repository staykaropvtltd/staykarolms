import { useState, useEffect, useRef } from "react";
import { MessageSquare, Search, Send, Plus, X, Loader2 } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getMessageThreads, getThreadMessages, sendMessage, markMessageRead, getUsers } from "@/shared/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/shared/context/AuthContext";
import { supabase } from "@/shared/lib/supabase";

interface Thread {
  userId: string;
  name: string;
  email: string;
  avatar_url: string;
  role: "student" | "admin" | "faculty" | "super-admin" | string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  messages: any[];
}

interface MessagesPageProps {
  userType: Extract<UserType, "student" | "faculty">;
}

const ROLE_BADGE: Record<string, string> = {
  student: "bg-[var(--gold-muted)] text-[var(--gold)]",
  admin:   "bg-[var(--gold-muted)] text-[var(--gold)]",
  faculty: "bg-[var(--gold-muted)] text-[var(--gold)]",
  "super-admin": "bg-red-500/10 text-red-500",
};

function ComposeModal({ onClose, onSent }: { onClose: () => void, onSent: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getUsers().then(({ data }) => setUsers(data || []));
  }, []);

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())).slice(0, 5);

  const handleSend = async () => {
    if (!selectedUser) return toast.error("Please select a recipient");
    if (!message.trim()) return toast.error("Message cannot be empty");
    setLoading(true);
    try {
      await sendMessage(selectedUser.id, message.trim());
      toast.success("Message sent");
      onSent();
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">New Message</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto min-h-0">
          {!selectedUser ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
                placeholder="Search user…" 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="mt-2 border border-border rounded-md overflow-hidden">
                {filteredUsers.map(u => (
                  <button 
                    key={u.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0 flex items-center justify-between"
                    onClick={() => setSelectedUser(u)}
                  >
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BADGE[u.role] || ROLE_BADGE['student']}`}>{u.role}</span>
                  </button>
                ))}
                {filteredUsers.length === 0 && search && <p className="text-xs text-muted-foreground p-3">No users found.</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-muted p-3 rounded-md">
              <div>
                <p className="text-xs text-muted-foreground">To:</p>
                <p className="font-medium text-sm">{selectedUser.name}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Change</Button>
            </div>
          )}
          
          <div>
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea 
              rows={5} 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" 
              placeholder="Write your message…" 
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0 shrink-0">
          <Button className="flex-1 gap-2" onClick={handleSend} disabled={loading || !selectedUser || !message.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function MessagesPage({ userType }: MessagesPageProps) {
  const isFaculty = userType === "faculty";
  const { user } = useAuth();
  
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    try {
      const { data } = await getMessageThreads();
      if (data) {
        setThreads(data);
        if (!active && data.length > 0) {
          setActive(data[0].userId);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadActiveMessages = async (userId: string) => {
    try {
      const { data } = await getThreadMessages(userId);
      if (data) setActiveMessages(data);
      // Update unread count locally
      setThreads(prev => prev.map(t => t.userId === userId ? { ...t, unread: 0 } : t));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (active) {
      loadActiveMessages(active);
    }
    if (!user) return;

    // Real-time subscription for messages
    const channel = supabase
      .channel("public:messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          loadThreads();
          if (active === payload.new.sender_id) {
            loadActiveMessages(active);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` },
        (payload) => {
          loadThreads();
          if (active === payload.new.receiver_id) {
            loadActiveMessages(active);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  const activeThread = threads.find(t => t.userId === active);
  const filteredThreads = threads.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.lastMessage.toLowerCase().includes(search.toLowerCase()));
  const totalUnread = threads.reduce((a, t) => a + t.unread, 0);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || !active) return;
    setInput("");
    try {
      // Optimistic update
      const newMsg = { id: Date.now(), sender_id: user?.id, content: text, created_at: new Date().toISOString(), isMe: true };
      setActiveMessages(prev => [...prev, newMsg]);
      setThreads(prev => prev.map(t => t.userId === active ? { ...t, lastMessage: text, lastMessageTime: new Date().toISOString() } : t));
      
      await sendMessage(active, text);
      loadActiveMessages(active);
      loadThreads();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="p-8 h-full flex flex-col min-h-0">
      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} onSent={() => { setShowCompose(false); loadThreads(); }} />}

      <PageHeader
        title="Messages"
        description={isFaculty ? "Chat with students and staff in one inbox." : "Reach faculty, peers, and support without leaving the LMS."}
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowCompose(true)}>
            <Plus className="size-4" /> Compose
          </Button>
        }
      />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0 min-h-[520px] rounded-xl border border-border bg-card overflow-hidden">
        {/* Thread list */}
        <div className="border-b md:border-b-0 md:border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm"
              />
            </div>
            {totalUnread > 0 && (
              <p className="text-xs text-muted-foreground mt-2">{totalUnread} unread message{totalUnread !== 1 ? "s" : ""}</p>
            )}
          </div>
          <div className="overflow-y-auto flex-1 relative">
            {loading && threads.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No conversations found.</p>
            ) : (
              filteredThreads.map(t => (
                <button
                  key={t.userId}
                  type="button"
                  onClick={() => setActive(t.userId)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${active === t.userId ? "bg-accent/70" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                      <span className="text-xs font-bold" style={{ color: "var(--gold)" }}>{getInitials(t.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-foreground text-sm truncate">{t.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{new Date(t.lastMessageTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_BADGE[t.role] || ROLE_BADGE['student']}`}>{t.role}</span>
                        {t.unread > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-[#1A1A1A]" style={{ background: "var(--gold)" }}>{t.unread}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate pl-9">{t.lastMessage}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="md:col-span-2 flex flex-col bg-muted/5 relative">
          {activeThread ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                  <span className="text-xs font-bold" style={{ color: "var(--gold)" }}>{getInitials(activeThread.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{activeThread.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_BADGE[activeThread.role] || ROLE_BADGE['student']}`}>{activeThread.role}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
                {activeMessages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm shadow-sm ${msg.isMe ? "text-[#1A1A1A]" : "bg-card border border-border text-foreground"}`} style={msg.isMe ? { background: "var(--gold)" } : {}}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-1 text-right ${msg.isMe ? "text-[#1A1A1A]/70" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-border flex gap-2 bg-card">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Write a message…"
                />
                <Button size="sm" className="gap-1 shrink-0" onClick={handleSendMessage}>
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>Select a conversation or start a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
