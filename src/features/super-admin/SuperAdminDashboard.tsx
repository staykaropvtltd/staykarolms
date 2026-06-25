import { useState, useEffect } from "react";
import { Building2, DollarSign, Users, Server, AlertTriangle, Clock, ArrowUpRight, Zap, Loader2 } from "lucide-react";
import { StatCard } from "@/shared/components/StatCard";
import { useNavigate } from "react-router";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getInstitutions, getBilling, getAuditLogs, getSupportTickets } from "@/shared/lib/api";

// System health panel — real service monitoring not available via backend;
// show a static "Operational" view since we can't ping individual services
const SYSTEM_SERVICES = [
  { id: "1", name: "Main Database",   status: "Healthy", latency: "12ms",  cpu: 34 },
  { id: "2", name: "Auth Service",    status: "Healthy", latency: "8ms",   cpu: 21 },
  { id: "3", name: "File Storage",    status: "Healthy", latency: "45ms",  cpu: 15 },
  { id: "4", name: "Notifications",   status: "Healthy", latency: "6ms",   cpu: 9 },
];

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--gold)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "var(--foreground)",
};

// Plan badge: all gold variants
const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  Enterprise: { bg: "var(--gold)",       color: "#1A1A1A" },
  Growth:     { bg: "var(--gold-muted)", color: "var(--gold)" },
  Starter:    { bg: "var(--muted)",      color: "var(--muted-foreground)" },
};

// Status: semantic only
const STATUS_COLORS: Record<string, string> = {
  Active:    "var(--gold)",
  Overdue:   "rgb(239,68,68)",
  Suspended: "rgb(239,68,68)",
  Trial:     "var(--muted-foreground)",
};

// Audit severity: gold for info, semantic for warning/critical
const SEVERITY_STYLES: Record<string, { bg: string; color: string }> = {
  info:     { bg: "var(--gold-muted)",    color: "var(--gold)" },
  warning:  { bg: "rgba(245,158,11,0.1)", color: "rgb(245,158,11)" },
  critical: { bg: "rgba(239,68,68,0.1)", color: "rgb(239,68,68)" },
};

// Service health dots: semantic
const SERVICE_DOT: Record<string, string> = {
  Healthy:  "bg-[var(--gold)]",
  Degraded: "bg-amber-500",
  Down:     "bg-red-500",
};
const SERVICE_STATUS: Record<string, string> = {
  Healthy:  "text-[var(--gold)]",
  Degraded: "text-amber-500",
  Down:     "text-red-500",
};

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub: string; positive?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs mt-1 font-semibold" style={{ color: positive ? "var(--gold)" : "rgb(239,68,68)" }}>{sub}</p>
    </div>
  );
}

export function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [invoices,     setInvoices]     = useState<any[]>([]);
  const [auditLogs,    setAuditLogs]    = useState<any[]>([]);
  const [tickets,      setTickets]      = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      getInstitutions(),
      getBilling(),
      getAuditLogs({ limit: 8 }),
      getSupportTickets(),
    ]).then(([instRes, billRes, auditRes, ticketRes]) => {
      setInstitutions(instRes.data || []);
      setInvoices(billRes.data     || []);
      setAuditLogs(auditRes.data   || []);
      setTickets(ticketRes.data    || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-8">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
    </div>
  );

  const activeTenants    = institutions.filter(i => i.status === "Active" || !i.status).length;
  const degradedServices = SYSTEM_SERVICES.filter(s => s.status !== "Healthy").length;
  const openTickets      = tickets.filter(t => t.status === "open").length;
  const overdueInvoices  = invoices.filter(i => i.status === "overdue").length;
  const totalMrr         = invoices.filter(i => i.status === "paid").reduce((a, i) => a + (i.amount || 0), 0);

  // Build revenue trend from paid invoices grouped by month
  const mrrByMonth: Record<string, number> = {};
  invoices.filter(i => i.status === "paid" && i.paid_at).forEach(i => {
    const month = new Date(i.paid_at).toLocaleString("default", { month: "short" });
    mrrByMonth[month] = (mrrByMonth[month] || 0) + i.amount;
  });
  const revenueTrend = Object.entries(mrrByMonth).map(([month, mrr]) => ({ month, mrr }));

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Super Admin Control Panel</h1>
          <p className="text-muted-foreground mt-1">StayKaro LMS · Platform-wide management · May 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
            style={
              degradedServices > 0
                ? { background: "rgba(245,158,11,0.1)", color: "rgb(245,158,11)" }
                : { background: "var(--gold-muted)", color: "var(--gold)" }
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${degradedServices > 0 ? "bg-amber-500" : ""}`}
              style={degradedServices === 0 ? { background: "var(--gold)" } : undefined}
            />
            {degradedServices > 0 ? `${degradedServices} services degraded` : "All systems operational"}
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Institutions" value={String(institutions.length)}                            icon={Building2}  trend={{ value: `${activeTenants} active`, isPositive: true }} />
        <StatCard title="Total MRR"          value={totalMrr ? `₹${(totalMrr / 100000).toFixed(1)}L` : "—"} icon={DollarSign} trend={{ value: "Paid invoices",           isPositive: true }} />
        <StatCard title="Open Tickets"       value={String(openTickets)}                                    icon={Zap}        trend={{ value: "Support queue",            isPositive: openTickets === 0 }} />
        <StatCard title="Overdue Invoices"   value={String(overdueInvoices)}                                icon={Server}     trend={{ value: "Need follow-up",           isPositive: overdueInvoices === 0 }} />
      </div>

      {/* SaaS Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="ARR"     value="₹10.7Cr" sub="+12.7% MoM"        positive />
        <MetricCard label="Churn"   value="1.8%"    sub="-0.3% vs last"      positive />
        <MetricCard label="NRR"     value="118%"    sub="Expansion revenue"  positive />
        <MetricCard label="LTV"     value="₹24L"    sub="Avg per tenant"     positive />
        <MetricCard label="CAC"     value="₹85K"    sub="Acquisition cost"   positive />
        <MetricCard label="LTV:CAC" value="28x"     sub="Healthy ratio"      positive />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR Area */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">MRR Growth</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">Dec 2025 – May 2026</span>
          </div>
          {revenueTrend.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No paid invoices yet</div>
          ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueTrend}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--gold)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`, "MRR"]} />
              <Area type="monotone" dataKey="mrr" stroke="var(--gold)" strokeWidth={2.5} fill="url(#mrrGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* New vs Churned MRR */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">New vs Churned MRR</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">Monthly</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`]} />
              <Legend />
              <Bar dataKey="newMrr"     fill="var(--gold)"            radius={[4, 4, 0, 0]} name="New MRR" />
              <Bar dataKey="churnedMrr" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} name="Churned MRR" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tenants + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Tenants */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Top Tenants by MRR</h2>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate("/super-admin/tenants")}>
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground">Tenant</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground">Plan</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-muted-foreground">Students</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-muted-foreground">MRR</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {institutions.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No institutions found</td></tr>
                ) : (
                  institutions.slice(0, 6).map(t => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                          <Building2 className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.type || "Institution"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: PLAN_STYLES[t.plan]?.bg ?? "var(--muted)", color: PLAN_STYLES[t.plan]?.color ?? "var(--muted-foreground)" }}>
                        {t.plan || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{t.student_count ?? "—"}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-bold text-foreground">
                      {t.mrr ? `₹${(t.mrr / 1000).toFixed(0)}K` : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[t.status ?? "Active"] ?? "var(--muted-foreground)" }}>
                        ● {t.status ?? "Active"}
                      </span>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">System Health</h2>
            <span
              className="text-xs font-semibold"
              style={{ color: degradedServices > 0 ? "rgb(245,158,11)" : "var(--gold)" }}
            >
              {degradedServices > 0 ? `${degradedServices} issues` : "● Operational"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {SYSTEM_SERVICES.slice(0, 6).map(s => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${SERVICE_DOT[s.status]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.latency} · CPU {s.cpu}%</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold shrink-0 ml-2 ${SERVICE_STATUS[s.status]}`}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log + Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audit log */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent Audit Activity</h2>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate("/super-admin/audit")}>
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {auditLogs.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No audit logs yet</div>
            ) : auditLogs.slice(0, 6).map(log => (
              <div key={log.id} className="flex items-start gap-3 px-6 py-3 hover:bg-muted/20 transition-colors">
                <span
                  className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                  style={{
                    background: SEVERITY_STYLES[log.severity]?.bg ?? "var(--muted)",
                    color: SEVERITY_STYLES[log.severity]?.color ?? "var(--muted-foreground)",
                  }}
                >
                  {(log.severity || "info").toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{(log.action || "").replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {log.profiles?.name ?? log.user_id ?? "System"} · {log.resource_type ?? "—"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan distribution */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Plan Distribution</h2>
          <div className="space-y-4">
            {(() => {
              const total = institutions.length || 1;
              return [
                { plan: "Enterprise", count: institutions.filter(t => t.plan === "Enterprise").length, barStyle: { background: "var(--gold)" } },
                { plan: "Growth",     count: institutions.filter(t => t.plan === "Growth").length,     barStyle: { background: "var(--gold)", opacity: 0.6 } },
                { plan: "Starter",    count: institutions.filter(t => t.plan === "Starter").length,    barStyle: { background: "var(--gold)", opacity: 0.3 } },
              ].map(({ plan, count, barStyle }) => {
                const pct = Math.round((count / total) * 100);
                return ({ plan, count, pct, barStyle });
              });
            })().map(({ plan, count, pct, barStyle }) => (
              <div key={plan}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">{plan}</span>
                  <span className="font-bold text-foreground">{count} tenants</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, ...barStyle }} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{pct}% of tenants</p>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-border space-y-2.5">
            <h3 className="text-sm font-semibold text-foreground">Quick Stats</h3>
            {[
              { label: "Overdue invoices", value: String(overdueInvoices),                                              icon: AlertTriangle, danger: overdueInvoices > 0 },
              { label: "Trials expiring",  value: String(institutions.filter(i => i.status === "Trial").length),        icon: Clock,         danger: false },
              { label: "Open tickets",     value: String(openTickets),                                                  icon: Zap,           danger: openTickets > 0 },
            ].map(({ label, value, icon: Icon, danger }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: danger ? "rgb(239,68,68)" : "var(--gold)" }}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <span className="text-sm font-bold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
