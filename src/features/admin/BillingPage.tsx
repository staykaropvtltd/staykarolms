import { useState, useEffect } from "react";
import { DollarSign, FileText, CreditCard, Download, Search, X, Eye, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getBilling } from "@/shared/lib/api";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ApiBilling {
  id: string;
  institution_id: string;
  plan: string;
  amount: number;
  status: string;
  paid_at?: string;
  invoice_url?: string;
  institutions?: { name: string };
}

function buildRevenueTrend(invoices: ApiBilling[]) {
  const map: Record<string, number> = {};
  invoices.filter(i => i.status === "paid" && i.paid_at).forEach(i => {
    const month = new Date(i.paid_at!).toLocaleString("default", { month: "short" });
    map[month] = (map[month] || 0) + i.amount;
  });
  return Object.entries(map).map(([month, mrr]) => ({ month, mrr }));
}

const STATUS_COLORS: Record<string, string> = {
  paid:     "bg-[var(--gold-muted)] text-[var(--gold)]",
  overdue:  "bg-red-500/15 text-red-700 dark:text-red-400",
  pending:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  refunded: "bg-muted text-muted-foreground",
};

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

function InvoiceModal({ invoice, onClose }: { invoice: ApiBilling; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{invoice.id.slice(0, 8).toUpperCase()}</h2>
            <p className="text-sm text-muted-foreground">{invoice.institutions?.name ?? "Unknown institution"}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: "Amount",    value: `₹${invoice.amount.toLocaleString()}` },
            { label: "Plan",      value: invoice.plan },
            { label: "Status",    value: invoice.status },
            { label: "Paid",      value: invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-sm font-medium text-foreground capitalize">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-6 pt-0">
          {invoice.invoice_url && (
            <Button className="flex-1 gap-2" onClick={() => window.open(invoice.invoice_url, "_blank")}>
              <Download className="w-4 h-4" /> Download PDF
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function BillingPage() {
  const [invoices, setInvoices] = useState<ApiBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewing, setViewing] = useState<ApiBilling | null>(null);

  const fetchBilling = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getBilling();
    if (err) setError(err);
    else setInvoices((data as ApiBilling[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchBilling(); }, []);

  const filtered = invoices.filter(inv => {
    const matchSearch = (inv.institutions?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      inv.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || inv.status === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const totalMrr    = invoices.filter(i => i.status === "paid").reduce((a, i) => a + i.amount, 0);
  const outstanding = invoices.filter(i => i.status === "overdue" || i.status === "pending").reduce((a, i) => a + i.amount, 0);
  const paidCount   = invoices.filter(i => i.status === "paid").length;
  const revenueTrend = buildRevenueTrend(invoices);

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-red-500 opacity-60" />
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchBilling}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      {viewing && <InvoiceModal invoice={viewing} onClose={() => setViewing(null)} />}

      <PageHeader
        title="Billing & Revenue"
        description="MRR, invoices, and payment health across all tenants."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="size-4" /> Export ledger
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Total MRR" value={loading ? "—" : `₹${(totalMrr / 100000).toFixed(1)}L`} icon={DollarSign} trend={{ value: "Live from Supabase", isPositive: true }} />
        <StatCard title="Outstanding" value={loading ? "—" : `₹${(outstanding / 1000).toFixed(0)}K`} icon={FileText} trend={{ value: `${invoices.filter(i => i.status === "overdue").length} overdue`, isPositive: false }} />
        <StatCard title="Paid invoices" value={loading ? "—" : String(paidCount)} icon={CreditCard} trend={{ value: "All time", isPositive: true }} />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Revenue by Month (Paid Invoices)</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{revenueTrend.length} months</span>
        </div>
        {revenueTrend.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "No paid invoices yet"}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueTrend}>
            <defs>
              <linearGradient id="billingGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--gold)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`, "MRR"]} />
            <Area type="monotone" dataKey="mrr" stroke="var(--gold)" strokeWidth={2} fill="url(#billingGrad)" />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "Paid", "Pending", "Overdue", "Refunded"].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("All"); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} invoice${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Invoice ID</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Institution</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plan</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Paid On</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                    {invoices.length === 0 ? "No billing records found." : "No invoices match your filters."}
                  </td></tr>
                ) : filtered.map(inv => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{inv.id.slice(0, 8).toUpperCase()}</td>
                    <td className="py-3 px-4 font-medium text-foreground">{inv.institutions?.name ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs capitalize">{inv.plan}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold">₹{inv.amount.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[inv.status] ?? "bg-muted text-muted-foreground"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setViewing(inv)}>
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
