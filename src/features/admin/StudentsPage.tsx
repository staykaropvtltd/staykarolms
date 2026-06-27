import { useState, useEffect, useRef } from "react";
import {
  Users, UserPlus, Search, X, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Upload, FileText, Trash2, Pencil,
  CheckCircle, Key, Calendar, Layers, ChevronDown,
} from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import {
  getUsers, getUser, createUser, updateUser, deleteUser, bulkCreateStudents,
} from "@/shared/lib/api";
import { toast } from "sonner";

interface StudentsPageProps {
  userType: Extract<UserType, "admin" | "faculty">;
}

interface ApiStudent {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  status?: string;
  phone?: string;
  created_at?: string;
}

interface BatchEntry {
  batch_id: string;
  batches: { id: string; name: string; status?: string; start_date?: string; end_date?: string };
}

interface StudentDetail extends ApiStudent {
  batch_students: BatchEntry[];
}

interface CSVRow { name: string; email: string }

// ── helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

const STATUS_COLORS: Record<string, string> = {
  Active:    "bg-[var(--gold-muted)] text-[var(--gold)]",
  "At risk": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Inactive:  "bg-muted text-muted-foreground",
};

function initial(name: string) {
  return (name || "?").charAt(0).toUpperCase();
}

function parseStudentsCSV(text: string): { rows: CSVRow[]; errors: string[] } {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const rows: CSVRow[] = [];
  const errors: string[] = [];

  let start = 0;
  if (lines[0] && /name|email/i.test(lines[0])) start = 1;

  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
    const name = parts[0];
    const email = (parts[1] || "").toLowerCase();
    if (!name || !email) { errors.push(`Row ${i + 1}: missing name or email`); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Row ${i + 1}: invalid email "${email}"`); continue; }
    rows.push({ name, email });
  }
  return { rows, errors };
}

// ── Add Student Modal ─────────────────────────────────────────────────────────

function AddStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.email || !form.password) {
      toast.error("First name, email and password are required.");
      return;
    }
    setSaving(true);
    const { error } = await createUser({
      name: `${form.firstName} ${form.lastName}`.trim(),
      email: form.email,
      password: form.password,
      role: "student",
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Student created successfully!");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Add Student</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">First name *</label>
              <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Aditya" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Last name</label>
              <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Singh" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="student@college.edu" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Password *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Min 8 characters" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Add Student
            </Button>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────

function CSVImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: CSVRow[]; errors: string[] }>({ rows: [], errors: [] });
  const [password, setPassword] = useState("Welcome@123");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { email: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleText = (text: string) => {
    setRawText(text);
    setParsed(parseStudentsCSV(text));
    setResult(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleText(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsed.rows.length === 0) { toast.error("No valid rows to import"); return; }
    if (!password || password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setImporting(true);
    const { data, error } = await bulkCreateStudents(parsed.rows, password);
    setImporting(false);
    if (error) { toast.error(error); return; }
    const res = data as { created: { id: string }[]; failed: { email: string; reason: string }[] };
    setResult({ created: res.created.length, failed: res.failed });
    if (res.created.length > 0) {
      toast.success(`${res.created.length} student${res.created.length !== 1 ? "s" : ""} created!`);
      onImported();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Import Students via CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Upload zone */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-[var(--gold)] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Click to upload CSV</p>
            <p className="text-xs text-muted-foreground mt-0.5">Format: <code className="bg-muted px-1 rounded">name, email</code> — one row per student</p>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 border-t border-border" /><span>or paste rows</span><div className="flex-1 border-t border-border" />
          </div>

          <textarea
            value={rawText}
            onChange={e => handleText(e.target.value)}
            rows={5}
            placeholder={"name,email\nAditya Singh,aditya@college.edu\nPriya Sharma,priya@college.edu"}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none"
          />

          {/* Default password */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Default password for all students</label>
            <div className="flex items-center gap-2 mt-1">
              <Key className="w-4 h-4 text-muted-foreground shrink-0" />
              <input value={password} onChange={e => setPassword(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Welcome@123" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Students should change this on first login.</p>
          </div>

          {/* Parse preview */}
          {(parsed.rows.length > 0 || parsed.errors.length > 0) && !result && (
            <div className="rounded-lg border border-border overflow-hidden text-sm">
              {parsed.rows.length > 0 && (
                <div className="p-3 bg-[var(--gold-muted)]">
                  <p className="font-medium text-foreground">
                    <CheckCircle className="inline w-4 h-4 text-[var(--gold)] mr-1" />
                    {parsed.rows.length} valid row{parsed.rows.length !== 1 ? "s" : ""} ready to import
                  </p>
                  <div className="mt-1 max-h-20 overflow-y-auto">
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{r.name} — {r.email}</p>
                    ))}
                    {parsed.rows.length > 5 && <p className="text-xs text-muted-foreground">+{parsed.rows.length - 5} more…</p>}
                  </div>
                </div>
              )}
              {parsed.errors.length > 0 && (
                <div className="p-3 bg-red-500/5 border-t border-border">
                  <p className="font-medium text-red-500 text-xs">{parsed.errors.length} row{parsed.errors.length !== 1 ? "s" : ""} skipped</p>
                  {parsed.errors.slice(0, 3).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
                </div>
              )}
            </div>
          )}

          {/* Import result */}
          {result && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                <CheckCircle className="inline w-4 h-4 text-[var(--gold)] mr-1" />
                {result.created} student{result.created !== 1 ? "s" : ""} created
              </p>
              {result.failed.length > 0 && (
                <div>
                  <p className="text-xs text-red-500 font-medium">{result.failed.length} failed:</p>
                  {result.failed.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{f.email}: {f.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          {!result ? (
            <>
              <Button className="flex-1" onClick={handleImport}
                disabled={importing || parsed.rows.length === 0}>
                {importing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Import {parsed.rows.length > 0 ? `${parsed.rows.length} Students` : "Students"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </>
          ) : (
            <Button className="flex-1" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Student Detail Modal ──────────────────────────────────────────────────────

function StudentDetailModal({
  studentId,
  onClose,
  onUpdated,
  canDelete = true,
}: { studentId: string; onClose: () => void; onUpdated: () => void; canDelete?: boolean }) {
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchStudent = async () => {
    setLoading(true);
    const { data, error } = await getUser(studentId);
    if (error) { toast.error(error); onClose(); return; }
    setStudent(data as StudentDetail);
    setEditName((data as StudentDetail).name);
    setLoading(false);
  };

  useEffect(() => { fetchStudent(); }, [studentId]);

  const handleSaveName = async () => {
    if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
    setSaving(true);
    const { error } = await updateUser(studentId, { name: editName.trim() });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Name updated");
    setEditing(false);
    fetchStudent();
    onUpdated();
  };

  const handleStatusChange = async (status: string) => {
    setStatusOpen(false);
    const { error } = await updateUser(studentId, { status });
    if (error) { toast.error(error); return; }
    toast.success(`Status changed to ${status}`);
    fetchStudent();
    onUpdated();
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await deleteUser(studentId);
    setDeleting(false);
    if (error) { toast.error(error); return; }
    toast.success("Student removed");
    onUpdated();
    onClose();
  };

  const batches = student?.batch_students?.map(bs => bs.batches).filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">Student Profile</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-5 w-36 rounded bg-muted" />
                  <div className="h-4 w-48 rounded bg-muted" />
                </div>
              </div>
              <div className="h-24 rounded bg-muted" />
            </div>
          ) : student ? (
            <div className="space-y-5">
              {/* Avatar + name + status */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-bold text-[#1A1A1A]"
                  style={{ background: "var(--gold)" }}>
                  {initial(student.name)}
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditing(false); }}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-base font-bold"
                      />
                      <Button size="sm" onClick={handleSaveName} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditName(student.name); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-foreground truncate">{student.name}</h3>
                      <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground truncate">{student.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {/* Status badge + change dropdown */}
                    <div ref={statusRef} className="relative">
                      <button
                        onClick={() => setStatusOpen(o => !o)}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[student.status ?? "Active"] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {student.status ?? "Active"}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {statusOpen && (
                        <div className="absolute left-0 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-lg overflow-hidden w-32">
                          {["Active", "At risk", "Inactive"].map(s => (
                            <button key={s} onClick={() => handleStatusChange(s)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Joined</p>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {student.created_at ? new Date(student.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </p>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Batches enrolled</p>
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{batches.length}</p>
                  </div>
                </div>
              </div>

              {/* Batches */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Batches</h4>
                {batches.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <Layers className="w-6 h-6 mx-auto mb-1 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">Not assigned to any batch yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {batches.map(b => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.name}</p>
                          {(b.start_date || b.end_date) && (
                            <p className="text-xs text-muted-foreground">
                              {b.start_date ? new Date(b.start_date).toLocaleDateString() : "—"} – {b.end_date ? new Date(b.end_date).toLocaleDateString() : "ongoing"}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status ?? "Active"] ?? "bg-muted text-muted-foreground"}`}>
                          {b.status ?? "Active"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger zone — admin only */}
              {canDelete && (
                <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/5">
                  <h4 className="text-sm font-semibold text-red-500 mb-1">Danger Zone</h4>
                  <p className="text-xs text-muted-foreground mb-3">Permanently removes this student from the platform. This cannot be undone.</p>
                  {!confirmDelete ? (
                    <Button variant="outline" size="sm" className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                      onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove Student
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-red-500 font-medium">Are you sure?</p>
                      <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Yes, remove
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StudentsPage({ userType }: StudentsPageProps) {
  const isAdmin = userType === "admin";
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getUsers("student");
    if (err) setError(err);
    else setStudents((data as ApiStudent[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchStudents(); }, []);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.id.includes(q);
    const matchStatus = statusFilter === "All" || (s.status ?? "Active") === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = {
    total: students.length,
    active: students.filter(s => !s.status || s.status === "Active").length,
    atRisk: students.filter(s => s.status === "At risk").length,
    inactive: students.filter(s => s.status === "Inactive").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3 min-h-[400px]">
      <AlertCircle className="w-10 h-10 text-red-500 opacity-60" />
      <p className="text-muted-foreground">{error}</p>
      <Button onClick={fetchStudents}>Retry</Button>
    </div>
  );

  return (
    <div className="p-8">
      {showAdd && <AddStudentModal onClose={() => setShowAdd(false)} onCreated={fetchStudents} />}
      {showCSV && <CSVImportModal onClose={() => setShowCSV(false)} onImported={fetchStudents} />}
      {selectedId && (
        <StudentDetailModal
          studentId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchStudents}
          canDelete={true}
        />
      )}

      <PageHeader
        title="Students"
        description={isAdmin ? "Manage all learners enrolled in your institution." : "Rosters for the courses you instruct."}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowCSV(true)}>
                <FileText className="size-4" /> Import CSV
              </Button>
            )}
            <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
              <UserPlus className="size-4" /> Add Student
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total" value={String(stats.total)} icon={Users} trend={{ value: "All students", isPositive: true }} />
        <StatCard title="Active" value={String(stats.active)} icon={Users} trend={{ value: "On platform", isPositive: true }} />
        <StatCard title="At Risk" value={String(stats.atRisk)} icon={Users} trend={{ value: "Needs attention", isPositive: false }} />
        <StatCard title="Inactive" value={String(stats.inactive)} icon={Users} trend={{ value: "Not active", isPositive: false }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-md border border-border bg-background"
        >
          {["All", "Active", "At risk", "Inactive"].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("All"); setPage(1); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{filtered.length} student{filtered.length !== 1 ? "s" : ""}</span>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages || 1}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-6 font-medium text-muted-foreground">Student</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Joined</th>
                <th className="text-right py-3 px-6 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {students.length === 0
                      ? "No students yet. Add one or import via CSV."
                      : "No students match your filters."}
                  </td>
                </tr>
              ) : (
                paginated.map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors group">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-[#1A1A1A]"
                          style={{ background: "var(--gold)" }}>
                          {initial(s.name)}
                        </div>
                        <span className="font-medium text-foreground">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{s.email}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status ?? "Active"] ?? "bg-muted text-muted-foreground"}`}>
                        {s.status ?? "Active"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setSelectedId(s.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 rounded text-sm ${page === i + 1 ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}>
                  {i + 1}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
