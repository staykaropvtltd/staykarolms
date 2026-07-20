import { useState, useEffect, useRef } from "react";
import {
  Users, UserPlus, Search, X, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Upload, Trash2, Pencil,
  CheckCircle, Key, Calendar, Layers, ChevronDown,
  Download, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import {
  getUsers, getUser, createUser, updateUser, deleteUser, getBatches, importNominalRoll,
  getUnbatchedStudents, deleteUnbatchedStudents,
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

// ── Nominal Roll CSV Parser ───────────────────────────────────────────────────

interface NominalRow {
  rollNo:  string;
  name:    string;
  section: string;
  branch:  string;
}

interface ParseResult {
  rows:       NominalRow[];
  errors:     string[];
  headers:    string[];
  colIndices: { rollNo: number; name: number; section: number; branch: number };
  detected:   boolean;
}

// Flexible regex patterns for JNTUH and other nominal roll formats
const COL_PATTERNS = {
  rollNo:  [/roll\s*[\.\-]?\s*no/i, /roll\s*number/i, /jntuh/i, /regd?\s*[\.\-]?\s*no/i, /enrollment\s*no/i, /hall\s*ticket/i, /\bhtno\b/i, /\broll\b/i],
  name:    [/candidate\s*name/i, /student\s*name/i, /full\s*name/i, /\bname\b/i],
  section: [/section/i, /\bsec\b/i, /division/i],
  branch:  [/branch/i, /\bdept\b/i, /department/i, /stream/i, /specialization/i, /programme?/i],
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectColIndices(headers: string[]) {
  const find = (patterns: RegExp[]) =>
    headers.findIndex(h => patterns.some(p => p.test(h.trim())));
  return {
    rollNo:  find(COL_PATTERNS.rollNo),
    name:    find(COL_PATTERNS.name),
    section: find(COL_PATTERNS.section),
    branch:  find(COL_PATTERNS.branch),
  };
}

function parseNominalRollCSV(text: string): ParseResult {
  // Strip BOM, normalise line endings
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const allLines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);

  if (allLines.length === 0) {
    return { rows: [], errors: ["File is empty"], headers: [], colIndices: { rollNo: -1, name: -1, section: -1, branch: -1 }, detected: false };
  }

  // Scan up to the first 6 lines to find a header row that has both roll & name columns
  let headerLineIdx = -1;
  let colIndices = { rollNo: -1, name: -1, section: -1, branch: -1 };
  let headers: string[] = [];

  for (let i = 0; i < Math.min(allLines.length, 6); i++) {
    const parts = parseCSVLine(allLines[i]);
    const detected = detectColIndices(parts);
    if (detected.rollNo !== -1 && detected.name !== -1) {
      headerLineIdx = i;
      colIndices    = detected;
      headers       = parts;
      break;
    }
  }

  if (headerLineIdx === -1) {
    return {
      rows: [],
      errors: [
        "Could not detect column headers. Ensure your CSV contains columns named 'Roll No' (or 'JNTUH Roll No', 'Regd No') and 'Name' (or 'Student Name', 'Candidate Name').",
        `First row found: ${parseCSVLine(allLines[0]).join(" | ")}`,
      ],
      headers: parseCSVLine(allLines[0]),
      colIndices,
      detected: false,
    };
  }

  const rows: NominalRow[] = [];
  const errors: string[]   = [];

  for (let i = headerLineIdx + 1; i < allLines.length; i++) {
    const parts = parseCSVLine(allLines[i]);
    if (parts.every(p => !p)) continue;

    const rollNo  = (parts[colIndices.rollNo]  ?? "").trim().toUpperCase();
    const name    = (parts[colIndices.name]    ?? "").trim();
    const section = colIndices.section >= 0 ? (parts[colIndices.section] ?? "").trim() : "";
    const branch  = colIndices.branch  >= 0 ? (parts[colIndices.branch]  ?? "").trim() : "";

    if (!rollNo && !name) continue; // blank data row between sections

    if (!rollNo) {
      errors.push(`Row ${i + 1}: "${name}" — missing roll number`);
      continue;
    }
    if (!name) {
      errors.push(`Row ${i + 1}: roll ${rollNo} — missing student name`);
      continue;
    }

    rows.push({ rollNo, name, section, branch });
  }

  return { rows, errors, headers, colIndices, detected: true };
}

function generateEmail(rollNo: string, domain: string): string {
  return `${rollNo.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${domain}`;
}

// Turns failures array into a downloadable CSV
function downloadFailuresCSV(failures: { roll_no: string; email?: string; reason: string }[]) {
  const header = "Roll No,Email,Reason\n";
  const rows   = failures.map(f =>
    `"${f.roll_no}","${f.email ?? ""}","${f.reason.replace(/"/g, "'")}"`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "import-failures.csv"; a.click();
  URL.revokeObjectURL(url);
}

interface ImportSummary {
  total:           number;
  created:         number;
  already_existed: number;
  failed:          number;
  batch_assigned:  number;
  failures:        { roll_no: string; email?: string; reason: string }[];
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

// ── Nominal Roll Import Modal ─────────────────────────────────────────────────

const CHUNK_SIZE = 300; // students per API call — safe within Vercel's 60 s limit

function NominalRollImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  type Step = "setup" | "importing" | "done";

  const [step,          setStep]          = useState<Step>("setup");
  const [parseResult,   setParseResult]   = useState<ParseResult | null>(null);
  const [emailDomain,   setEmailDomain]   = useState("cmrtc.edu.in");
  const [passwordMode,  setPasswordMode]  = useState<"roll_no" | "custom">("roll_no");
  const [customPass,    setCustomPass]    = useState("");
  const [batchId,       setBatchId]       = useState("");
  const [batches,       setBatches]       = useState<{ id: string; name: string }[]>([]);
  const [progress,      setProgress]      = useState({ done: 0, total: 0, batchNum: 0, totalBatches: 0 });
  const [summary,       setSummary]       = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBatches().then(({ data }) => {
      if (data) setBatches((data as { id: string; name: string; status?: string }[]).filter(b => b.name));
    });
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Only .csv files are supported. Convert your Excel file to CSV first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const result = parseNominalRollCSV(ev.target?.result as string);
      setParseResult(result);
      if (!result.detected) toast.error(result.errors[0] ?? "Column detection failed");
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected after changes
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const fakeEvent = { target: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFile(fakeEvent);
    }
  };

  const validRows  = parseResult?.rows ?? [];
  const parseErrors = parseResult?.errors ?? [];
  const canImport  = validRows.length > 0 && parseResult?.detected &&
                     emailDomain.trim() &&
                     (passwordMode === "roll_no" || customPass.length >= 6);

  const handleImport = async () => {
    if (!canImport) return;

    const totalBatches = Math.ceil(validRows.length / CHUNK_SIZE);
    setProgress({ done: 0, total: validRows.length, batchNum: 0, totalBatches });
    setStep("importing");

    const accumulated: ImportSummary = {
      total: validRows.length, created: 0, already_existed: 0,
      failed: 0, batch_assigned: 0, failures: [],
    };

    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
      const chunk = validRows.slice(bIdx * CHUNK_SIZE, (bIdx + 1) * CHUNK_SIZE);
      setProgress(p => ({ ...p, batchNum: bIdx + 1 }));

      const { data, error } = await importNominalRoll({
        students: chunk.map(r => ({
          roll_no: r.rollNo,
          name:    r.name,
          section: r.section || undefined,
          branch:  r.branch  || undefined,
        })),
        email_domain:     emailDomain.trim(),
        password_mode:    passwordMode,
        default_password: passwordMode === "custom" ? customPass : undefined,
        batch_id:         batchId || undefined,
      });

      if (error) {
        toast.error(`Batch ${bIdx + 1} failed: ${error}`);
        // Record entire chunk as failed but continue with remaining batches
        accumulated.failed   += chunk.length;
        accumulated.failures.push(...chunk.map(r => ({ roll_no: r.rollNo, reason: error })));
      } else if (data) {
        accumulated.created         += data.created;
        accumulated.already_existed += data.already_existed;
        accumulated.failed          += data.failed;
        accumulated.batch_assigned  += data.batch_assigned;
        accumulated.failures.push(...data.failures);
      }

      setProgress(p => ({ ...p, done: Math.min(p.done + chunk.length, p.total) }));
    }

    setSummary(accumulated);
    setStep("done");

    if (accumulated.created > 0) {
      toast.success(`${accumulated.created} student${accumulated.created !== 1 ? "s" : ""} created successfully!`);
      onImported();
    }
  };

  const previewRows = validRows.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[var(--gold)]" />
            <h2 className="text-lg font-semibold text-foreground">Import Nominal Roll</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── SETUP ── */}
          {step === "setup" && (
            <div className="p-5 space-y-5">

              {/* Upload zone */}
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-[var(--gold)] transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {parseResult?.detected ? "File loaded — click to replace" : "Click or drag your CSV here"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CSV only · Columns needed: <strong>Roll No</strong> and <strong>Name</strong>
                  {" "}(Section and Branch are optional)
                </p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </div>

              {/* Column detection result */}
              {parseResult && (
                <div className={`rounded-lg border p-3 text-sm ${parseResult.detected ? "border-[var(--gold)]/30 bg-[var(--gold-muted)]" : "border-red-500/30 bg-red-500/5"}`}>
                  {parseResult.detected ? (
                    <>
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-[var(--gold)]" />
                        {validRows.length} student{validRows.length !== 1 ? "s" : ""} detected
                        {parseErrors.length > 0 && <span className="text-amber-500 ml-1">· {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} skipped</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Columns mapped — Roll No · Name
                        {parseResult.colIndices.section >= 0 ? " · Section" : ""}
                        {parseResult.colIndices.branch  >= 0 ? " · Branch"  : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-red-500 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Column detection failed
                      </p>
                      {parseErrors.map((e, i) => <p key={i} className="text-xs text-muted-foreground mt-0.5">{e}</p>)}
                    </>
                  )}
                  {parseErrors.length > 0 && parseResult.detected && (
                    <div className="mt-2 max-h-16 overflow-y-auto">
                      {parseErrors.slice(0, 4).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
                      {parseErrors.length > 4 && <p className="text-xs text-muted-foreground">+{parseErrors.length - 4} more…</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Preview table */}
              {parseResult?.detected && previewRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border">
                    <p className="text-xs font-medium text-muted-foreground">Preview (first {previewRows.length} rows)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Roll No</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Email (generated)</th>
                          {previewRows.some(r => r.section) && <th className="text-left px-3 py-2 text-muted-foreground font-medium">Section</th>}
                          {previewRows.some(r => r.branch)  && <th className="text-left px-3 py-2 text-muted-foreground font-medium">Branch</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/20">
                            <td className="px-3 py-2 font-mono text-foreground">{r.rollNo}</td>
                            <td className="px-3 py-2 text-foreground">{r.name}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{generateEmail(r.rollNo, emailDomain || "domain.edu")}</td>
                            {previewRows.some(r2 => r2.section) && <td className="px-3 py-2 text-muted-foreground">{r.section || "—"}</td>}
                            {previewRows.some(r2 => r2.branch)  && <td className="px-3 py-2 text-muted-foreground">{r.branch  || "—"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {validRows.length > previewRows.length && (
                      <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                        +{validRows.length - previewRows.length} more rows not shown
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email domain */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email domain *</label>
                  <input
                    value={emailDomain}
                    onChange={e => setEmailDomain(e.target.value.trim().toLowerCase())}
                    placeholder="cmrtc.edu.in"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Roll No + @ + domain = student email</p>
                </div>

                {/* Batch assignment */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Assign to batch (optional)</label>
                  <select
                    value={batchId}
                    onChange={e => setBatchId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— No batch assignment —</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Auto-enrolls in all batch courses</p>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Initial password</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={passwordMode === "roll_no"}
                      onChange={() => setPasswordMode("roll_no")}
                      className="accent-[var(--gold)]"
                    />
                    <span className="text-sm text-foreground">Roll number <span className="text-muted-foreground text-xs">(e.g. 21N81A0501)</span></span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={passwordMode === "custom"}
                      onChange={() => setPasswordMode("custom")}
                      className="accent-[var(--gold)]"
                    />
                    <span className="text-sm text-foreground">Custom password</span>
                  </label>
                  {passwordMode === "custom" && (
                    <div className="flex items-center gap-2 ml-6">
                      <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        value={customPass}
                        onChange={e => setCustomPass(e.target.value)}
                        placeholder="Min 6 characters"
                        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Students must change their password on first login.</p>
              </div>

              {validRows.length > CHUNK_SIZE && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {validRows.length} students will be processed in {Math.ceil(validRows.length / CHUNK_SIZE)} batches of up to {CHUNK_SIZE}. This may take 1–2 minutes. Do not close this window.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── IMPORTING ── */}
          {step === "importing" && (
            <div className="p-8 flex flex-col items-center justify-center gap-5 min-h-[280px]">
              <Loader2 className="w-10 h-10 animate-spin text-[var(--gold)]" />
              <div className="w-full max-w-sm text-center space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Processing batch {progress.batchNum} of {progress.totalBatches}…
                </p>
                {/* Progress bar */}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--gold)] rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress.done} / {progress.total} students processed
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Do not close this window</p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && summary && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-6 h-6 text-[var(--gold)]" />
                <h3 className="text-base font-semibold text-foreground">Import Complete</h3>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ["Total rows processed", summary.total],
                      ["Successfully created", summary.created],
                      ["Already existed (skipped)", summary.already_existed],
                      ["Failed", summary.failed],
                      ...(batchId ? [["Assigned to batch", summary.batch_assigned]] : []),
                    ].map(([label, value], i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-muted-foreground">{label}</td>
                        <td className="px-4 py-2.5 font-semibold text-foreground text-right">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary.failures.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {summary.failures.length} failure{summary.failures.length !== 1 ? "s" : ""}
                    </p>
                    <button
                      onClick={() => downloadFailuresCSV(summary.failures)}
                      className="flex items-center gap-1 text-xs text-[var(--gold)] hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" /> Download CSV
                    </button>
                  </div>
                  <div className="rounded-lg border border-border max-h-36 overflow-y-auto">
                    {summary.failures.slice(0, 20).map((f, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b border-border last:border-0">
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{f.roll_no}</span>
                        <span className="text-xs text-red-500 min-w-0 break-words">{f.reason}</span>
                      </div>
                    ))}
                    {summary.failures.length > 20 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">+{summary.failures.length - 20} more — download CSV for full list</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0 flex gap-2">
          {step === "setup" && (
            <>
              <Button className="flex-1" onClick={handleImport} disabled={!canImport}>
                Import {validRows.length > 0 ? `${validRows.length} Students` : "Students"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </>
          )}
          {step === "importing" && (
            <Button variant="outline" className="flex-1" disabled>Importing…</Button>
          )}
          {step === "done" && (
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
  const [showNominalRoll, setShowNominalRoll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unbatchedOnly, setUnbatchedOnly] = useState(false);
  const [showDeleteUnbatched, setShowDeleteUnbatched] = useState(false);
  const [deletingUnbatched, setDeletingUnbatched] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = unbatchedOnly
      ? await getUnbatchedStudents()
      : await getUsers("student");
    if (err) setError(err);
    else setStudents((data as ApiStudent[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchStudents(); }, [unbatchedOnly]);

  const handleDeleteUnbatched = async () => {
    setDeletingUnbatched(true);
    const { data, error } = await deleteUnbatchedStudents();
    setDeletingUnbatched(false);
    if (error) { toast.error(error); return; }
    toast.success(`${(data as any)?.deleted ?? 0} student accounts permanently deleted`);
    setShowDeleteUnbatched(false);
    fetchStudents();
  };

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
      {showNominalRoll && <NominalRollImportModal onClose={() => setShowNominalRoll(false)} onImported={fetchStudents} />}

      {showDeleteUnbatched && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete all unbatched students?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              This will <span className="font-semibold text-red-500">permanently delete</span> all{" "}
              <span className="font-semibold text-foreground">{students.length}</span> students who are not assigned to any batch.
            </p>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 mb-5">
              <p className="text-xs text-red-600 font-medium">This cannot be undone. All data, progress, and test history will be lost.</p>
              {students.length > 100 && (
                <p className="text-xs text-muted-foreground mt-1">This may take up to a minute for {students.length} students.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteUnbatched(false)} disabled={deletingUnbatched}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteUnbatched} disabled={deletingUnbatched}>
                {deletingUnbatched && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                {deletingUnbatched ? "Deleting…" : "Delete All"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowNominalRoll(true)}>
                <FileSpreadsheet className="size-4" /> Import Nominal Roll
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
        {!unbatchedOnly && (
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-md border border-border bg-background"
          >
            {["All", "Active", "At risk", "Inactive"].map(s => <option key={s}>{s}</option>)}
          </select>
        )}
        <Button
          size="sm"
          variant={unbatchedOnly ? "default" : "outline"}
          className={unbatchedOnly ? "bg-amber-500 hover:bg-amber-600 text-white border-0" : "gap-1.5"}
          onClick={() => { setUnbatchedOnly(v => !v); setSearch(""); setStatusFilter("All"); setPage(1); }}
        >
          <Layers className="size-4" />
          {unbatchedOnly ? "Showing Unbatched" : "Unbatched Only"}
        </Button>
        {(search || statusFilter !== "All") && !unbatchedOnly && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("All"); setPage(1); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
            {unbatchedOnly && <span className="ml-1.5 text-amber-600 font-medium">· not in any batch</span>}
          </span>
          <div className="flex items-center gap-3">
            {unbatchedOnly && filtered.length > 0 && isAdmin && (
              <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowDeleteUnbatched(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete All ({filtered.length})
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Page {page} / {totalPages || 1}</span>
          </div>
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
