import { useState, useEffect } from "react";
import {
  Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle,
  X, FileText, BookOpen, Trash2, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getNotifications, markNotificationRead } from "@/shared/lib/api";
import { supabase } from "@/shared/lib/supabase";
import { useAuth } from "@/shared/context/AuthContext";
import { motion, AnimatePresence } from "motion/react";

interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type: "success" | "info" | "warning" | "error";
  category: "system" | "academic" | "assignment" | "certificate";
  read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<ApiNotification["type"], React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-[var(--gold)]" />,
  info:    <Info className="w-5 h-5 text-[var(--gold)]" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  error:   <XCircle className="w-5 h-5 text-red-500" />,
};

const TYPE_ICON_LG: Record<ApiNotification["type"], React.ReactNode> = {
  success: <CheckCircle className="w-12 h-12 text-[var(--gold)]" />,
  info:    <Info className="w-12 h-12 text-[var(--gold)]" />,
  warning: <AlertTriangle className="w-12 h-12 text-amber-500" />,
  error:   <XCircle className="w-12 h-12 text-red-500" />,
};

const TYPE_BG: Record<ApiNotification["type"], string> = {
  success: "bg-[var(--gold-muted)]",
  info:    "bg-[var(--gold-muted)]",
  warning: "bg-amber-500/10",
  error:   "bg-red-500/10",
};

const TYPE_BADGE: Record<ApiNotification["type"], string> = {
  success: "bg-[var(--gold-muted)] text-[var(--gold)]",
  info:    "bg-[var(--gold-muted)] text-[var(--gold)]",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error:   "bg-red-500/15 text-red-600 dark:text-red-400",
};

const CATEGORY_LABELS: Record<ApiNotification["category"], string> = {
  system:      "System",
  academic:    "Academic",
  assignment:  "Assignment",
  certificate: "Certificate",
};

type Tab = "All" | ApiNotification["category"];

function getActionButton(
  category: ApiNotification["category"],
  onClose: () => void,
  navigate: (path: string) => void,
  role: string
) {
  const roleRoutes: Record<string, { assignments: string; courses: string; certificates: string }> = {
    student:      { assignments: "assignments",       courses: "my-courses",   certificates: "certificates" },
    faculty:      { assignments: "assignment-review", courses: "my-courses",   certificates: "certificates" },
    admin:        { assignments: "assignments",       courses: "courses",      certificates: "certificates" },
    "super-admin":{ assignments: "assignments",       courses: "courses",      certificates: "certificates" },
  };
  const routes = roleRoutes[role] || roleRoutes.student;

  if (category === "assignment") {
    return (
      <Button className="w-full gap-2" style={{ background: "var(--gold)", color: "#1A1A1A" }}
        onClick={() => { onClose(); navigate(`/${role}/${routes.assignments}`); }}>
        <FileText className="w-4 h-4" /> View Assignment
      </Button>
    );
  }
  if (category === "certificate") {
    return (
      <Button className="w-full gap-2" style={{ background: "var(--gold)", color: "#1A1A1A" }}
        onClick={() => { onClose(); navigate(`/${role}/${routes.certificates}`); }}>
        <BookOpen className="w-4 h-4" /> View Certificate
      </Button>
    );
  }
  if (category === "academic") {
    return (
      <Button className="w-full gap-2" style={{ background: "var(--gold)", color: "#1A1A1A" }}
        onClick={() => { onClose(); navigate(`/${role}/${routes.courses}`); }}>
        <BookOpen className="w-4 h-4" /> View Course
      </Button>
    );
  }
  return (
    <Button variant="outline" className="w-full gap-2" onClick={onClose}>
      <Trash2 className="w-4 h-4" /> Dismiss
    </Button>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("All");
  const [selected, setSelected] = useState<ApiNotification | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await getNotifications();
    if (data) setNotifications(data as ApiNotification[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    // Supabase Realtime subscription for new notifications
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as ApiNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filtered    = tab === "All" ? notifications : notifications.filter(n => n.category === tab);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await markNotificationRead(id);
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await Promise.all(unread.map(n => markNotificationRead(n.id)));
  };

  const openDrawer = (n: ApiNotification) => {
    setSelected(n);
    if (!n.read) markRead(n.id);
  };

  const closeDrawer = () => setSelected(null);
  const tabs: Tab[] = ["All", "system", "academic", "assignment", "certificate"];

  return (
    <div className="p-8">
      <PageHeader
        title="Notifications"
        description="Stay updated on platform activity, deadlines, and system alerts."
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={markAllRead}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(["success", "info", "warning", "error"] as ApiNotification["type"][]).map(type => {
          const count = notifications.filter(n => n.type === type).length;
          return (
            <div key={type} className={`rounded-xl border border-border p-4 flex items-center gap-3 ${TYPE_BG[type]}`}>
              {TYPE_ICON[type]}
              <div>
                <p className="text-xl font-bold text-foreground">{loading ? "—" : count}</p>
                <p className="text-xs text-muted-foreground capitalize">{type}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map(t => {
          const count = t === "All" ? notifications.length : notifications.filter(n => n.category === t).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "All" ? "All" : CATEGORY_LABELS[t as ApiNotification["category"]]}
              <span className="ml-1.5 text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} notification${filtered.length !== 1 ? "s" : ""}`}
          </span>
          {unreadCount > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">{unreadCount} unread</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            {notifications.length === 0 ? "No notifications yet." : "No notifications in this category."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(n => (
              <div
                key={n.id}
                className={`px-6 py-4 flex items-start gap-4 hover:bg-accent/30 transition-colors cursor-pointer ${!n.read ? "bg-accent/20" : ""}`}
                onClick={() => openDrawer(n)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${TYPE_BG[n.type]}`}>
                  {TYPE_ICON[n.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{CATEGORY_LABELS[n.category]}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
                </div>
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={e => { e.stopPropagation(); markRead(n.id); }}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={closeDrawer}
            />
            <motion.div
              key="drawer"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="fixed right-0 top-0 z-50 h-full w-96 bg-card border-l border-border shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <span className="font-semibold text-foreground">Notification Detail</span>
                <button onClick={closeDrawer} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex flex-col items-center text-center gap-4 py-4">
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${TYPE_BG[selected.type]}`}>
                    {TYPE_ICON_LG[selected.type]}
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${TYPE_BADGE[selected.type]}`}>{selected.type}</span>
                  <h2 className="text-lg font-bold text-foreground leading-snug">{selected.title}</h2>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <p className="text-sm text-foreground leading-relaxed">{selected.message}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Category</span>
                    <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded text-foreground">{CATEGORY_LABELS[selected.category]}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Received</span>
                    <span className="text-xs text-foreground">{formatTime(selected.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${selected.read ? "bg-green-500/10 text-green-500" : "bg-primary/15 text-primary"}`}>
                      {selected.read ? "Read" : "Unread"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-border shrink-0 space-y-2">
                {getActionButton(selected.category, closeDrawer, navigate, user?.role || "student")}
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={closeDrawer}>Close</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
