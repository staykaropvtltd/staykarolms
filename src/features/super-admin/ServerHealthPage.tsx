import { useState, useEffect, useCallback } from "react";
import { Activity, Cpu, Database, RefreshCw, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getServerHealth, type ServiceHealthData } from "@/shared/lib/api";

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  status: "Resolved" | "Investigating" | "Monitoring";
  startTime: string;
  resolvedTime?: string;
  affectedServices: string[];
}

// No active incidents — populated manually when outages occur
const INCIDENTS: Incident[] = [];

const STATUS_COLORS: Record<ServiceHealthData["status"], string> = {
  Healthy:  "bg-[var(--gold-muted)] text-[var(--gold)]",
  Degraded: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Down:     "bg-red-500/15 text-red-700 dark:text-red-400",
};
const STATUS_DOT: Record<ServiceHealthData["status"], string> = {
  Healthy:  "bg-[var(--gold)]",
  Degraded: "bg-amber-500",
  Down:     "bg-red-500",
};
const INCIDENT_SEVERITY = {
  Low:      "bg-[var(--gold-muted)] text-[var(--gold)]",
  Medium:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  High:     "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Critical: "bg-red-500/15 text-red-700 dark:text-red-400",
};
const INCIDENT_STATUS = {
  Resolved:     "text-[var(--gold)]",
  Investigating: "text-red-600",
  Monitoring:   "text-amber-600",
};

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};

function MemBar({ value, warn = 70, danger = 85 }: { value: number; warn?: number; danger?: number }) {
  const barColor = value >= danger ? "bg-red-500" : value >= warn ? "bg-amber-500" : "";
  const textColor = value >= danger ? "text-red-600" : value >= warn ? "text-amber-600" : "text-[var(--gold)]";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${value}%`, ...(barColor ? {} : { background: "var(--gold)" }) }}
        />
      </div>
      <span className={`text-xs tabular-nums font-medium w-8 text-right ${textColor}`}>{value}%</span>
    </div>
  );
}

export function ServerHealthPage() {
  const [services, setServices] = useState<ServiceHealthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [uptimeHistory, setUptimeHistory] = useState<{ time: string; api: number; db: number; storage: number }[]>([]);

  const fetchHealth = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const { data, error } = await getServerHealth();
      if (error || !data) return;

      setServices(data.services);
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString());

      const timeLabel = new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setUptimeHistory(prev => [
        ...prev.slice(-23),
        {
          time: timeLabel,
          api:     data.services.find(s => s.id === "api")?.status     === "Healthy" ? 100 : 0,
          db:      data.services.find(s => s.id === "db")?.status      === "Healthy" ? 100 : 0,
          storage: data.services.find(s => s.id === "storage")?.status === "Healthy" ? 100 : 0,
        },
      ]);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const healthy  = services.filter(s => s.status === "Healthy").length;
  const degraded = services.filter(s => s.status === "Degraded").length;
  const down     = services.filter(s => s.status === "Down").length;
  const apiMem   = services.find(s => s.id === "api")?.memory ?? 0;

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Server Health"
        description="Live checks and saturation for all core services. Refreshes every 30 seconds."
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchHealth(true)}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${degraded + down > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-[var(--gold)]/30 bg-[var(--gold-muted)]"}`}>
          <Activity className={`w-8 h-8 ${degraded + down > 0 ? "text-amber-500" : "text-[var(--gold)]"}`} />
          <div>
            <p className="text-xs text-muted-foreground">Platform status</p>
            <p className="text-lg font-bold text-foreground">
              {loading ? "Checking…" : degraded + down > 0 ? "Partial Outage" : "Operational"}
            </p>
          </div>
        </div>
        <StatCard title="Healthy services" value={loading ? "—" : String(healthy)} icon={CheckCircle} trend={{ value: `${services.length} total`, isPositive: true }} />
        <StatCard title="Degraded / Down" value={loading ? "—" : String(degraded + down)} icon={AlertTriangle} trend={{ value: down > 0 ? `${down} down` : "All responding", isPositive: degraded + down === 0 }} />
        <StatCard title="API heap" value={loading ? "—" : `${apiMem}%`} icon={Cpu} trend={{ value: "Live process metric", isPositive: apiMem < 70 }} />
      </div>

      {/* Uptime chart — accumulates live polling data */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Uptime Monitor</h2>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Last updated {lastUpdated} · auto-refreshes every 30 s</span>
          )}
        </div>
        {uptimeHistory.length < 2 ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Gathering data — check back after the first poll cycle
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={uptimeHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`]} />
              <Legend />
              <Line type="monotone" dataKey="api"     stroke="var(--gold)"             strokeWidth={2} dot={false} name="API" />
              <Line type="monotone" dataKey="db"      stroke="var(--muted-foreground)" strokeWidth={2} dot={false} name="Database" />
              <Line type="monotone" dataKey="storage" stroke="var(--border)"           strokeWidth={2} dot={false} name="Storage" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Service cards */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Services</h2>
        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 flex justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : services.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            Unable to load service status — check backend connectivity
          </div>
        ) : (
          services.map(s => (
            <div key={s.id} className={`bg-card border rounded-xl p-5 ${s.status !== "Healthy" ? "border-amber-500/30" : "border-border"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[s.status]}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{s.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{s.detail} · {s.region}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Latency</p>
                    <p className={`font-mono font-medium ${parseInt(s.latency) > 500 ? "text-red-600" : parseInt(s.latency) > 200 ? "text-amber-600" : "text-[var(--gold)]"}`}>
                      {s.latency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                    <p className="font-medium text-foreground">{s.uptime}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground mb-1">CPU</p>
                    <MemBar value={s.cpu} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground mb-1">Memory</p>
                    <MemBar value={s.memory} />
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="sm">Logs</Button>
                  <Button variant="ghost" size="sm">Metrics</Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Incident log */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Incident Log</h2>
        </div>
        <div className="divide-y divide-border">
          {INCIDENTS.length === 0 ? (
            <div className="px-6 py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-8 h-8 text-[var(--gold)] opacity-60" />
              No active incidents
            </div>
          ) : (
            INCIDENTS.map(inc => (
              <div key={inc.id} className="px-6 py-4 hover:bg-accent/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-foreground">{inc.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INCIDENT_SEVERITY[inc.severity]}`}>{inc.severity}</span>
                      <span className={`text-xs font-medium ${INCIDENT_STATUS[inc.status]}`}>● {inc.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{inc.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Started: {inc.startTime}</span>
                      {inc.resolvedTime && <span>Resolved: {inc.resolvedTime}</span>}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {inc.affectedServices.map(svc => (
                        <span key={svc} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{svc}</span>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0">Details</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
