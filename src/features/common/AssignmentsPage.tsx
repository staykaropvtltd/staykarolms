import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ClipboardList, FilePlus2, X, Search, Loader2, AlertCircle, Upload, CheckCircle2, FileUp } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getAssignments, createAssignment, submitAssignment, getCourses, getStudentSubmissions, uploadFile } from "@/shared/lib/api";
import { supabase } from "@/shared/lib/supabase";
import { useAuth } from "@/shared/context/AuthContext";
import { toast } from "sonner";
import { CodingWorkspace } from "@/shared/components/CodingWorkspace";

const FALLBACK_CODING_PROBLEM = {
  id: "p1",
  title: "Assignment Workspace",
  difficulty: "Medium" as const,
  topic: "General",
  acceptance: 100,
  points: 10,
  status: "Attempted" as const,
};

interface AssignmentsPageProps {
  userType: Extract<UserType, "student" | "faculty" | "admin">;
}

interface ApiAssignment {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  max_marks?: number;
  status?: string;
  courses?: { title: string };
  profiles?: { name: string };
  assignment_submissions?: { count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  "active":      "bg-[var(--gold-muted)] text-[var(--gold)]",
  "Due soon":    "bg-red-500/15 text-red-700 dark:text-red-400",
  "Submitted":   "bg-green-500/10 text-green-600 dark:text-green-400",
};

function SkeletonCard() {
  return (
    <div className="px-6 py-4 border-b border-border animate-pulse">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
        <div className="h-8 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

function CreateAssignmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", due_date: "", max_marks: 100, course_id: "" });
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    getCourses().then(({ data }) => {
      // Normalize course shape (enrolled vs direct)
      const raw = (data as any[]) || [];
      const normalized = raw.map((item: any) => item.courses ? item.courses : item);
      setCourses(normalized);
    });
  }, []);

  const toISOSafe = (s?: string) => {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const { error } = await createAssignment({
        title: form.title,
        description: form.description,
        course_id: form.course_id || undefined,
        due_date: toISOSafe(form.due_date),
        max_marks: form.max_marks,
      });
      if (error) toast.error(error);
      else {
        toast.success("Assignment created! Students will be notified.");
        onCreated();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create assignment");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">New Assignment</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Python — OOP Concepts"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Target Course <span className="text-muted-foreground">(optional — leave blank for all students)</span></label>
            <select
              value={form.course_id}
              onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Students (Institution-wide)</option>
              {courses.map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max score</label>
              <input
                type="number"
                value={form.max_marks}
                onChange={e => setForm(f => ({ ...f, max_marks: Number(e.target.value) }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="Assignment instructions…"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <Button className="flex-1" onClick={handleCreate} disabled={loading || !form.title.trim()}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Assignment
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}


// ── File import helpers ────────────────────────────────────────────────────────

interface ParsedAssignment {
  title: string;
  description?: string;
  due_date?: string;
  max_marks?: number;
  course_id?: string;
}

function parseAssignmentsFile(text: string, fileName: string): { assignments: ParsedAssignment[]; errors: string[] } {
  const assignments: ParsedAssignment[] = [];
  const errors: string[] = [];

  try {
    if (fileName.endsWith(".json")) {
      const raw = JSON.parse(text);
      const rows = Array.isArray(raw) ? raw : [raw];
      rows.forEach((row: any, i: number) => {
        if (!row.title) { errors.push(`Row ${i + 1}: missing "title"`); return; }
        assignments.push({
          title: String(row.title).trim(),
          description: row.description ? String(row.description).trim() : undefined,
          due_date: row.due_date ? String(row.due_date).trim() : undefined,
          max_marks: row.max_marks != null ? Number(row.max_marks) : undefined,
          course_id: row.course_id ? String(row.course_id).trim() : undefined,
        });
      });
    } else {
      // CSV
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) { errors.push("File is empty"); return { assignments, errors }; }

      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes("title") || firstLine.includes("description");
      const dataLines = hasHeader ? lines.slice(1) : lines;

      // Detect delimiter
      const delim = lines[0].includes("\t") ? "\t" : ",";

      dataLines.forEach((line, idx) => {
        const row = line.split(delim).map(c => c.trim().replace(/^"|"$/g, ""));
        const [title, description, due_date, max_marks_raw, course_id] = row;
        const rowNum = hasHeader ? idx + 2 : idx + 1;
        if (!title) { errors.push(`Row ${rowNum}: missing title`); return; }
        assignments.push({
          title,
          description: description || undefined,
          due_date: due_date || undefined,
          max_marks: max_marks_raw ? Number(max_marks_raw) : undefined,
          course_id: course_id || undefined,
        });
      });
    }
  } catch (e: any) {
    errors.push(`Parse error: ${e.message}`);
  }

  return { assignments, errors };
}

function ImportAssignmentsModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedAssignment[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    getCourses().then(({ data }) => {
      const raw = (data as any[]) || [];
      setCourses(raw.map((item: any) => item.courses ?? item));
    });
  }, []);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParsed([]);
    setParseErrors([]);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { assignments, errors } = parseAssignmentsFile(text, file.name);
      setParsed(assignments);
      setParseErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setImporting(true);
    setProgress({ done: 0, total: parsed.length });
    let succeeded = 0;
    for (let i = 0; i < parsed.length; i++) {
      const a = parsed[i];
      try {
        const { error } = await createAssignment({
          title: a.title,
          description: a.description,
          course_id: a.course_id || undefined,
          due_date: toISOSafe(a.due_date),
          max_marks: a.max_marks,
        });
        if (!error) succeeded++;
      } catch {
        // skip rows that fail, continue import
      }
      setProgress({ done: i + 1, total: parsed.length });
    }
    setImporting(false);
    toast.success(`Imported ${succeeded} of ${parsed.length} assignments`);
    onCreated();
    onClose();
  };

  const csvExample = `title,description,due_date,max_marks,course_id\nPython OOP,Implement a class hierarchy,2026-08-01,100,\nData Structures,Build a linked list,2026-08-15,50,`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Import Assignments from File</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-[var(--gold)] transition-colors"
          >
            <FileUp className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{fileName || "Click or drag a file here"}</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .csv, .tsv, .json</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.json,.txt" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>

          {/* CSV format hint */}
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">CSV format (header row optional):</p>
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{csvExample}</pre>
          </div>

          {/* Errors */}
          {parseErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">Parse warnings ({parseErrors.length})</p>
              {parseErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="bg-[var(--gold-muted)] border border-[var(--gold)]/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-[var(--gold)] mb-2">{parsed.length} assignment{parsed.length !== 1 ? "s" : ""} ready to import</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {parsed.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-[var(--gold)] shrink-0" />
                    <span className="text-xs text-foreground truncate">{a.title}</span>
                    {a.due_date && <span className="text-xs text-muted-foreground shrink-0">· {a.due_date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Importing…</span><span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[var(--gold)] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={handleImport} disabled={importing || !parsed.length}>
            {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : `Import ${parsed.length || ""} Assignments`}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function SubmitAssignmentModal({ assignmentId, onClose, onSubmitted }: { assignmentId: string; onClose: () => void; onSubmitted: () => void }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!file || !user) return;
    setUploading(true);

    try {
      // 1. Convert file to Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result as string;

        // 2. Upload to backend
        const { data: uploadData, error: uploadError } = await uploadFile(
          base64Data,
          file.name,
          `assignments/${assignmentId}/${user.id}`,
          "uploads"
        );

        if (uploadError) {
          toast.error(`Upload failed: ${uploadError}`);
          setUploading(false);
          return;
        }

        const fileUrl = (uploadData as any).url;

        // 3. Submit to API
        const { error } = await submitAssignment(assignmentId, fileUrl);
        
        if (error) {
          toast.error(error);
          setUploading(false);
        } else {
          setDone(true);
          toast.success("Assignment submitted successfully!");
          setTimeout(() => {
            onSubmitted();
            onClose();
          }, 1500);
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read file.");
        setUploading(false);
      };
    } catch (err: any) {
      toast.error("Unexpected error during upload.");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Submit Assignment</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-green-600">Submitted successfully!</p>
          </div>
        ) : (
          <>
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Click to upload your file"}
              </p>
              <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={handleSubmit} disabled={!file || uploading}>
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : "Submit"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AssignmentsPage({ userType }: AssignmentsPageProps) {
  const isStudent = userType === "student";
  const isFaculty = userType === "faculty";
  const navigate  = useNavigate();

  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [activeCodingAssignment, setActiveCodingAssignment] = useState<string | null>(null);

  const fetchAssignments = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: assignmentsData, error: err } = await getAssignments();
      if (err) throw new Error(err);

      let assignmentsList = (assignmentsData as ApiAssignment[]) || [];

      // If student, fetch their submissions and merge status
      if (isStudent) {
        const { data: subsData } = await getStudentSubmissions();
        const submissions = (subsData as any[]) || [];
        
        assignmentsList = assignmentsList.map(a => {
          const sub = submissions.find(s => s.assignment_id === a.id);
          if (sub) {
            a.status = sub.grade !== null ? "Graded" : "Submitted";
          }
          return a;
        });
      }
      
      setAssignments(assignmentsList);
    } catch (err: any) {
      setError(err.message || "Failed to fetch assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssignments(); }, []);

  const filtered = assignments.filter(a => {
    const matchSearch = a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.courses?.title ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const open   = assignments.filter(a => a.status !== "Graded").length;
  const graded = assignments.filter(a => a.status === "Graded").length;
  const total  = assignments.reduce((s, a) => s + (a.assignment_submissions?.[0]?.count ?? 0), 0);

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-red-500 opacity-60" />
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchAssignments}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      {showModal && <CreateAssignmentModal onClose={() => setShowModal(false)} onCreated={fetchAssignments} />}
      {showImport && <ImportAssignmentsModal onClose={() => setShowImport(false)} onCreated={fetchAssignments} />}
      {submittingId && (
        <SubmitAssignmentModal
          assignmentId={submittingId}
          onClose={() => setSubmittingId(null)}
          onSubmitted={fetchAssignments}
        />
      )}

      <PageHeader
        title="Assignments"
        description={
          isStudent
            ? "Track deadlines, submit work, and view feedback in one place."
            : isFaculty
            ? "Create tasks, monitor submissions, and grade efficiently."
            : "Oversee assignment load and compliance across departments."
        }
        actions={
          <>
            {!isStudent && (
              <>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
                  <FileUp className="size-4" /> Import from file
                </Button>
                <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
                  <FilePlus2 className="size-4" /> New assignment
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Open" value={loading ? "—" : String(open)} icon={ClipboardList} trend={{ value: "Active assignments", isPositive: true }} />
        <StatCard title="Total submissions" value={loading ? "—" : total.toLocaleString()} icon={ClipboardList} trend={{ value: "Live from Supabase", isPositive: true }} />
        <StatCard title="Graded" value={loading ? "—" : String(graded)} icon={ClipboardList} trend={{ value: "Completed", isPositive: true }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assignments…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "active", "Graded"].map(s => <option key={s}>{s}</option>)}
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
            {loading ? "Loading…" : `${filtered.length} assignment${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            {assignments.length === 0 ? "No assignments yet." : "No assignments match your filters."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(a => (
              <div key={a.id} className="px-6 py-4 hover:bg-accent/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{a.title}</p>
                      {a.status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-muted text-muted-foreground"}`}>
                          {a.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{a.courses?.title ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.due_date ? `Due: ${new Date(a.due_date).toLocaleDateString()}` : "No due date"}{" "}
                      {a.max_marks ? `· Max score: ${a.max_marks}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isStudent ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setSubmittingId(a.id)}>
                          <Upload className="w-4 h-4 mr-1" /> Upload
                        </Button>
                        <Button size="sm" onClick={() => setActiveCodingAssignment(a.id)}>Open</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => navigate("/faculty/assignment-review")}>
                          Grade ({a.assignment_submissions?.[0]?.count ?? 0})
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate("/faculty/assignment-review")}>Review</Button>
                      </>
                    )}
                  </div>
                </div>

                {!isStudent && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Submissions: {a.assignment_submissions?.[0]?.count ?? 0}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full max-w-xs">
                      <div className="h-full rounded-full bg-primary" style={{ width: "30%" }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeCodingAssignment && (
        <CodingWorkspace
          problem={FALLBACK_CODING_PROBLEM}
          mode="assignment"
          onClose={() => setActiveCodingAssignment(null)}
          hideTopBarStats={true}
          leftTabs={[{
            id: "instructions",
            label: "Instructions",
            content: (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Assignment Instructions</h2>
                <p className="text-sm text-foreground">Complete the required functions as per the assignment requirements.</p>
              </div>
            )
          }]}
        />
      )}
    </div>
  );
}
