import { useState, useEffect } from "react";
import { Users, Search, X, ChevronLeft, ChevronRight, UserX, Mail, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getUsers, getInstitutions } from "@/shared/lib/api";

export type GlobalUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "faculty" | "student" | "super-admin";
  tenant: string;
  status: "Active" | "Inactive" | "Suspended";
  avatar: string;
  joinDate: string;
  lastLogin: string;
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-[var(--gold-muted)] text-[var(--gold)]",
  "super-admin": "bg-[var(--gold-muted)] text-[var(--gold)]",
  faculty: "bg-muted text-muted-foreground",
  student: "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Inactive: "bg-muted text-muted-foreground",
  Suspended: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const PAGE_SIZE = 7;

export function GlobalUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [tenantFilter, setTenantFilter] = useState("All");
  const [page, setPage] = useState(1);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await getUsers();
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const tenantNames = ["All", ...Array.from(new Set(users.map(u => u.institutions?.name || "StayKaro")))];

  const mappedUsers: GlobalUser[] = users.map(u => {
    const avatarInitials = u.name ? u.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "U";
    return {
      id: u.id,
      name: u.name || "Unknown User",
      email: u.email || "",
      role: u.role || "student",
      tenant: u.institutions?.name || "StayKaro",
      status: "Active",
      avatar: avatarInitials,
      joinDate: u.created_at ? new Date(u.created_at).toLocaleDateString() : "—",
      lastLogin: "Just now",
    };
  });

  const filtered = mappedUsers.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "All" || u.role === roleFilter;
    const matchStatus = statusFilter === "All" || u.status === statusFilter;
    const matchTenant = tenantFilter === "All" || u.tenant === tenantFilter;
    return matchSearch && matchRole && matchStatus && matchTenant;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalStudents = mappedUsers.filter(u => u.role === "student").length;
  const totalFaculty = mappedUsers.filter(u => u.role === "faculty").length;

  return (
    <div className="p-8">
      <PageHeader
        title="Global Users"
        description="Cross-tenant user management — search, filter, and act on any user across the platform."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total users" value={loading ? "—" : mappedUsers.length.toLocaleString()} icon={Users} trend={{ value: "All roles combined", isPositive: true }} />
        <StatCard title="Students" value={loading ? "—" : totalStudents.toLocaleString()} icon={Users} trend={{ value: "Across all tenants", isPositive: true }} />
        <StatCard title="Faculty" value={loading ? "—" : totalFaculty.toLocaleString()} icon={Users} trend={{ value: "Across all tenants", isPositive: true }} />
        <StatCard title="Suspended" value={loading ? "—" : String(mappedUsers.filter(u => u.status === "Suspended").length)} icon={UserX} trend={{ value: "Active monitoring", isPositive: true }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or email…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "admin", "super-admin", "faculty", "student"].map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "Active", "Inactive", "Suspended"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={tenantFilter} onChange={e => { setTenantFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {tenantNames.map(t => <option key={t}>{t}</option>)}
        </select>
        {(search || roleFilter !== "All" || statusFilter !== "All" || tenantFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRoleFilter("All"); setStatusFilter("All"); setTenantFilter("All"); setPage(1); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{loading ? "Loading…" : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}</span>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading users…</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tenant</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Joined</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last login</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />No users match your filters.
                  </td></tr>
                ) : paginated.map(u => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                          <span className="text-xs font-bold" style={{ color: "var(--gold)" }}>{u.avatar}</span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>{u.role}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{u.tenant}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status]}`}>{u.status}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{u.joinDate}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{u.lastLogin}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="gap-1"><Mail className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="gap-1 text-red-600 hover:text-red-700"><UserX className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
