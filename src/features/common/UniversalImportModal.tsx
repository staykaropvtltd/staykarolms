import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, X, CheckCircle2, AlertCircle, Download, Loader2,
  ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, FileText, FileJson,
  TriangleAlert, History, Search, RefreshCw, FileArchive, FileImage,
  FileCode, BookOpen, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { bulkImportQuestions } from "@/shared/lib/api";
import { parseImportFile, createImportJob, getImportJobs, reParseExcelSheet } from "@/shared/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

export type QuestionType =
  | "mcq" | "mcq-multi" | "true-false" | "fill-blank"
  | "short" | "long" | "descriptive"
  | "coding" | "sql"
  | "case-study" | "matching" | "ordering" | "numerical" | "paragraph";

export interface ParsedQuestion {
  _id: string;
  _rowNum: number;
  _errors: string[];
  _sourceType?: string;
  _sourceFile?: string;
  question: string;
  type: QuestionType;
  options: string[];
  correct_answer: string;
  marks: number;
  topic: string;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ParseResult {
  rows: ParsedQuestion[];
  fileErrors: string[];
  sheetNames: string[];
  activeSheet: string;
  stats?: { total: number; valid: number; errors: number };
  file?: { name: string; size: number; ext: string };
}

interface ImportJob {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  total_questions: number;
  inserted: number;
  skipped: number;
  failed_count: number;
  test_id?: string;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "mcq":         { bg: "bg-blue-500/10",    text: "text-blue-600",    label: "MCQ" },
  "mcq-multi":   { bg: "bg-indigo-500/10",  text: "text-indigo-600",  label: "MCQ Multi" },
  "true-false":  { bg: "bg-cyan-500/10",    text: "text-cyan-600",    label: "T/F" },
  "fill-blank":  { bg: "bg-teal-500/10",    text: "text-teal-600",    label: "Fill" },
  "short":       { bg: "bg-slate-500/10",   text: "text-slate-600",   label: "Short" },
  "long":        { bg: "bg-stone-500/10",   text: "text-stone-600",   label: "Long" },
  "descriptive": { bg: "bg-zinc-500/10",    text: "text-zinc-600",    label: "Desc." },
  "coding":      { bg: "bg-purple-500/10",  text: "text-purple-600",  label: "Code" },
  "sql":         { bg: "bg-orange-500/10",  text: "text-orange-600",  label: "SQL" },
  "case-study":  { bg: "bg-amber-500/10",   text: "text-amber-600",   label: "Case" },
  "matching":    { bg: "bg-lime-500/10",    text: "text-lime-600",    label: "Match" },
  "ordering":    { bg: "bg-green-500/10",   text: "text-green-600",   label: "Order" },
  "numerical":   { bg: "bg-red-500/10",     text: "text-red-600",     label: "Num." },
  "paragraph":   { bg: "bg-pink-500/10",    text: "text-pink-600",    label: "Para." },
};

const DIFF_COLORS: Record<string, string> = {
  easy:   "text-green-500",
  medium: "text-amber-500",
  hard:   "text-red-500",
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function downloadBlob(content: string, filename: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function getFileIcon(ext: string) {
  if (["xlsx","xls"].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  if (ext === "json") return <FileJson className="w-4 h-4 text-orange-500" />;
  if (ext === "pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (ext === "docx") return <FileCode className="w-4 h-4 text-blue-500" />;
  if (ext === "zip") return <FileArchive className="w-4 h-4 text-yellow-500" />;
  if (["png","jpg","jpeg"].includes(ext)) return <FileImage className="w-4 h-4 text-violet-500" />;
  if (["md","txt"].includes(ext)) return <BookOpen className="w-4 h-4 text-teal-500" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  testId?: string;
  onClose: () => void;
  onImported: (qs?: ParsedQuestion[]) => void;
}

type Step = "upload" | "parsing" | "preview" | "importing" | "done" | "history";
type TabFilter = "all" | "valid" | "errors";
type TypeFilter = "all" | QuestionType;

// ── Component ─────────────────────────────────────────────────────────────────

export function UniversalImportModal({ testId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);

  // Parse state
  const [rows, setRows] = useState<ParsedQuestion[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [filename, setFilename] = useState("");
  const [fileExt, setFileExt] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [parseProgress, setParseProgress] = useState("");
  // For Excel sheet re-parse we store the raw base64 buffer
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);

  // Preview filter state
  const [tab, setTab] = useState<TabFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ParsedQuestion>>({});

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: any[] } | null>(null);

  // History
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const validRows = rows.filter(r => r._errors.length === 0);
  const errorRows = rows.filter(r => r._errors.length > 0);

  const typeSet = new Set(rows.map(r => r.type));

  const filteredRows = rows
    .filter(r => {
      if (tab === "valid") return r._errors.length === 0;
      if (tab === "errors") return r._errors.length > 0;
      return true;
    })
    .filter(r => typeFilter === "all" || r.type === typeFilter)
    .filter(r => {
      if (!search.trim()) return true;
      const q = r.question.toLowerCase();
      const t = r.topic?.toLowerCase() || "";
      return q.includes(search.toLowerCase()) || t.includes(search.toLowerCase());
    });

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Upload & parse ─────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setStep("parsing");
    setFilename(file.name);
    setFileExt(file.name.split(".").pop()?.toLowerCase() || "");
    setFileSize(file.size);
    setParseProgress(`Uploading ${file.name}…`);

    try {
      const result = await parseImportFile(file);
      if (result.error) {
        setFileErrors([result.error]);
        setStep("upload");
        return;
      }
      const parsed = result.data as ParseResult;

      if (parsed.fileErrors?.length && !parsed.rows?.length) {
        setFileErrors(parsed.fileErrors);
        setStep("upload");
        return;
      }

      // For Excel: store base64 for sheet switching
      if (["xlsx","xls"].includes(file.name.split(".").pop()?.toLowerCase() || "")) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        setXlsxBase64(btoa(binary));
      }

      setRows(parsed.rows || []);
      setSheetNames(parsed.sheetNames || []);
      setActiveSheet(parsed.activeSheet || "");
      setFileErrors(parsed.fileErrors || []);
      setTab("all");
      setTypeFilter("all");
      setSearch("");
      setPage(1);
      setStep("preview");
    } catch (e: any) {
      setFileErrors([`Upload failed: ${e.message}`]);
      setStep("upload");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleSheetChange = async (sheet: string) => {
    if (!xlsxBase64) return;
    setParseProgress(`Loading sheet "${sheet}"…`);
    setStep("parsing");
    const result = await reParseExcelSheet(xlsxBase64, filename, sheet);
    if (result.error) { setFileErrors([result.error]); setStep("preview"); return; }
    const parsed = result.data as ParseResult;
    setRows(parsed.rows || []);
    setActiveSheet(parsed.activeSheet || sheet);
    setFileErrors(parsed.fileErrors || []);
    setTab("all"); setPage(1);
    setStep("preview");
  };

  // ── Row editing ────────────────────────────────────────────────────────────

  const startEdit = (row: ParsedQuestion) => {
    setEditId(row._id);
    setEditDraft({ ...row });
  };

  const commitEdit = () => {
    if (!editId) return;
    setRows(prev => prev.map(r => {
      if (r._id !== editId) return r;
      const updated = { ...r, ...editDraft };
      // Re-validate
      const errs: string[] = [];
      if (!updated.question?.trim()) errs.push("Question text is required");
      if ((updated.marks ?? 0) < 1 || (updated.marks ?? 0) > 100) errs.push("Marks must be 1–100");
      updated._errors = errs;
      return updated;
    }));
    setEditId(null);
    setEditDraft({});
  };

  const deleteRow = (id: string) => setRows(prev => prev.filter(r => r._id !== id));

  const removeAllErrors = () => { setRows(prev => prev.filter(r => r._errors.length === 0)); setTab("all"); setPage(1); };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!validRows.length) return;

    if (!testId) {
      onImported(validRows);
      onClose();
      return;
    }

    setImporting(true);
    setStep("importing");
    setImportProgress(0);

    const CHUNK_SIZE = 500;
    let totalInserted = 0;
    let totalSkipped = 0;
    const allErrors: any[] = [];

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const payload = chunk.map(r => ({
        question: r.question,
        type: r.type,
        options: r.options?.length ? r.options : undefined,
        correct_answer: r.correct_answer || undefined,
        marks: r.marks,
        topic: r.topic || undefined,
        explanation: r.explanation || undefined,
        difficulty: r.difficulty || undefined,
        tags: r.tags?.length ? r.tags : undefined,
        metadata: r.metadata || undefined,
      }));

      const { data, error } = await bulkImportQuestions(testId, payload);
      if (error) {
        toast.error(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${error}`);
        break;
      }
      totalInserted += data?.inserted ?? 0;
      totalSkipped += data?.skipped ?? 0;
      allErrors.push(...(data?.errors ?? []));
      setImportProgress(Math.round(((i + chunk.length) / validRows.length) * 100));
    }

    setImporting(false);
    setImportResult({ inserted: totalInserted, skipped: totalSkipped + errorRows.length, errors: allErrors });
    setStep("done");

    // Record job in history
    try {
      await createImportJob({
        test_id: testId,
        file_name: filename,
        file_type: fileExt,
        file_size: fileSize,
        total_questions: rows.length,
        inserted: totalInserted,
        skipped: totalSkipped + errorRows.length,
        failed_count: allErrors.length,
        error_log: allErrors,
      });
    } catch { /* non-fatal */ }

    onImported();
  };

  // ── Error report ───────────────────────────────────────────────────────────

  const downloadErrorReport = () => {
    const target = importResult?.errors?.length ? importResult.errors : errorRows.map(r => ({
      row: r._rowNum,
      question: r.question,
      errors: r._errors,
    }));
    if (!target.length) return;
    const header = "Row,Question (first 100 chars),Errors";
    const body = target.map((e: any) => {
      const q = String(e.question || "").replace(/"/g, '""').substring(0, 100);
      const errs = Array.isArray(e.errors) ? e.errors.join("; ") : String(e.errors || "");
      return `${e.row},"${q}","${errs.replace(/"/g, '""')}"`;
    }).join("\n");
    downloadBlob(header + "\n" + body, `import_errors_${Date.now()}.csv`);
  };

  // ── History ────────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const result = await getImportJobs();
    setHistoryLoading(false);
    if (result.data) setHistory(result.data as ImportJob[]);
  }, []);

  useEffect(() => {
    if (step === "history") loadHistory();
  }, [step, loadHistory]);

  // ── Rendering ──────────────────────────────────────────────────────────────

  const SUPPORTED_FORMATS = [
    { ext: ".xlsx / .xls", label: "Excel", hint: "Columns: type, question, option_a–d, correct_answer, marks, topic", icon: <FileSpreadsheet className="w-4 h-4 text-green-600" /> },
    { ext: ".csv", label: "CSV", hint: "Same columns as Excel, RFC 4180 format", icon: <FileText className="w-4 h-4 text-blue-600" /> },
    { ext: ".json", label: "JSON", hint: 'Array or { questions: [] }', icon: <FileJson className="w-4 h-4 text-orange-500" /> },
    { ext: ".docx", label: "Word", hint: "Auto-detects questions by numbered markers", icon: <FileCode className="w-4 h-4 text-blue-500" /> },
    { ext: ".pdf", label: "PDF", hint: "Text-based PDFs — scanned PDFs need OCR", icon: <FileText className="w-4 h-4 text-red-500" /> },
    { ext: ".txt / .md", label: "Text / Markdown", hint: "Numbered questions with A/B/C/D options", icon: <BookOpen className="w-4 h-4 text-teal-500" /> },
    { ext: ".zip", label: "ZIP", hint: "Archive containing any of the above formats", icon: <FileArchive className="w-4 h-4 text-yellow-500" /> },
    { ext: ".png / .jpg", label: "Image", hint: "OCR not available — convert to text first", icon: <FileImage className="w-4 h-4 text-violet-500" /> },
  ];

  // ── STEP: Upload ─────────────────────────────────────────────────────────

  if (step === "upload") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
            <div>
              <h3 className="font-bold text-foreground">Universal Question Import</h3>
              <p className="text-xs text-muted-foreground mt-0.5">14 question types · 8 file formats · up to 10,000 questions</p>
            </div>
            <div className="flex items-center gap-2">
              {testId && (
                <button
                  onClick={() => setStep("history")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                >
                  <History className="w-3.5 h-3.5" /> History
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                {isDragging ? "Drop to import" : "Click or drag a file here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Accepts: .xlsx, .xls, .csv, .json, .docx, .pdf, .txt, .md, .zip, .png, .jpg
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Max 50 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json,.docx,.pdf,.txt,.md,.zip,.png,.jpg,.jpeg"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
              />
            </div>

            {fileErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1">
                {fileErrors.map((e, i) => (
                  <p key={i} className="text-sm text-red-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}

            {/* Supported formats grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {SUPPORTED_FORMATS.map(f => (
                <div key={f.ext} className="p-3 border border-border rounded-xl bg-muted/10 flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{f.icon}</div>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      {f.ext}
                      <span className="text-muted-foreground font-normal">— {f.label}</span>
                    </div>
                    <p className="text-muted-foreground leading-tight mt-0.5">{f.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Supported question types */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium hover:text-foreground transition-colors">
                Supported question types (14) ▸
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(TYPE_COLORS).map(([type, c]) => (
                  <span key={type} className={`px-2 py-0.5 rounded-full font-semibold ${c.bg} ${c.text}`}>
                    {c.label}
                  </span>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: Parsing ─────────────────────────────────────────────────────────

  if (step === "parsing") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-10 text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <div>
            <p className="font-bold text-foreground">{parseProgress || "Parsing file…"}</p>
            <p className="text-xs text-muted-foreground mt-1">{filename}</p>
          </div>
          <p className="text-xs text-muted-foreground">Detecting question types & extracting content</p>
        </div>
      </div>
    );
  }

  // ── STEP: Importing ────────────────────────────────────────────────────────

  if (step === "importing") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-10 text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <div>
            <p className="font-bold text-foreground">Importing questions…</p>
            <p className="text-xs text-muted-foreground mt-1">{validRows.length} valid questions</p>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%`, background: "var(--gold)" }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{importProgress}% complete</p>
        </div>
      </div>
    );
  }

  // ── STEP: Done ─────────────────────────────────────────────────────────────

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Import Complete</h3>
            <p className="text-muted-foreground text-sm mt-1">{filename}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-border bg-green-500/5 text-center">
              <p className="text-2xl font-black text-green-500">{importResult?.inserted ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Inserted</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted text-center">
              <p className="text-2xl font-black text-muted-foreground">{importResult?.skipped ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Skipped</p>
            </div>
            <div className="p-4 rounded-xl border border-border text-center">
              <p className="text-2xl font-black text-foreground">{rows.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Parsed</p>
            </div>
          </div>
          {((importResult?.errors?.length ?? 0) > 0 || errorRows.length > 0) && (
            <button
              onClick={downloadErrorReport}
              className="flex items-center gap-2 mx-auto px-4 py-2 text-sm font-semibold text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" /> Download error report
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2.5 font-bold rounded-xl text-[#1A1A1A]"
            style={{ background: "var(--gold)" }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── STEP: History ──────────────────────────────────────────────────────────

  if (step === "history") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("upload")} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-bold text-foreground">Import History</h3>
                <p className="text-xs text-muted-foreground">All past imports for your institution</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadHistory} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${historyLoading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading history…</span>
              </div>
            ) : !history.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <History className="w-8 h-8 opacity-30" />
                <p className="text-sm">No imports yet</p>
                <p className="text-xs">Import history requires the DB migration to be run</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 border-b border-border sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground">File</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-20">Format</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-20">Inserted</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-20">Skipped</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-36">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map(job => (
                    <tr key={job.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {getFileIcon(job.file_type)}
                          <div>
                            <p className="text-foreground truncate max-w-[180px]">{job.file_name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(job.file_size || 0)} · {job.total_questions} questions</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs uppercase font-mono text-muted-foreground">.{job.file_type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-green-600 font-semibold">{job.inserted}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{job.skipped}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: Preview ──────────────────────────────────────────────────────────

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all",    label: "All",    count: rows.length },
    { key: "valid",  label: "Valid",  count: validRows.length },
    { key: "errors", label: "Errors", count: errorRows.length },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[94vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setStep("upload"); setRows([]); setFileErrors([]); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                {getFileIcon(fileExt)}
                <span className="font-bold text-foreground truncate max-w-xs">{filename}</span>
                <span className="text-xs text-muted-foreground">({formatBytes(fileSize)})</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rows.length} questions parsed · {validRows.length} valid · {errorRows.length} with errors
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sheet selector (multi-sheet Excel) */}
        {sheetNames.length > 1 && (
          <div className="px-6 py-2 border-b border-border shrink-0 flex items-center gap-3 bg-muted/20">
            <span className="text-xs font-semibold text-muted-foreground shrink-0">Sheet:</span>
            <div className="flex gap-1 flex-wrap">
              {sheetNames.map(s => (
                <button
                  key={s}
                  onClick={() => handleSheetChange(s)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    s === activeSheet
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted text-muted-foreground"
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Stat strip */}
        <div className="grid grid-cols-4 border-b border-border shrink-0">
          {[
            { label: "Total", value: rows.length, cls: "text-foreground" },
            { label: "Valid", value: validRows.length, cls: "text-green-500" },
            { label: "Errors", value: errorRows.length, cls: errorRows.length ? "text-red-500" : "text-muted-foreground" },
            { label: "Types", value: typeSet.size, cls: "text-foreground" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="text-center py-3 border-r border-border last:border-r-0">
              <p className={`text-xl font-bold ${cls}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* File-level errors */}
        {fileErrors.length > 0 && (
          <div className="px-6 py-2 border-b border-border bg-amber-500/5 shrink-0">
            {fileErrors.map((e, i) => (
              <p key={i} className="text-xs text-amber-600 flex items-center gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {e}
              </p>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border shrink-0 gap-3 flex-wrap">
          {/* Tab filter */}
          <div className="flex gap-1">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label} <span className="ml-1 opacity-70">({count})</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[140px] max-w-xs relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search questions…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Type filter */}
          {typeSet.size > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value as TypeFilter); setPage(1); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All types</option>
                {[...typeSet].map(t => (
                  <option key={t} value={t}>{TYPE_COLORS[t]?.label || t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {errorRows.length > 0 && (
              <>
                <button
                  onClick={downloadErrorReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Error CSV
                </button>
                <button
                  onClick={removeAllErrors}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-500/30 rounded-lg hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove errors
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <CheckCircle2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">{tab === "errors" ? "No error rows" : "No questions match your filter"}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-10">#</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground">Question</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-24">Type</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-24">Answer</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-14">Marks</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-16">Diff.</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-32">Status</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map(row => {
                  const isValid = row._errors.length === 0;
                  const tc = TYPE_COLORS[row.type] ?? { bg: "bg-muted", text: "text-foreground", label: row.type };
                  const isEditing = editId === row._id;

                  if (isEditing) {
                    return (
                      <tr key={row._id} className="bg-primary/5">
                        <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{row._rowNum}</td>
                        <td className="px-4 py-2" colSpan={5}>
                          <div className="space-y-2">
                            <textarea
                              value={editDraft.question || ""}
                              onChange={e => setEditDraft(d => ({ ...d, question: e.target.value }))}
                              rows={2}
                              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                              placeholder="Question text"
                            />
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={editDraft.marks ?? row.marks}
                                onChange={e => setEditDraft(d => ({ ...d, marks: parseInt(e.target.value, 10) }))}
                                min={1} max={100}
                                className="w-20 text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none"
                                placeholder="Marks"
                              />
                              <input
                                value={editDraft.topic ?? row.topic ?? ""}
                                onChange={e => setEditDraft(d => ({ ...d, topic: e.target.value }))}
                                className="flex-1 text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none"
                                placeholder="Topic (optional)"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 w-28">
                          <div className="flex gap-1.5">
                            <button onClick={commitEdit} className="px-2 py-1 text-xs font-bold rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors">Save</button>
                            <button onClick={() => { setEditId(null); setEditDraft({}); }} className="px-2 py-1 text-xs font-bold rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
                          </div>
                        </td>
                        <td />
                      </tr>
                    );
                  }

                  const ansDisplay = (() => {
                    if (["mcq","true-false"].includes(row.type) && row.options?.length) {
                      const idx = parseInt(row.correct_answer, 10);
                      const letter = String.fromCharCode(65 + idx);
                      return <span className="text-xs font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">{letter}</span>;
                    }
                    if (row.type === "mcq-multi") return <span className="text-xs text-muted-foreground">Multi</span>;
                    if (row.correct_answer) return <span className="text-xs text-muted-foreground truncate max-w-[80px] block">{row.correct_answer}</span>;
                    return <span className="text-xs text-muted-foreground italic">manual</span>;
                  })();

                  return (
                    <tr
                      key={row._id}
                      className={`transition-colors cursor-pointer ${isValid ? "hover:bg-muted/20" : "bg-red-500/3 hover:bg-red-500/6"}`}
                      onDoubleClick={() => startEdit(row)}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{row._rowNum}</td>
                      <td className="px-4 py-2.5 max-w-xs">
                        <p className="truncate text-foreground text-xs">{row.question || <span className="italic text-muted-foreground">empty</span>}</p>
                        {["mcq","true-false","mcq-multi"].includes(row.type) && row.options?.some(o => o) && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {row.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("  ")}
                          </p>
                        )}
                        {row.topic && <p className="text-xs text-primary/70 mt-0.5 truncate">📌 {row.topic}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                          {tc.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{ansDisplay}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{row.marks}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${DIFF_COLORS[row.difficulty || "medium"]}`}>
                          {(row.difficulty || "med").slice(0, 4).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isValid ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {row._errors.slice(0, 2).map((e, i) => (
                              <p key={i} className="flex items-start gap-1 text-xs text-red-500 leading-tight">
                                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{e}</span>
                              </p>
                            ))}
                            {row._errors.length > 2 && (
                              <p className="text-xs text-red-400">+{row._errors.length - 2} more</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => deleteRow(row._id)}
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-muted/10 shrink-0">
            <span className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages} · {filteredRows.length} questions
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Double-click hint */}
        <div className="px-5 py-1.5 border-t border-border bg-muted/5 shrink-0">
          <p className="text-xs text-muted-foreground">Double-click a row to edit · Hover for details</p>
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {validRows.length === 0
              ? "No valid questions to import — fix errors or remove invalid rows"
              : errorRows.length > 0
                ? <span><span className="text-amber-500 font-semibold">{errorRows.length} rows</span> will be skipped · <span className="text-green-600 font-semibold">{validRows.length}</span> will be imported</span>
                : <span className="text-green-600 font-semibold">{validRows.length} valid questions ready</span>
            }
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl text-[#1A1A1A] disabled:opacity-40 transition-opacity"
              style={{ background: "var(--gold)" }}
            >
              {testId
                ? <>Import {validRows.length} Question{validRows.length !== 1 ? "s" : ""}</>
                : <>Use {validRows.length} Question{validRows.length !== 1 ? "s" : ""}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
