import { useState, useRef, useCallback } from "react";
import {
  Upload, X, CheckCircle2, AlertCircle, Download, Loader2,
  ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, FileText, FileJson,
  TriangleAlert, ArrowRight,
} from "lucide-react";
import { bulkImportQuestions, parseImportFile } from "@/shared/lib/api";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedQuestion {
  _id: string;
  _rowNum: number;
  _errors: string[];
  question: string;
  type: "mcq" | "coding" | "short";
  options: [string, string, string, string];
  correct_answer: string;
  marks: number;
  topic: string;
}

interface ParseResult {
  rows: ParsedQuestion[];
  fileErrors: string[];
  sheetNames: string[];
  activeSheet: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const VALID_TYPES = ["mcq", "coding", "short"] as const;

// Column header aliases → internal field names (must match backend import-parser.js)
const COL_ALIASES: Record<string, string> = {
  type: "type", question_type: "type",
  question: "question", question_text: "question", text: "question",
  // Single-letter option columns (e.g. CSV header row: question,a,b,c,d,correct_answer,marks)
  a: "opt0", b: "opt1", c: "opt2", d: "opt3",
  option_a: "opt0", option_1: "opt0", opta: "opt0",
  option_b: "opt1", option_2: "opt1", optb: "opt1",
  option_c: "opt2", option_3: "opt2", optc: "opt2",
  option_d: "opt3", option_4: "opt3", optd: "opt3",
  correct_answer: "correct_answer", answer: "correct_answer", correct: "correct_answer", key: "correct_answer",
  marks: "marks", score: "marks", points: "marks", mark: "marks",
  topic: "topic", category: "topic", section: "topic",
};

// ── Utility functions ──────────────────────────────────────────────────────────

function normKey(s: string): string {
  return s.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function normalizeCorrectAnswer(val: unknown): string {
  if (val === undefined || val === null || val === "") return "0";
  const s = String(val).toLowerCase().trim();
  const li = ["a", "b", "c", "d"].indexOf(s);
  if (li >= 0) return String(li);
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 0 && n <= 3) return String(n);
  return "0";
}

function validateRow(q: Partial<ParsedQuestion>, seenTexts: Set<string>): string[] {
  const errs: string[] = [];
  const text = (q.question ?? "").trim();

  if (!text) errs.push("Question text is required");
  else if (text.length < 5) errs.push("Question too short (< 5 chars)");
  else if (text.length > 2000) errs.push("Question too long (> 2000 chars)");

  const type = q.type ?? "mcq";
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    errs.push(`Invalid type "${type}" — use mcq / coding / short`);
  }

  const marks = q.marks ?? 1;
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
    errs.push("Marks must be an integer between 1 and 100");
  }

  if (type === "mcq") {
    const opts = q.options ?? (["", "", "", ""] as [string, string, string, string]);
    const filled = opts.filter(o => o.trim()).length;
    if (filled < 4) errs.push(`MCQ requires 4 non-empty options (got ${filled})`);
    const ca = parseInt(q.correct_answer ?? "0", 10);
    if (isNaN(ca) || ca < 0 || ca > 3) {
      errs.push(`correct_answer "${q.correct_answer}" must map to A/B/C/D`);
    } else if (!opts[ca]?.trim()) {
      errs.push("correct_answer points to an empty option");
    }
  }

  if (text && seenTexts.has(text.toLowerCase())) {
    errs.push("Duplicate question in this file");
  }

  return errs;
}

function buildQuestion(
  obj: Record<string, string>,
  rowNum: number,
  seenTexts: Set<string>
): ParsedQuestion {
  const type = ((obj.type ?? "mcq").toLowerCase().trim()) as ParsedQuestion["type"];
  const question = (obj.question ?? "").trim();
  const options: [string, string, string, string] = [
    (obj.opt0 ?? "").trim(),
    (obj.opt1 ?? "").trim(),
    (obj.opt2 ?? "").trim(),
    (obj.opt3 ?? "").trim(),
  ];
  const correct_answer = normalizeCorrectAnswer(obj.correct_answer);
  const marks = Math.max(1, Math.min(100, Math.round(Number(obj.marks) || 1)));
  const topic = (obj.topic ?? "").trim();

  const partial = { question, type, options, correct_answer, marks, topic };
  const _errors = validateRow(partial, seenTexts);
  if (!_errors.some(e => e.includes("Duplicate")) && question.trim()) {
    seenTexts.add(question.toLowerCase().trim());
  }

  return {
    _id: `r${rowNum}-${Math.random().toString(36).slice(2, 6)}`,
    _rowNum: rowNum,
    _errors,
    ...partial,
  };
}

// ── CSV parser — handles quoted fields, \r\n, \r, \n ─────────────────────────

function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cell += ch;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ""; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        if (row.some(c => c.trim())) rows.push(row);
        row = []; cell = ""; i++; continue;
      }
      cell += ch;
    }
    i++;
  }
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim())) rows.push(row); }
  return rows;
}

function parseCSVFile(text: string): ParseResult {
  const grid = parseCSVText(text);
  if (!grid.length) {
    return { rows: [], fileErrors: ["File is empty"], sheetNames: [], activeSheet: "" };
  }

  // Build column map from header row
  const headerRow = grid[0];
  const colMap: Record<number, string> = {};
  headerRow.forEach((h, i) => {
    const alias = COL_ALIASES[normKey(h)];
    if (alias) colMap[i] = alias;
  });
  const hasHeaders = Object.keys(colMap).length >= 2;
  const dataRows = hasHeaders ? grid.slice(1) : grid;

  if (!dataRows.length) {
    return { rows: [], fileErrors: ["No data rows found"], sheetNames: [], activeSheet: "" };
  }

  const seenTexts = new Set<string>();
  const rows: ParsedQuestion[] = [];

  dataRows.forEach((cols, idx) => {
    const rowNum = idx + (hasHeaders ? 2 : 1);
    if (!cols.some(c => c.trim())) return;

    let obj: Record<string, string>;
    if (hasHeaders) {
      obj = {};
      Object.entries(colMap).forEach(([i, key]) => {
        if (!obj[key]) obj[key] = (cols[Number(i)] ?? "").trim();
      });
    } else {
      // Positional: type, question, optA, optB, optC, optD, correct_answer, marks
      const [type = "", question = "", opt0 = "", opt1 = "", opt2 = "", opt3 = "", correct_answer = "0", marks = "1"] =
        cols.map(c => c.trim());
      obj = { type, question, opt0, opt1, opt2, opt3, correct_answer, marks };
    }
    rows.push(buildQuestion(obj, rowNum, seenTexts));
  });

  return { rows, fileErrors: [], sheetNames: [], activeSheet: "" };
}

// ── JSON parser ────────────────────────────────────────────────────────────────

function parseJSONFile(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    return { rows: [], fileErrors: ["Invalid JSON — file could not be parsed"], sheetNames: [], activeSheet: "" };
  }

  const arr: unknown[] = Array.isArray(data)
    ? data
    : (data && typeof data === "object" && Array.isArray((data as any).questions))
      ? (data as any).questions
      : [];

  if (!arr.length) {
    return {
      rows: [],
      fileErrors: ['JSON must be an array of questions or { "questions": [...] }'],
      sheetNames: [],
      activeSheet: "",
    };
  }

  const seenTexts = new Set<string>();
  const rows: ParsedQuestion[] = arr.map((raw: any, i) => {
    const rawOpts: unknown[] = Array.isArray(raw.options) ? raw.options : [];
    const opts: [string, string, string, string] = [
      String(rawOpts[0] ?? "").trim(),
      String(rawOpts[1] ?? "").trim(),
      String(rawOpts[2] ?? "").trim(),
      String(rawOpts[3] ?? "").trim(),
    ];
    const obj: Record<string, string> = {
      type: String(raw.type ?? "mcq"),
      question: String(raw.question ?? ""),
      opt0: opts[0], opt1: opts[1], opt2: opts[2], opt3: opts[3],
      correct_answer: String(raw.correct_answer ?? "0"),
      marks: String(raw.marks ?? "1"),
      topic: String(raw.topic ?? ""),
    };
    return buildQuestion(obj, i + 1, seenTexts);
  });

  return { rows, fileErrors: [], sheetNames: [], activeSheet: "" };
}

// ── Excel parser (dynamic import — xlsx stays out of the main bundle) ─────────

async function parseExcelFile(buffer: ArrayBuffer, sheetName?: string): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetNames = wb.SheetNames;

  if (!sheetNames.length) {
    return { rows: [], fileErrors: ["Workbook has no sheets"], sheetNames, activeSheet: "" };
  }

  const active = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const ws = wb.Sheets[active];
  if (!ws) {
    return { rows: [], fileErrors: [`Sheet "${active}" not found`], sheetNames, activeSheet: active };
  }

  const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  if (!jsonRows.length) {
    return { rows: [], fileErrors: [`Sheet "${active}" is empty`], sheetNames, activeSheet: active };
  }

  const seenTexts = new Set<string>();
  const rows: ParsedQuestion[] = jsonRows.map((raw, i) => {
    const obj: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      const alias = COL_ALIASES[normKey(k)];
      if (alias && !obj[alias]) obj[alias] = String(v ?? "").trim();
    });
    return buildQuestion(obj, i + 1, seenTexts);
  });

  return { rows, fileErrors: [], sheetNames, activeSheet: active };
}

// ── Download helpers ───────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /**
   * When set, imported questions are sent to the backend via bulk API.
   * When absent (create-flow), parsed questions are returned to the parent
   * via onImported(qs) without any API call.
   */
  testId?: string;
  onClose: () => void;
  onImported: (qs?: ParsedQuestion[]) => void;
}

type Step = "upload" | "preview" | "done";
type TabFilter = "all" | "valid" | "errors";
type ProgressStage = "uploading" | "parsing" | "done" | null;

export function QuestionImportModal({ testId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [progressStage, setProgressStage] = useState<ProgressStage>(null);
  const [rows, setRows] = useState<ParsedQuestion[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [filename, setFilename] = useState("");
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => r._errors.length === 0);
  const errorRows = rows.filter(r => r._errors.length > 0);
  const displayRows = tab === "valid" ? validRows : tab === "errors" ? errorRows : rows;
  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE) || 1;
  const safePage = Math.min(page, totalPages);
  const pageRows = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const applyResult = useCallback((result: ParseResult) => {
    setRows(result.rows);
    setSheetNames(result.sheetNames);
    setActiveSheet(result.activeSheet);
    setFileErrors(result.fileErrors);
    setTab("all");
    setPage(1);
    if (!result.fileErrors.length && result.rows.length > 0) setStep("preview");
  }, []);

  // ── Server-side parsing (single code path for all file types) ────────────────
  const processFile = useCallback(async (file: File) => {
    setParsing(true);
    setProgressStage("uploading");
    setFilename(file.name);
    setFileErrors([]);
    setRows([]);
    try {
      setProgressStage("parsing");
      const { data, error } = await parseImportFile(file);
      if (error || !data) {
        setFileErrors([error ?? "Failed to parse file. Please check the file format."]);
        setParsing(false);
        setProgressStage(null);
        return;
      }
      // Server returns ParseResult-compatible shape
      const result: ParseResult = {
        rows: (data.rows ?? []) as ParsedQuestion[],
        fileErrors: data.fileErrors ?? [],
        sheetNames: data.sheetNames ?? [],
        activeSheet: data.activeSheet ?? "",
      };
      applyResult(result);
    } catch (e: any) {
      setFileErrors([`Could not read file: ${e.message}`]);
    }
    setParsing(false);
    setProgressStage(null);
  }, [applyResult]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  // Sheet switching: re-upload with sheet parameter (re-parse from same file)
  const handleSheetChange = async (sheet: string) => {
    if (!rows.length) return;
    // Re-parse by hitting the server with the already-uploaded file name
    // For now, display a notice since re-parsing requires re-upload
    setActiveSheet(sheet);
    toast.info(`To switch sheets, please re-upload the file and select "${sheet}" from the sheet selector.`);
  };

  const deleteRow = (id: string) => {
    setRows(prev => prev.filter(r => r._id !== id));
  };

  const removeAllErrors = () => {
    setRows(prev => prev.filter(r => r._errors.length === 0));
    setTab("all");
    setPage(1);
  };

  const downloadErrorReport = () => {
    if (!errorRows.length) return;
    const header = "Row,Question,Errors";
    const body = errorRows.map(r =>
      `${r._rowNum},"${r.question.replace(/"/g, '""').substring(0, 120)}","${r._errors.join("; ").replace(/"/g, '""')}"`
    ).join("\n");
    downloadBlob(header + "\n" + body, `import_errors_${Date.now()}.csv`);
  };

  const handleImport = async () => {
    if (!validRows.length) return;

    if (!testId) {
      // Create-flow: return parsed questions to parent, no API call
      onImported(validRows);
      onClose();
      return;
    }

    setImporting(true);
    const payload = validRows.map(r => ({
      question: r.question,
      type: r.type,
      options: r.type === "mcq" ? Array.from(r.options) : undefined,
      // correct_answer is already a normalized numeric-index string from the server parser
      correct_answer: r.type === "mcq" ? r.correct_answer : undefined,
      marks: r.marks,
      topic: r.topic || undefined,
    }));

    const { data, error } = await bulkImportQuestions(testId, payload);
    setImporting(false);

    if (error) {
      toast.error(`Import failed: ${error}`);
      return;
    }

    setImportResult({
      inserted: data?.inserted ?? 0,
      skipped: data?.skipped ?? 0,
      errors: data?.errors ?? [],
    });
    setStep("done");
    onImported();
  };

  // ── Format badge helper ──────────────────────────────────────────────────────
  const ext = filename.split(".").pop()?.toLowerCase();
  const FormatIcon = ext === "xlsx" || ext === "xls" ? FileSpreadsheet
    : ext === "json" ? FileJson : FileText;

  // ── STEP: Upload ─────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div>
              <h3 className="font-bold text-foreground">Import Questions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Excel, CSV, or JSON — up to 10,000 questions</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Format guide */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                {
                  icon: <FileSpreadsheet className="w-4 h-4 text-green-600" />,
                  label: ".xlsx",
                  hint: "Columns: type, question, option_a–d, correct_answer, marks",
                },
                {
                  icon: <FileText className="w-4 h-4 text-blue-600" />,
                  label: ".csv",
                  hint: "Same columns as Excel, quoted fields supported",
                },
                {
                  icon: <FileJson className="w-4 h-4 text-orange-500" />,
                  label: ".json",
                  hint: 'Array of { type, question, options[], correct_answer, marks }',
                },
              ].map(({ icon, label, hint }) => (
                <div key={label} className="p-3 border border-border rounded-xl bg-muted/20 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    {icon} {label}
                  </div>
                  <p className="text-muted-foreground leading-tight">{hint}</p>
                </div>
              ))}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !parsing && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                parsing ? "cursor-not-allowed opacity-70" :
                isDragging ? "border-primary bg-primary/5 cursor-copy" : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
              }`}
            >
              {parsing ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {progressStage === "uploading" ? "Uploading file…" : "Parsing questions…"}
                    </p>
                    <p className="text-xs text-muted-foreground">{filename}</p>
                  </div>
                  {/* Progress steps */}
                  <div className="flex items-center gap-2 mt-2">
                    {(["Uploading", "Parsing", "Preview"] as const).map((stage, i) => {
                      const stageKey = stage.toLowerCase();
                      const active = progressStage === stageKey || (progressStage === "parsing" && i === 1) || (progressStage === "uploading" && i === 0);
                      const done = (progressStage === "parsing" && i === 0);
                      return (
                        <>
                          <div key={stage} className={`flex items-center gap-1 text-xs font-semibold ${
                            done ? "text-green-500" : active ? "text-primary" : "text-muted-foreground/50"
                          }`}>
                            {done ? <CheckCircle2 className="w-3 h-3" /> : <div className={`w-2 h-2 rounded-full ${ active ? "bg-primary" : "bg-muted-foreground/30"}`} />}
                            {stage}
                          </div>
                          {i < 2 && <ArrowRight className="w-3 h-3 text-muted-foreground/30" />}
                        </>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">
                    {isDragging ? "Drop to import" : "Click or drag a file here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Accepts .xlsx, .xls, .csv, .json</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
              />
            </div>

            {/* File-level errors */}
            {fileErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1">
                {fileErrors.map((e, i) => (
                  <p key={i} className="text-sm text-red-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}

            {/* Column reference */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium hover:text-foreground transition-colors">
                Column reference ▸
              </summary>
              <div className="mt-2 p-3 bg-muted/30 rounded-lg font-mono space-y-1">
                <p><span className="text-foreground font-bold">type</span> — mcq / coding / short (default: mcq)</p>
                <p><span className="text-foreground font-bold">question</span> — question text (required)</p>
                <p><span className="text-foreground font-bold">a, b, c, d</span> — MCQ options (also: option_a … option_d)</p>
                <p><span className="text-foreground font-bold">correct_answer</span> — A/B/C/D or 0/1/2/3</p>
                <p><span className="text-foreground font-bold">marks</span> — integer 1–100 (default: 1)</p>
                <p><span className="text-foreground font-bold">topic</span> — optional category label</p>
                <p className="text-muted-foreground/70 pt-1">Example CSV: question,a,b,c,d,correct_answer,marks</p>
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: Preview ─────────────────────────────────────────────────────────────
  if (step === "preview") {
    const tabs: { key: TabFilter; label: string; count: number }[] = [
      { key: "all",    label: "All",    count: rows.length },
      { key: "valid",  label: "Valid",  count: validRows.length },
      { key: "errors", label: "Errors", count: errorRows.length },
    ];

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh]">

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
                  <FormatIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-bold text-foreground truncate max-w-xs">{filename}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rows.length} rows parsed · {validRows.length} valid · {errorRows.length} with errors
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sheet selector (Excel multi-sheet) */}
          {sheetNames.length > 1 && (
            <div className="px-6 py-2 border-b border-border shrink-0 flex items-center gap-3 bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground">Sheet:</span>
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
                  >
                    {s}
                  </button>
                ))}
              </div>
              {parsing && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}

          {/* Stat strip */}
          <div className="grid grid-cols-3 border-b border-border shrink-0">
            {[
              { label: "Total Rows", value: rows.length, cls: "text-foreground" },
              { label: "Valid",      value: validRows.length, cls: "text-green-500" },
              { label: "Errors",     value: errorRows.length, cls: errorRows.length ? "text-red-500" : "text-muted-foreground" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-center py-3 border-r border-border last:border-r-0">
                <p className={`text-xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar: tabs + actions */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-border shrink-0 gap-4">
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
            <div className="flex items-center gap-2">
              {errorRows.length > 0 && (
                <>
                  <button
                    onClick={downloadErrorReport}
                    title="Download error report as CSV"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Error report
                  </button>
                  <button
                    onClick={removeAllErrors}
                    title="Remove all error rows from the import list"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-500/30 rounded-lg hover:bg-red-500/5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove all errors
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {displayRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <CheckCircle2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">
                  {tab === "errors" ? "No error rows" : "No rows to display"}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 border-b border-border sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-10">#</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground">Question</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-20">Type</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-20">Answer</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-16">Marks</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-muted-foreground w-28">Status</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map(row => {
                    const isValid = row._errors.length === 0;
                    const caLetter = row.type === "mcq"
                      ? String.fromCharCode(65 + parseInt(row.correct_answer, 10))
                      : "—";
                    return (
                      <tr
                        key={row._id}
                        className={`transition-colors ${isValid ? "hover:bg-muted/20" : "bg-red-500/3 hover:bg-red-500/6"}`}
                      >
                        <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{row._rowNum}</td>
                        <td className="px-4 py-2 max-w-xs">
                          <p className="truncate text-foreground">{row.question || <span className="text-muted-foreground italic">empty</span>}</p>
                          {row.type === "mcq" && row.options.some(o => o) && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {row.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("  ")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                            row.type === "mcq" ? "bg-blue-500/10 text-blue-600" :
                            row.type === "coding" ? "bg-purple-500/10 text-purple-600" :
                            "bg-slate-500/10 text-slate-600"
                          }`}>
                            {row.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {row.type === "mcq" ? (
                            <span className="text-xs font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
                              {caLetter}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">manual</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{row.marks}</td>
                        <td className="px-4 py-2">
                          {isValid ? (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              {row._errors.map((e, i) => (
                                <p key={i} className="flex items-start gap-1 text-xs text-red-500 leading-tight">
                                  <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{e}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => deleteRow(row._id)}
                            title="Remove this row"
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
                Page {safePage} of {totalPages} · {displayRows.length} rows
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Footer: import CTA */}
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
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                  : <>Import {validRows.length} Question{validRows.length !== 1 ? "s" : ""}</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: Done ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">Import Complete</h3>
          <p className="text-muted-foreground text-sm mt-1">{filename}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-border bg-green-500/5 text-center">
            <p className="text-3xl font-black text-green-500">{importResult?.inserted ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Questions Inserted</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-muted text-center">
            <p className="text-3xl font-black text-muted-foreground">{importResult?.skipped ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Rows Skipped</p>
          </div>
        </div>
        {(importResult?.errors?.length ?? 0) > 0 && (
          <button
            onClick={downloadErrorReport}
            className="flex items-center gap-2 mx-auto px-4 py-2 text-sm font-semibold text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" /> Download skip report
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
