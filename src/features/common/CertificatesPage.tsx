import { useState, useEffect } from "react";
import { Award, Plus, Search, X, Loader2, AlertCircle } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getCertificates, bulkGenerateCertificates, getCourses, getBatches } from "@/shared/lib/api";
import { toast } from "sonner";

interface ApiCertificate {
  id: string;
  student_id: string;
  course_id: string;
  issued_at?: string;
  verification_code?: string;
  file_url?: string;
  profiles?: { name: string; email: string };
  courses?: { title: string };
}

interface CertificatesPageProps {
  userType: Extract<UserType, "student" | "admin">;
}

function BulkIssueModal({ onClose, onIssued }: { onClose: () => void; onIssued?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [form, setForm] = useState({
    course_id: "",
    batch_id: "",
    minCompletion: 80,
  });

  useEffect(() => {
    const loadData = async () => {
      const [coursesRes, batchesRes] = await Promise.all([getCourses(), getBatches()]);
      setCourses(coursesRes.data || []);
      setBatches(batchesRes.data || []);
    };
    loadData();
  }, []);

  const handleIssue = async () => {
    if (!form.course_id) {
      return toast.error("Select a course");
    }

    setLoading(true);
    try {
      const result = await bulkGenerateCertificates(form.course_id, form.batch_id || undefined);
      if (result.error) {
        toast.error(result.error);
      } else {
        const { issued, skipped } = (result.data as any) || {};
        toast.success(`${issued} certificate(s) issued${skipped ? `, ${skipped} skipped (already issued)` : ""}`);
        onClose();
        onIssued?.();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to issue certificates");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Bulk Issue Certificates</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" disabled={loading}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Course</label>
            <select 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={e => setForm({...form, course_id: e.target.value})}
              disabled={loading}
            >
              <option value="">Select a course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Batch (Optional)</label>
            <select 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.batch_id}
              onChange={e => setForm({...form, batch_id: e.target.value})}
              disabled={loading}
            >
              <option value="">All students</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Minimum completion %</label>
            <input 
              type="number" 
              min="0" 
              max="100" 
              value={form.minCompletion}
              onChange={e => setForm({...form, minCompletion: Number(e.target.value)})}
              disabled={loading}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
            />
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            This will issue certificates to all eligible students in the selected {form.batch_id ? "batch" : "course"}.
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <Button className="flex-1" onClick={handleIssue} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : ""} Issue
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function CertificatesPage({ userType }: CertificatesPageProps) {
  const isStudent = userType === "student";
  const [certs, setCerts] = useState<ApiCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const fetchCerts = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getCertificates();
    if (err) setError(err);
    else setCerts((data as ApiCertificate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCerts(); }, []);

  const filtered = certs.filter(c => {
    const student = c.profiles?.name ?? "";
    const course  = c.courses?.title ?? "";
    const code    = c.verification_code ?? "";
    const matchSearch = student.toLowerCase().includes(search.toLowerCase()) ||
      course.toLowerCase().includes(search.toLowerCase()) ||
      code.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const issued = certs.filter(c => c.issued_at).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3 min-h-[400px]">
      <AlertCircle className="w-10 h-10 text-red-500 opacity-60" />
      <p className="text-muted-foreground">{error}</p>
      <Button onClick={fetchCerts}>Retry</Button>
    </div>
  );

  return (
    <div className="p-8">
      {showModal && <BulkIssueModal onClose={() => setShowModal(false)} onIssued={fetchCerts} />}

      <PageHeader
        title="Certificates"
        description={isStudent ? "Download credentials you have earned." : "Issue, revoke, and audit completion certificates."}
        actions={
          !isStudent && (
            <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
              <Plus className="size-4" /> Bulk issue
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title={isStudent ? "Earned" : "Issued"} value={String(issued)} icon={Award} trend={{ value: "Verified certificates", isPositive: true }} />
        <StatCard title="Total" value={String(certs.length)} icon={Award} trend={{ value: "All certificates", isPositive: true }} />
        <StatCard title="With file" value={String(certs.filter(c => c.file_url).length)} icon={Award} trend={{ value: "Downloadable PDFs", isPositive: true }} />
      </div>

      {!isStudent && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by student, course or credential ID…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}
            ><X className="size-4 mr-1" /> Clear</Button>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border font-medium text-foreground text-sm">
          {isStudent ? "Your certificates" : `Issuance log · ${filtered.length} records`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-6 font-medium text-muted-foreground">{isStudent ? "Course" : "Student"}</th>
                {!isStudent && <th className="text-left py-3 px-4 font-medium text-muted-foreground">Course</th>}
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Issued</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Credential ID</th>
                <th className="text-right py-3 px-6 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isStudent ? 4 : 5} className="py-16 text-center text-muted-foreground">
                    <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {certs.length === 0 ? "No certificates issued yet." : "No certificates match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="py-3 px-6 font-medium text-foreground">{isStudent ? c.courses?.title : c.profiles?.name}</td>
                    {!isStudent && <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">{c.courses?.title}</td>}
                    <td className="py-3 px-4 text-muted-foreground">{c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "Pending"}</td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.verification_code ?? "—"}</td>
                    <td className="py-3 px-6 text-right">
                      <Button variant="ghost" size="sm" className="gap-1"
                        disabled={!c.verification_code}
                        onClick={() => window.open(`/certificates/${c.verification_code}/view`, "_blank")}>
                        <Award className="size-3.5" /> View / Download
                      </Button>
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
