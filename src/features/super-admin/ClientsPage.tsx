import { useState, useEffect } from "react";
import { Building2, Plus, Search, X, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getInstitutions, createInstitution } from "@/shared/lib/api";
import { toast } from "sonner";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  type: "University" | "Bootcamp" | "Corporate" | "School";
  plan: "Enterprise" | "Growth" | "Starter";
  students: number;
  faculty: number;
  courses: number;
  status: "Active" | "Overdue" | "Suspended" | "Trial";
  mrr: number;
  adminEmail: string;
  renewalDate: string;
  storageUsed: number;
  storageLimit: number;
};



const PLAN_COLORS = { Enterprise: "bg-[var(--gold-muted)] text-[var(--gold)]", Growth: "bg-[var(--gold-muted)] text-[var(--gold)]", Starter: "bg-[var(--gold-muted)] text-[var(--gold)]" };
const STATUS_COLORS = { Active: "bg-[var(--gold-muted)] text-[var(--gold)]", Overdue: "bg-red-500/15 text-red-700 dark:text-red-400", Suspended: "bg-red-500/15 text-red-700 dark:text-red-400", Trial: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
const PAGE_SIZE = 5;

function AddTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", plan: "basic" });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    const { error } = await createInstitution({ name: form.name, plan: form.plan });
    setLoading(false);
    if (error) toast.error(error);
    else { toast.success("Institution created!"); onCreated(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add New Institution</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Institution name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. IIT Bombay" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Plan</label>
            <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="basic">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={handleCreate} disabled={loading || !form.name.trim()}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Institution
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function ManageTenantModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tenant.name}</h2>
            <p className="text-sm text-muted-foreground">{tenant.slug} · {tenant.type}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Students", value: tenant.students.toLocaleString() },
              { label: "Faculty", value: tenant.faculty },
              { label: "Courses", value: tenant.courses },
              { label: "MRR", value: `₹${(tenant.mrr / 1000).toFixed(0)}K` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-muted-foreground">Plan</label>
              <select defaultValue={tenant.plan} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option>Starter</option><option>Growth</option><option>Enterprise</option>
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Status</label>
              <select defaultValue={tenant.status} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option>Active</option><option>Suspended</option><option>Trial</option>
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Admin email</label><input defaultValue={tenant.adminEmail} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Renewal date</label><input defaultValue={tenant.renewalDate} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Storage usage</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${(tenant.storageUsed / tenant.storageLimit) > 0.8 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${(tenant.storageUsed / tenant.storageLimit) * 100}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{tenant.storageUsed} / {tenant.storageLimit} TB</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={() => { toast.success("Changes saved!"); onClose(); }}>Save Changes</Button>
          <Button variant="outline" className="gap-1.5" onClick={() => toast.info("Portal access requires admin credentials")}><ExternalLink className="w-3.5 h-3.5" /> Open Portal</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [managing, setManaging] = useState<any | null>(null);

  const fetchInstitutions = async () => {
    setLoading(true);
    const { data, error } = await getInstitutions();
    if (!error && data) {
      setInstitutions(data as any[]);
    } else {
      setInstitutions([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInstitutions(); }, []);

  const tenants = institutions as Tenant[];
  const filtered = tenants.filter(t => {
    const name = t.name || "";
    const adminEmail = t.adminEmail || (t as any).admin_email || "";
    const plan = t.plan || "";
    const status = t.status || "Active";
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) || adminEmail.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "All" || plan === planFilter;
    const matchStatus = statusFilter === "All" || status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalMrr = tenants.reduce((a, t) => a + (t.mrr || 0), 0);

  return (
    <div className="p-8">
      {showAdd && <AddTenantModal onClose={() => setShowAdd(false)} onCreated={fetchInstitutions} />}
      {managing && <ManageTenantModal tenant={managing} onClose={() => setManaging(null)} />}

      <PageHeader
        title="Client Tenants"
        description="Manage institutions, plans, renewals, and seat counts across the platform."
        actions={<Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}><Plus className="size-4" /> Add tenant</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total institutions" value={loading ? "—" : String(tenants.length)} icon={Building2} trend={{ value: "1 trial active", isPositive: true }} />
        <StatCard title="Active" value={loading ? "—" : String(tenants.filter(t => !t.status || t.status === "Active").length)} icon={Building2} trend={{ value: "Paying customers", isPositive: true }} />
        <StatCard title="Overdue / Suspended" value={loading ? "—" : String(tenants.filter(t => t.status === "Overdue" || t.status === "Suspended").length)} icon={Building2} trend={{ value: "Needs attention", isPositive: false }} />
        <StatCard title="Combined MRR" value={loading ? "—" : `₹${(totalMrr / 100000).toFixed(1)}L`} icon={Building2} trend={{ value: "+12.7% MoM", isPositive: true }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tenants…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>
        {[
          { value: planFilter, setter: setPlanFilter, options: ["All", "Starter", "Growth", "Enterprise"], label: "Plan" },
          { value: statusFilter, setter: setStatusFilter, options: ["All", "Active", "Overdue", "Suspended", "Trial"], label: "Status" },
          { value: typeFilter, setter: setTypeFilter, options: ["All", "University", "Bootcamp", "Corporate", "School"], label: "Type" },
        ].map(({ value, setter, options }) => (
          <select key={options[0]} value={value} onChange={e => { setter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        {(search || planFilter !== "All" || statusFilter !== "All" || typeFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPlanFilter("All"); setStatusFilter("All"); setTypeFilter("All"); setPage(1); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{filtered.length} tenant{filtered.length !== 1 ? "s" : ""}</span>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tenant</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plan</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Students</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">MRR</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Storage</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Renewal</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground"><Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />No tenants match your filters.</td></tr>
              ) : paginated.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[var(--gold-muted)] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-[var(--gold)]" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.adminEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{t.type}</td>
                  <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[t.plan]}`}>{t.plan}</span></td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{t.students.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold">₹{(t.mrr / 1000).toFixed(0)}K</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(t.storageUsed / t.storageLimit) > 0.8 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${(t.storageUsed / t.storageLimit) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{t.storageUsed}/{t.storageLimit}TB</span>
                    </div>
                  </td>
                  <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status]}`}>{t.status}</span></td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{t.renewalDate}</td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setManaging(t)}>Manage</Button>
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
