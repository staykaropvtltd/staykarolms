import { useState, useEffect, useRef } from "react";
import {
  Layers, Plus, X, Calendar, Users, Loader2, AlertCircle,
  UserPlus, Upload, Search, FileText, ChevronDown, UserMinus,
  BookOpen, Trash2, ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  getBatches, createBatch, getBatch, updateBatch,
  addStudentToBatch, removeStudentFromBatch, removeAllStudentsFromBatch, deleteBatchStudentAccounts, bulkAddStudentsToBatch,
  getBatchCourses, assignCourseToBatch, removeCourseFromBatch,
  getUsers, getCourses, deleteUser,
} from "@/shared/lib/api";
import { toast } from "sonner";

// All student sidebar items — mirrors the studentMenu in Sidebar.tsx
const STUDENT_MENU_ITEMS = [
  { path: "dashboard",      label: "Dashboard" },
  { path: "courses",        label: "Explore Courses" },
  { path: "my-courses",     label: "My Learning" },
  { path: "progress",       label: "My Progress" },
  { path: "assignments",    label: "Assignments" },
  { path: "code-editor",    label: "Coding Practice" },
  { path: "coding-test",    label: "Coding Test" },
  { path: "aptitude-test",  label: "Aptitude Test" },
  { path: "ai-interviewer", label: "AI Interview Prep" },
  { path: "certificates",   label: "Certificates" },
  { path: "calendar",       label: "Calendar" },
  { path: "messages",       label: "Messages" },
  { path: "notifications",  label: "Notifications" },
  { path: "settings",       label: "Settings" },
] as const;

interface ApiBatch {
  id: string;
  name: string;
  description?: string;
  mentor_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  profiles?: { name: string; email: string };
  student_permissions?: string[] | null;
}

interface BatchStudent {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

interface BatchDetail extends ApiBatch {
  batch_students: { profiles: BatchStudent }[];
}

interface InstitutionStudent {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseEmailsFromCSV(text: string): string[] {
  return [...new Set(
    text
      .split(/[\r\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  )];
}

function avatarInitial(name: string) {
  return (name || "S").charAt(0).toUpperCase();
}

// ── Create Batch Modal ────────────────────────────────────────────────────────

function CreateBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error("Batch name is required"); return; }
    setSaving(true);
    const { error } = await createBatch(form);
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Batch created!");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Create Batch</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Batch name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. Full Stack 2027" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Create Batch
            </Button>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────

function CSVImportModal({
  batchId,
  onClose,
  onImported,
}: { batchId: string; onClose: () => void; onImported: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setRawText(text);
      setEmails(parseEmailsFromCSV(text));
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setEmails(parseEmailsFromCSV(e.target.value));
  };

  const handleImport = async () => {
    if (emails.length === 0) { toast.error("No valid emails found"); return; }
    setImporting(true);
    const { data, error } = await bulkAddStudentsToBatch(batchId, emails);
    setImporting(false);
    if (error) { toast.error(error); return; }
    const result = data as { added: number; not_found: string[] };
    if (result.not_found?.length > 0) {
      toast.warning(`${result.added} students added. ${result.not_found.length} emails not found in your institution.`);
    } else {
      toast.success(`${result.added} students added to batch!`);
    }
    onImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Import Students via CSV</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* File upload */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-[var(--gold)] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-foreground font-medium">Click to upload CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">One email per line, or comma-separated</p>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 border-t border-border" />
            <span>or paste emails directly</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Paste area */}
          <textarea
            value={rawText}
            onChange={handleTextChange}
            rows={5}
            placeholder={"student1@example.com\nstudent2@example.com\nstudent3@example.com"}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none"
          />

          {/* Preview */}
          {emails.length > 0 && (
            <div className="rounded-lg bg-[var(--gold-muted)] border border-[var(--gold)]/30 p-3">
              <p className="text-sm font-medium text-foreground">
                <span className="text-[var(--gold)]">{emails.length}</span> valid email{emails.length !== 1 ? "s" : ""} detected
              </p>
              <div className="mt-1 max-h-24 overflow-y-auto">
                {emails.slice(0, 8).map(e => (
                  <p key={e} className="text-xs text-muted-foreground">{e}</p>
                ))}
                {emails.length > 8 && <p className="text-xs text-muted-foreground">+{emails.length - 8} more…</p>}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={handleImport} disabled={importing || emails.length === 0}>
              {importing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Add {emails.length > 0 ? `${emails.length} Students` : "Students"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Student Dropdown ──────────────────────────────────────────────────────

function AddStudentDropdown({
  batchId,
  enrolledIds,
  onAdded,
}: { batchId: string; enrolledIds: Set<string>; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<InstitutionStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (students.length === 0) {
      setLoading(true);
      const { data } = await getUsers("student");
      setStudents((data as InstitutionStudent[]) || []);
      setLoading(false);
    }
  };

  const available = students.filter(
    s => !enrolledIds.has(s.id) &&
      (s.name.toLowerCase().includes(query.toLowerCase()) || s.email.toLowerCase().includes(query.toLowerCase()))
  );

  const handleAdd = async (student: InstitutionStudent) => {
    setAdding(student.id);
    const { error } = await addStudentToBatch(batchId, student.id);
    setAdding(null);
    if (error) { toast.error(error); return; }
    toast.success(`${student.name} added to batch`);
    onAdded();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button size="sm" onClick={handleOpen} className="gap-1.5">
        <UserPlus className="w-4 h-4" />
        Add Student
        <ChevronDown className="w-3 h-3 opacity-60" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-xl shadow-xl">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background border border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {students.length === 0 ? "No students in institution" : "All students already added"}
              </p>
            ) : (
              available.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleAdd(s)}
                  disabled={adding === s.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[#1A1A1A] text-xs font-bold"
                    style={{ background: "var(--gold)" }}>
                    {avatarInitial(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </div>
                  {adding === s.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assign Course Dropdown ────────────────────────────────────────────────────

function AssignCourseDropdown({
  batchId,
  assignedCourseIds,
  onAssigned,
}: { batchId: string; assignedCourseIds: Set<string>; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (courses.length === 0) {
      setLoading(true);
      const { data } = await getCourses();
      setCourses((data as any[]) || []);
      setLoading(false);
    }
  };

  const available = courses.filter(
    c => !assignedCourseIds.has(c.id) &&
      c.title.toLowerCase().includes(query.toLowerCase())
  );

  const handleAssign = async (course: any) => {
    setAssigning(course.id);
    const { data, error } = await assignCourseToBatch(batchId, course.id);
    setAssigning(null);
    if (error) { toast.error(error); return; }
    const enrolled = (data as any)?.enrolled ?? 0;
    toast.success(`"${course.title}" assigned — ${enrolled} student${enrolled !== 1 ? "s" : ""} enrolled`);
    onAssigned();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button size="sm" onClick={handleOpen} className="gap-1.5">
        <BookOpen className="w-4 h-4" />
        Assign Course
        <ChevronDown className="w-3 h-3 opacity-60" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-xl shadow-xl">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background border border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search courses…"
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {courses.length === 0 ? "No courses in institution" : "All courses already assigned"}
              </p>
            ) : (
              available.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleAssign(c)}
                  disabled={assigning === c.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                    <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                    {c.profiles?.name && (
                      <p className="text-xs text-muted-foreground truncate">by {c.profiles.name}</p>
                    )}
                  </div>
                  {assigning === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batch Detail Modal ────────────────────────────────────────────────────────

function BatchDetailModal({
  batchId,
  onClose,
}: { batchId: string; onClose: () => void }) {
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showCSV, setShowCSV] = useState(false);
  const [activeTab, setActiveTab] = useState<"students" | "courses" | "access">("students");
  const [batchCourses, setBatchCourses] = useState<any[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [removingCourseId, setRemovingCourseId] = useState<string | null>(null);

  // Access control state: null = full access, Set = restricted to these paths
  const [accessMode, setAccessMode] = useState<"all" | "custom">("all");
  const [enabledPaths, setEnabledPaths] = useState<Set<string>>(
    new Set(STUDENT_MENU_ITEMS.map(i => i.path))
  );
  const [savingAccess, setSavingAccess] = useState(false);

  // Remove-all, delete-all-accounts, and delete-user confirmation state
  const [showRemoveAll, setShowRemoveAll] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);
  const [showDeleteAllAccounts, setShowDeleteAllAccounts] = useState(false);
  const [deletingAllAccounts, setDeletingAllAccounts] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<BatchStudent | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const fetchBatch = async () => {
    setLoading(true);
    const { data, error } = await getBatch(batchId);
    if (error) { toast.error(error); }
    else {
      const b = data as BatchDetail;
      setBatch(b);
      // Sync access control state from the loaded batch
      if (b.student_permissions === null || b.student_permissions === undefined) {
        setAccessMode("all");
        setEnabledPaths(new Set(STUDENT_MENU_ITEMS.map(i => i.path)));
      } else {
        setAccessMode("custom");
        setEnabledPaths(new Set(b.student_permissions));
      }
    }
    setLoading(false);
  };

  const fetchCourses = async () => {
    setCoursesLoading(true);
    const { data } = await getBatchCourses(batchId);
    setBatchCourses((data as any[]) || []);
    setCoursesLoading(false);
  };

  useEffect(() => { fetchBatch(); fetchCourses(); }, [batchId]);

  const students: BatchStudent[] = (batch?.batch_students || [])
    .map(bs => bs.profiles)
    .filter(Boolean);

  const enrolledIds = new Set(students.map(s => s.id));
  const assignedCourseIds = new Set(batchCourses.map((bc: any) => bc.course_id));

  const handleRemoveStudent = async (student: BatchStudent) => {
    setRemovingId(student.id);
    const { error } = await removeStudentFromBatch(batchId, student.id);
    setRemovingId(null);
    if (error) { toast.error(error); return; }
    toast.success(`${student.name} removed from batch`);
    fetchBatch();
  };

  const handleRemoveAll = async () => {
    setRemovingAll(true);
    const { error } = await removeAllStudentsFromBatch(batchId);
    setRemovingAll(false);
    if (error) { toast.error(error); return; }
    toast.success("All students removed from batch");
    setShowRemoveAll(false);
    fetchBatch();
  };

  const handleDeleteAllAccounts = async () => {
    setDeletingAllAccounts(true);
    const { data, error } = await deleteBatchStudentAccounts(batchId);
    setDeletingAllAccounts(false);
    if (error) { toast.error(error); return; }
    toast.success(`${(data as any)?.deleted ?? 0} student accounts permanently deleted`);
    setShowDeleteAllAccounts(false);
    fetchBatch();
  };

  const handleDeleteUser = async (student: BatchStudent) => {
    setDeletingUserId(student.id);
    const { error } = await deleteUser(student.id);
    setDeletingUserId(null);
    if (error) { toast.error(error); return; }
    toast.success(`${student.name}'s account deleted`);
    setConfirmDeleteUser(null);
    fetchBatch();
  };

  const handleRemoveCourse = async (bc: any) => {
    setRemovingCourseId(bc.course_id);
    const { error } = await removeCourseFromBatch(batchId, bc.course_id);
    setRemovingCourseId(null);
    if (error) { toast.error(error); return; }
    toast.success(`"${bc.courses?.title}" removed from batch`);
    fetchCourses();
  };

  const handleSaveAccess = async () => {
    const permissions = accessMode === "all" ? null : [...enabledPaths];
    setSavingAccess(true);
    const { error } = await updateBatch(batchId, { student_permissions: permissions });
    setSavingAccess(false);
    if (error) { toast.error(error); return; }
    toast.success("Student access updated");
    setBatch(prev => prev ? { ...prev, student_permissions: permissions } : prev);
  };

  const togglePath = (path: string) => {
    setEnabledPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
    setAccessMode("custom");
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">

          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-border shrink-0">
            <div>
              {loading ? (
                <div className="h-6 w-40 rounded bg-muted animate-pulse" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground">{batch?.name}</h2>
                  {batch?.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{batch.description}</p>
                  )}
                  {(batch?.start_date || batch?.end_date) && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {batch?.start_date ? new Date(batch.start_date).toLocaleDateString() : "—"}
                      {" – "}
                      {batch?.end_date ? new Date(batch.end_date).toLocaleDateString() : "—"}
                    </div>
                  )}
                </>
              )}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-3 border-b border-border bg-muted/20 shrink-0">
            <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
              <button
                onClick={() => setActiveTab("students")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "students" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Users className="w-3.5 h-3.5" /> Students ({students.length})
              </button>
              <button
                onClick={() => setActiveTab("courses")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "courses" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Courses ({batchCourses.length})
              </button>
              <button
                onClick={() => setActiveTab("access")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "access" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Student Access
              </button>
            </div>
          </div>

          {/* Tab action bar */}
          {(activeTab === "students" || activeTab === "courses") && (
            <div className="flex items-center justify-end gap-2 px-6 py-2 border-b border-border shrink-0">
              {activeTab === "students" && (
                <>
                  {students.length > 0 && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5 text-red-500 hover:text-red-600 hover:border-red-300" onClick={() => setShowRemoveAll(true)}>
                        <Trash2 className="w-3.5 h-3.5" /> Remove All
                      </Button>
                      <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowDeleteAllAccounts(true)}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete All Accounts
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCSV(true)}>
                    <FileText className="w-4 h-4" /> Import CSV
                  </Button>
                  {!loading && batch && (
                    <AddStudentDropdown batchId={batchId} enrolledIds={enrolledIds} onAdded={fetchBatch} />
                  )}
                </>
              )}
              {activeTab === "courses" && (
                <AssignCourseDropdown batchId={batchId} assignedCourseIds={assignedCourseIds} onAssigned={fetchCourses} />
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">

            {/* Students tab */}
            {activeTab === "students" && (
              loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-32 rounded bg-muted" />
                        <div className="h-3 w-48 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-base font-medium text-foreground">No students yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Use "Add Student" to enroll manually, or "Import CSV" to add in bulk.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {students.map(student => (
                    <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:bg-accent/20 transition-colors group">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[#1A1A1A] font-bold" style={{ background: "var(--gold)" }}>
                        {avatarInitial(student.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{student.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                        <button
                          onClick={() => handleRemoveStudent(student)}
                          disabled={removingId === student.id}
                          title="Remove from batch"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-orange-500 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                        >
                          {removingId === student.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                          Remove
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUser(student)}
                          title="Delete user account"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete User
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Courses tab */}
            {activeTab === "courses" && (
              coursesLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 animate-pulse">
                      <div className="w-10 h-10 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-40 rounded bg-muted" />
                        <div className="h-3 w-24 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : batchCourses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-base font-medium text-foreground">No courses assigned</p>
                  <p className="text-sm text-muted-foreground mt-1">Click "Assign Course" to add a course — all students in this batch will be enrolled automatically.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {batchCourses.map((bc: any) => (
                    <div key={bc.course_id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:bg-accent/20 transition-colors group">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                        <BookOpen className="w-5 h-5" style={{ color: "var(--gold)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{bc.courses?.title ?? "Unknown course"}</p>
                        {bc.courses?.profiles?.name && (
                          <p className="text-xs text-muted-foreground">by {bc.courses.profiles.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Assigned {new Date(bc.assigned_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveCourse(bc)}
                        disabled={removingCourseId === bc.course_id}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        {removingCourseId === bc.course_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Access tab */}
            {activeTab === "access" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Full access</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Students in this batch can see all sidebar items
                      </p>
                    </div>
                    <Switch
                      checked={accessMode === "all"}
                      onCheckedChange={checked => {
                        setAccessMode(checked ? "all" : "custom");
                        if (checked) setEnabledPaths(new Set(STUDENT_MENU_ITEMS.map(i => i.path)));
                      }}
                    />
                  </div>
                </div>

                {accessMode === "custom" && (
                  <div className="rounded-xl border border-border bg-background divide-y divide-border">
                    {STUDENT_MENU_ITEMS.map(item => (
                      <div key={item.path} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-foreground">{item.label}</span>
                        <Switch
                          checked={enabledPaths.has(item.path)}
                          onCheckedChange={() => togglePath(item.path)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {accessMode === "custom" && (
                    <p className="text-xs text-muted-foreground">
                      {enabledPaths.size} of {STUDENT_MENU_ITEMS.length} items enabled
                    </p>
                  )}
                  <Button
                    className="ml-auto"
                    onClick={handleSaveAccess}
                    disabled={savingAccess}
                  >
                    {savingAccess && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                    Save Access Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCSV && (
        <CSVImportModal batchId={batchId} onClose={() => setShowCSV(false)} onImported={fetchBatch} />
      )}

      {/* Remove all students confirmation */}
      {showRemoveAll && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Remove all students?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This will remove all <span className="font-semibold text-foreground">{students.length}</span> students from <span className="font-semibold text-foreground">{batch?.name}</span>. Their accounts will not be deleted — they will just no longer be in this batch.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRemoveAll(false)} disabled={removingAll}>Cancel</Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={handleRemoveAll} disabled={removingAll}>
                {removingAll && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                Remove All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL student accounts confirmation */}
      {showDeleteAllAccounts && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Permanently delete all accounts?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              This will <span className="font-semibold text-red-500">permanently delete</span> the accounts of all{" "}
              <span className="font-semibold text-foreground">{students.length}</span> students in{" "}
              <span className="font-semibold text-foreground">{batch?.name}</span>.
            </p>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 mb-5">
              <p className="text-xs text-red-600 font-medium">This cannot be undone. All data, progress, and test history will be lost.</p>
              {students.length > 100 && (
                <p className="text-xs text-muted-foreground mt-1">This may take up to a minute for {students.length} students.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteAllAccounts(false)} disabled={deletingAllAccounts}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAllAccounts} disabled={deletingAllAccounts}>
                {deletingAllAccounts && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                {deletingAllAccounts ? "Deleting…" : "Delete All Accounts"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user account confirmation */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete user account?</h3>
            <p className="text-sm text-muted-foreground mb-1">
              This will <span className="font-semibold text-red-500">permanently delete</span> the account for:
            </p>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 my-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#1A1A1A] font-bold shrink-0" style={{ background: "var(--gold)" }}>
                {avatarInitial(confirmDeleteUser.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{confirmDeleteUser.name}</p>
                <p className="text-xs text-muted-foreground truncate">{confirmDeleteUser.email}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-5">This cannot be undone. All their data, progress, and test attempts will be lost.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteUser(null)} disabled={!!deletingUserId}>Cancel</Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                disabled={!!deletingUserId}
              >
                {deletingUserId && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Active:    "bg-[var(--gold-muted)] text-[var(--gold)]",
  Upcoming:  "bg-blue-500/10 text-blue-500",
  Completed: "bg-muted text-muted-foreground",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BatchesPage() {
  const [batches, setBatches] = useState<ApiBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);

  const fetchBatches = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getBatches();
    if (err) setError(err);
    else setBatches((data as ApiBatch[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const filtered = tab === "All" ? batches : batches.filter(b => (b.status ?? "Active") === tab);
  const active = batches.filter(b => !b.status || b.status === "Active").length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3 min-h-[400px]">
      <AlertCircle className="w-10 h-10 text-red-500 opacity-60" />
      <p className="text-muted-foreground">{error}</p>
      <Button onClick={fetchBatches}>Retry</Button>
    </div>
  );

  return (
    <div className="p-8">
      {showCreate && (
        <CreateBatchModal onClose={() => setShowCreate(false)} onCreated={fetchBatches} />
      )}
      {openBatchId && (
        <BatchDetailModal batchId={openBatchId} onClose={() => setOpenBatchId(null)} />
      )}

      <PageHeader
        title="Batches & Cohorts"
        description="Group students, attach curricula, and track cohort-level progress."
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Create batch
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Total batches" value={String(batches.length)} icon={Layers}
          trend={{ value: `${active} active`, isPositive: true }} />
        <StatCard title="Active batches" value={String(active)} icon={Users}
          trend={{ value: "Currently running", isPositive: true }} />
        <StatCard title="Completed" value={String(batches.filter(b => b.status === "Completed").length)}
          icon={Layers} trend={{ value: "All time", isPositive: true }} />
      </div>

      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-lg w-fit">
        {["All", "Active", "Upcoming", "Completed"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            <span className="ml-1.5 text-xs opacity-60">
              {t === "All" ? batches.length : batches.filter(b => (b.status ?? "Active") === t).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
          {batches.length === 0 ? "No batches created yet." : "No batches in this category."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(b => (
            <div key={b.id} className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-lg truncate">{b.name}</h3>
                  {b.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{b.description}</p>}
                  {b.profiles && <p className="text-sm text-muted-foreground mt-0.5">Mentor: {b.profiles.name}</p>}
                </div>
                <span className={`ml-3 shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_COLORS[b.status ?? "Active"] ?? "bg-muted text-muted-foreground"}`}>
                  {b.status ?? "Active"}
                </span>
              </div>

              <div className="flex items-center justify-between mt-4">
                {(b.start_date || b.end_date) ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {b.start_date ? new Date(b.start_date).toLocaleDateString() : "—"}
                    {" – "}
                    {b.end_date ? new Date(b.end_date).toLocaleDateString() : "—"}
                  </div>
                ) : <div />}
                <Button size="sm" onClick={() => setOpenBatchId(b.id)}>
                  Open batch
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
