import { useState, useEffect } from "react";
import { Shield, Search, X, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getAuditLogs } from "@/shared/lib/api";
import { toast } from "sonner";

interface AuditLog {
  id: string;
  timestamp: string;
  severity: "info" | "warning" | "critical";
  action: string;
  actor: string;
  actorRole: "super-admin" | "admin" | "system";
  resource: string;
  resourceId: string;
  ip: string;
  status: "success" | "failed";
}

const AUDIT_LOGS: AuditLog[] = [];

const SEVERITY_COLORS: Record<AuditLog["severity"], string> = {
  info: "bg-[var(--gold-muted)] text-[var(--gold)]",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
};
const ROLE_COLORS: Record<AuditLog["actorRole"], string> = {
  "super-admin": "bg-[var(--gold-muted)] text-[var(--gold)]",
  admin: "bg-muted text-muted-foreground",
  system: "bg-muted text-muted-foreground",
};
const STATUS_COLORS: Record<AuditLog["status"], string> = {
  success: "text-[var(--gold)]",
  failed: "text-red-600",
};

const PAGE_SIZE = 8;

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (severityFilter !== "All") params.severity = severityFilter;
    if (statusFilter !== "All") params.status = statusFilter;
    const { data, error } = await getAuditLogs(Object.keys(params).length ? params : undefined);
    if (error) toast.error(error);
    else setLogs((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [severityFilter, statusFilter]);

  const filtered = logs.filter(log => {
    const matchSearch = !search ||
      (log.action || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.actor_email || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.resource || "").toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const criticalCount = logs.filter(l => l.severity === "critical").length;
  const warningCount = logs.filter(l => l.severity === "warning").length;
  const failedCount = logs.filter(l => l.status === "failed").length;

  return (
    <div className="p-8">
      <PageHeader
        title="Audit Logs"
        description="Complete trail of all platform actions, system events, and security incidents."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="size-4" /> Export logs
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total events", value: logs.length, color: "text-foreground" },
          { label: "Critical", value: criticalCount, color: "text-red-600" },
          { label: "Warnings", value: warningCount, color: "text-amber-600" },
          { label: "Failed actions", value: failedCount, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search action, actor, resource…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>
        <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "info", "warning", "critical"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "success", "failed"].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || severityFilter !== "All" || statusFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSeverityFilter("All"); setStatusFilter("All"); setPage(1); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Timestamp</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Severity</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Action</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Resource</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">IP</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {logs.length === 0 ? "No audit logs yet." : "No logs match your filters."}
                </td></tr>
              ) : paginated.map((log: any) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[log.severity as keyof typeof SEVERITY_COLORS] || "bg-muted text-muted-foreground"}`}>{log.severity}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-foreground">{log.action}</td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-xs text-foreground truncate max-w-[160px]">{log.actor_email || "system"}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">{log.actor_role || "system"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{log.resource || "—"}</span>{log.resource_id ? ` · ${log.resource_id.slice(0, 8)}…` : ""}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{log.ip_address || "—"}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium ${STATUS_COLORS[log.status as keyof typeof STATUS_COLORS] || ""}`}>● {log.status || "success"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /> Prev</Button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={`w-8 h-8 rounded text-sm ${page === i + 1 ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}>{i + 1}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight className="size-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}
