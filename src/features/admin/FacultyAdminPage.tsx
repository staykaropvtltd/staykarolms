import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { GraduationCap, Mail, Plus, Search, Star, X, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getUsers, createUser, deleteUser } from "@/shared/lib/api";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Active:    "bg-[var(--gold-muted)] text-[var(--gold)]",
  "On leave": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

interface ApiFaculty {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  dept?: string;
  specialization?: string;
  courses?: number;
  students?: number;
  rating?: number;
  status?: string;
}

function AddFacultyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error("All fields required"); return; }
    setSaving(true);
    const { error } = await createUser({ name: form.name, email: form.email, password: form.password, role: "faculty" });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Faculty member added!");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Add Faculty Member</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Full name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Prof. Rajesh Kumar" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="faculty@college.edu" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Temporary password *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Min 8 characters" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Add Faculty</Button>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating}</span>
    </div>
  );
}

export function FacultyAdminPage() {
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<ApiFaculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFaculty = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getUsers("faculty");
    if (err) setError(err);
    else setFaculty((data as ApiFaculty[]) || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const { error: err } = await deleteUser(id);
    setDeleting(false);
    if (err) { toast.error(err); return; }
    toast.success("Faculty member removed");
    setDeleteConfirmId(null);
    fetchFaculty();
  };

  useEffect(() => { fetchFaculty(); }, []);

  const filtered = faculty.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3 min-h-[400px]">
      <AlertCircle className="w-10 h-10 text-red-500 opacity-60" />
      <p className="text-muted-foreground">{error}</p>
      <Button onClick={fetchFaculty}>Retry</Button>
    </div>
  );

  return (
    <div className="p-8">
      {showModal && <AddFacultyModal onClose={() => setShowModal(false)} onCreated={fetchFaculty} />}

      <PageHeader
        title="Faculty"
        description="Onboard instructors, assign departments, and balance teaching load."
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
            <Plus className="size-4" /> Add faculty
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Faculty members" value={String(faculty.length)} icon={GraduationCap} trend={{ value: "From your institution", isPositive: true }} />
        <StatCard title="Active" value={String(faculty.filter(f => !f.status || f.status === "Active").length)} icon={GraduationCap} trend={{ value: "Currently teaching", isPositive: true }} />
        <StatCard title="On leave" value={String(faculty.filter(f => f.status === "On leave").length)} icon={GraduationCap} trend={{ value: "Temporary absence", isPositive: false }} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}
          ><X className="size-4 mr-1" /> Clear</Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length} instructor{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-6 font-medium text-muted-foreground">Name</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-3 px-6 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-muted-foreground">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {faculty.length === 0 ? "No faculty members found." : "No faculty match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map(f => (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[var(--gold-muted)] flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[var(--gold)]">{f.name?.charAt(0) ?? "?"}</span>
                        </div>
                        <span className="font-medium text-foreground">{f.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{f.email}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[f.status ?? "Active"] ?? "bg-muted text-muted-foreground"}`}>
                        {f.status ?? "Active"}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/admin/messages")}>
                          <Mail className="size-3.5" /> Contact
                        </Button>
                        {deleteConfirmId === f.id ? (
                          <>
                            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(f.id)} disabled={deleting}>
                              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>Cancel</Button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(f.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
