// backend/lib/import-parser.js
// Unified file parser for the universal question import system.
// Supports: xlsx, xls, csv, json, docx, pdf, txt, md, zip, png/jpg (OCR stub).

"use strict";

const { detectAndParseQuestions } = require("./question-detector");

// ── Constants ────────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  "xlsx","xls","csv","json","docx","pdf","txt","md","zip","png","jpg","jpeg","gif","webp",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Accepted MIME types → canonical extension
const MIME_MAP = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/json": "json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Column header aliases → internal field names (shared between Excel/CSV)
const COL_ALIASES = {
  type: "type", question_type: "type",
  question: "question", question_text: "question", text: "question",
  option_a: "opt0", option_1: "opt0", opta: "opt0", a: "opt0",
  option_b: "opt1", option_2: "opt1", optb: "opt1", b: "opt1",
  option_c: "opt2", option_3: "opt2", optc: "opt2", c: "opt2",
  option_d: "opt3", option_4: "opt3", optd: "opt3", d: "opt3",
  correct_answer: "correct_answer", answer: "correct_answer", correct: "correct_answer", key: "correct_answer",
  marks: "marks", score: "marks", points: "marks", mark: "marks",
  topic: "topic", category: "topic", section: "topic",
  explanation: "explanation", solution: "explanation", rationale: "explanation",
  difficulty: "difficulty", level: "difficulty",
  tags: "tags",
};

const VALID_TYPES = new Set([
  "mcq","mcq-multi","true-false","fill-blank","short","long","descriptive",
  "coding","sql","case-study","matching","ordering","numerical","paragraph",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────────

function normKey(s) {
  return String(s).toLowerCase().trim().replace(/[\s\-]+/g, "_");
}

function normalizeAnswer(val, type) {
  if (val === undefined || val === null || val === "") return type === "mcq" ? "0" : "";
  const s = String(val).toLowerCase().trim();
  if (type === "mcq" || type === "mcq-multi" || type === "true-false") {
    // Strip punctuation like "A." "B)" "C:" and spaces before matching
    const clean = s.replace(/[.)\]:\s]/g, "");
    const li = ["a","b","c","d"].indexOf(clean);
    if (li >= 0) return String(li);
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0 && n <= 9) return String(n);
    // "True"/"False" for true-false
    if (s === "true") return "0";
    if (s === "false") return "1";
  }
  return String(val).trim();
}

function normType(s) {
  if (!s) return "mcq";
  const lc = String(s).toLowerCase().trim().replace(/[\s\-_]+/g,"");
  if (lc === "mcq" || lc === "multiplechoice" || lc === "singlechoice") return "mcq";
  if (lc === "mcqmulti" || lc === "multiplechoicemulti" || lc === "multicorrect") return "mcq-multi";
  if (lc === "truefalse" || lc === "tf" || lc === "boolean") return "true-false";
  if (lc === "fillblank" || lc === "fillintheblank" || lc === "fib") return "fill-blank";
  if (lc === "short" || lc === "shortanswer" || lc === "shorttext") return "short";
  if (lc === "long" || lc === "longanswer" || lc === "longtext") return "long";
  if (lc === "descriptive" || lc === "essay") return "descriptive";
  if (lc === "coding" || lc === "code" || lc === "programming") return "coding";
  if (lc === "sql") return "sql";
  if (lc === "casestudy") return "case-study";
  if (lc === "matching" || lc === "match") return "matching";
  if (lc === "ordering" || lc === "order" || lc === "sequence") return "ordering";
  if (lc === "numerical" || lc === "numeric") return "numerical";
  if (lc === "paragraph") return "paragraph";
  return VALID_TYPES.has(lc) ? lc : "mcq";
}

function parseMarks(val) {
  const n = parseInt(String(val || "1"), 10);
  if (!isNaN(n) && n >= 1 && n <= 100) return n;
  return 1;
}

function parseOptions(obj) {
  // Named columns (opt0-opt3)
  const named = [obj.opt0, obj.opt1, obj.opt2, obj.opt3].map(o => String(o || "").trim());
  if (named.some(o => o)) return named;
  // Array column
  if (obj.options) {
    try {
      const arr = typeof obj.options === "string" ? JSON.parse(obj.options) : obj.options;
      if (Array.isArray(arr)) return arr.slice(0, 4).map(o => String(o || "").trim());
    } catch { /* ignore */ }
  }
  return ["", "", "", ""];
}

function validateRow(q, seenTexts) {
  const errs = [];
  const text = (q.question || "").trim();
  if (!text) errs.push("Question text is required");
  else if (text.length < 3) errs.push("Question too short (< 3 chars)");
  else if (text.length > 5000) errs.push("Question too long (> 5000 chars)");

  if (!VALID_TYPES.has(q.type)) errs.push(`Unknown type "${q.type}"`);

  const marks = q.marks;
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
    errs.push("Marks must be an integer 1–100");
  }

  if (q.type === "mcq" || q.type === "mcq-multi" || q.type === "true-false") {
    const opts = q.options || [];
    const minOpts = q.type === "true-false" ? 2 : 4;
    const filled = opts.filter(o => (o || "").trim()).length;
    if (filled < minOpts) errs.push(`Needs ${minOpts} non-empty options (got ${filled})`);
    if (q.type !== "mcq-multi") {
      const ca = parseInt(q.correct_answer, 10);
      if (isNaN(ca) || ca < 0 || ca >= opts.length) errs.push(`Invalid correct_answer "${q.correct_answer}"`);
      else if (!opts[ca]?.trim()) errs.push("correct_answer points to empty option");
    }
  }

  if (text && seenTexts.has(text.toLowerCase())) errs.push("Duplicate question in this file");

  return errs;
}

function buildStructuredRow(obj, rowNum, seenTexts) {
  const type = normType(obj.type);
  const question = String(obj.question || "").trim();
  const options = parseOptions(obj);
  const correct_answer = normalizeAnswer(obj.correct_answer, type);
  const marks = parseMarks(obj.marks);
  const topic = String(obj.topic || "").trim();
  const explanation = String(obj.explanation || "").trim();
  const difficulty = String(obj.difficulty || "medium").toLowerCase().trim();

  const partial = { question, type, options, correct_answer, marks };
  const _errors = validateRow(partial, seenTexts);
  if (!_errors.some(e => e.includes("Duplicate")) && question) seenTexts.add(question.toLowerCase());

  return {
    _id: `r${rowNum}-${Math.random().toString(36).slice(2, 5)}`,
    _rowNum: rowNum,
    _errors,
    _sourceType: "structured",
    question,
    type,
    options,
    correct_answer,
    marks,
    topic,
    explanation,
    difficulty,
  };
}

// ── RFC 4180 CSV parser ────────────────────────────────────────────────────────

function parseCSVText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { inQ = false; i++; continue; }
      cell += ch;
    } else {
      if (ch === '"') { inQ = true; i++; continue; }
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

// ── Format parsers ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const grid = parseCSVText(text);
  if (!grid.length) return { rows: [], fileErrors: ["File is empty"] };

  const headerRow = grid[0];
  const colMap = {};
  headerRow.forEach((h, idx) => {
    const alias = COL_ALIASES[normKey(h)];
    if (alias) colMap[idx] = alias;
  });
  const hasHeaders = Object.keys(colMap).length >= 2;
  const dataRows = hasHeaders ? grid.slice(1) : grid;
  if (!dataRows.length) return { rows: [], fileErrors: ["No data rows"] };

  const seenTexts = new Set();
  const rows = dataRows.map((cols, i) => {
    const rowNum = i + (hasHeaders ? 2 : 1);
    let obj;
    if (hasHeaders) {
      obj = {};
      Object.entries(colMap).forEach(([ci, key]) => {
        if (!obj[key]) obj[key] = (cols[Number(ci)] || "").trim();
      });
    } else {
      const [type="", question="", opt0="", opt1="", opt2="", opt3="", correct_answer="0", marks="1"] = cols.map(c => c.trim());
      obj = { type, question, opt0, opt1, opt2, opt3, correct_answer, marks };
    }
    return buildStructuredRow(obj, rowNum, seenTexts);
  });

  return { rows, fileErrors: [] };
}

function parseJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch {
    return { rows: [], fileErrors: ["Invalid JSON"] };
  }
  const arr = Array.isArray(data) ? data
    : (data && typeof data === "object" && Array.isArray(data.questions)) ? data.questions
    : [];
  if (!arr.length) return { rows: [], fileErrors: ['JSON must be an array or { questions: [...] }'] };

  const seenTexts = new Set();
  const rows = arr.map((raw, i) => {
    const rawOpts = Array.isArray(raw.options) ? raw.options : [];
    const obj = {
      type: raw.type || "mcq",
      question: raw.question || "",
      opt0: String(rawOpts[0] || "").trim(),
      opt1: String(rawOpts[1] || "").trim(),
      opt2: String(rawOpts[2] || "").trim(),
      opt3: String(rawOpts[3] || "").trim(),
      correct_answer: raw.correct_answer !== undefined ? String(raw.correct_answer) : "0",
      marks: raw.marks || 1,
      topic: raw.topic || "",
      explanation: raw.explanation || "",
      difficulty: raw.difficulty || "medium",
      metadata: raw.metadata || undefined,
    };
    const q = buildStructuredRow(obj, i + 1, seenTexts);
    if (raw.metadata) q.metadata = raw.metadata;
    return q;
  });

  return { rows, fileErrors: [] };
}

async function parseExcel(buffer, sheetName) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetNames = wb.SheetNames;
  if (!sheetNames.length) return { rows: [], fileErrors: ["Workbook has no sheets"], sheetNames, activeSheet: "" };

  const active = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const ws = wb.Sheets[active];
  if (!ws) return { rows: [], fileErrors: [`Sheet "${active}" not found`], sheetNames, activeSheet: active };

  // Read as raw arrays so we can auto-detect the header row.
  // Some sheets have a title/banner row above the real column headers.
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (!rawRows.length) return { rows: [], fileErrors: [`Sheet "${active}" is empty`], sheetNames, activeSheet: active };

  // Find the first row (within the first 5) where ≥2 cells match COL_ALIASES.
  // This handles files that have one or more title rows before the real headers.
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const matches = rawRows[i].filter(cell => COL_ALIASES[normKey(String(cell || ""))]).length;
    if (matches >= 2) { headerRowIdx = i; break; }
  }

  const headerCells = rawRows[headerRowIdx];
  const colMap = {};
  headerCells.forEach((h, idx) => {
    const alias = COL_ALIASES[normKey(String(h || ""))];
    if (alias && !(idx in colMap)) colMap[idx] = alias;
  });

  const dataRows = rawRows.slice(headerRowIdx + 1).filter(row => row.some(c => String(c || "").trim()));
  if (!dataRows.length) return { rows: [], fileErrors: [`Sheet "${active}" has no data rows`], sheetNames, activeSheet: active };

  const seenTexts = new Set();
  const rows = dataRows.map((cols, i) => {
    const obj = {};
    Object.entries(colMap).forEach(([ci, key]) => {
      if (!obj[key]) obj[key] = String(cols[Number(ci)] || "").trim();
    });
    return buildStructuredRow(obj, i + 1, seenTexts);
  });

  return { rows, fileErrors: [], sheetNames, activeSheet: active };
}

async function parseDocx(buffer) {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const text = result.value || "";
  if (!text.trim()) return { rows: [], fileErrors: ["Could not extract text from DOCX"] };
  const rows = detectAndParseQuestions(text);
  return { rows, fileErrors: [] };
}

async function parsePdf(buffer) {
  const pdfParse = require("pdf-parse");
  let text = "";
  try {
    const data = await pdfParse(Buffer.from(buffer));
    text = data.text || "";
  } catch (e) {
    return { rows: [], fileErrors: [`PDF parse error: ${e.message}`] };
  }
  if (!text.trim()) return { rows: [], fileErrors: ["No text could be extracted from PDF (may be scanned)"] };
  const rows = detectAndParseQuestions(text);
  return { rows, fileErrors: [] };
}

function parseTxt(text) {
  if (!text.trim()) return { rows: [], fileErrors: ["File is empty"] };
  const rows = detectAndParseQuestions(text);
  return { rows, fileErrors: [] };
}

async function parseZip(buffer) {
  const AdmZip = require("adm-zip");
  let zip;
  try { zip = new AdmZip(Buffer.from(buffer)); } catch {
    return { rows: [], fileErrors: ["Invalid ZIP file"] };
  }
  const entries = zip.getEntries().filter(e => !e.isDirectory);
  const allRows = [];
  const fileErrors = [];

  for (const entry of entries) {
    const name = entry.entryName.toLowerCase();
    const ext = name.split(".").pop();
    if (!ALLOWED_EXTENSIONS.has(ext) || ext === "zip") continue; // no nested ZIPs

    const entryBuffer = entry.getData();
    let result;
    try {
      if (ext === "xlsx" || ext === "xls") result = await parseExcel(entryBuffer.buffer);
      else if (ext === "csv") result = parseCSV(entryBuffer.toString("utf-8"));
      else if (ext === "json") result = parseJSON(entryBuffer.toString("utf-8"));
      else if (ext === "docx") result = await parseDocx(entryBuffer.buffer);
      else if (ext === "pdf") result = await parsePdf(entryBuffer.buffer);
      else if (ext === "txt" || ext === "md") result = parseTxt(entryBuffer.toString("utf-8"));
      else if (["png","jpg","jpeg","gif","webp"].includes(ext)) {
        result = { rows: [], fileErrors: [`${entry.entryName}: OCR not available — please extract and convert to text manually`] };
      } else continue;
    } catch (e) {
      fileErrors.push(`${entry.entryName}: ${e.message}`);
      continue;
    }

    // Tag rows with source file
    (result.rows || []).forEach(r => { r._sourceFile = entry.entryName; });
    allRows.push(...(result.rows || []));
    fileErrors.push(...(result.fileErrors || []));
  }

  // Re-number rows globally and re-check duplicates
  const seenTexts = new Set();
  allRows.forEach((r, i) => {
    r._rowNum = i + 1;
    const lc = (r.question || "").toLowerCase();
    if (lc && seenTexts.has(lc) && !r._errors.includes("Duplicate question in this file")) {
      r._errors.push("Duplicate across ZIP files");
    }
    if (lc && !r._errors.some(e => e.includes("Duplicate"))) seenTexts.add(lc);
  });

  return { rows: allRows, fileErrors };
}

function parseImage() {
  return {
    rows: [],
    fileErrors: ["Image OCR is not available in this version. Please convert your image to PDF or text and re-upload, or add questions manually."],
  };
}

// ── Virus / MIME validation ───────────────────────────────────────────────────────

function validateFileSecurity(buffer, originalname, mimetype) {
  const ext = (originalname.split(".").pop() || "").toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type .${ext} is not supported`);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB)`);
  }

  // Basic magic byte checks to catch spoofed extensions
  const sig = buffer.slice(0, 8);
  const hex = sig.toString("hex");

  if ((ext === "pdf") && !hex.startsWith("255044462d")) {
    throw new Error("File does not appear to be a valid PDF");
  }
  if ((ext === "xlsx" || ext === "xls" || ext === "docx" || ext === "zip") && !hex.startsWith("504b0304")) {
    // PK magic bytes for ZIP-based Office formats
    if (ext === "xlsx" || ext === "docx") {
      throw new Error(`File does not appear to be a valid ${ext.toUpperCase()} (expected ZIP-based format)`);
    }
  }
  if (ext === "json") {
    const preview = buffer.slice(0, 512).toString("utf-8").trim();
    if (!preview.startsWith("{") && !preview.startsWith("[")) {
      throw new Error("File does not appear to be valid JSON");
    }
  }

  // MIME validation (if provided — browser may lie, so treat as advisory)
  if (mimetype && !Object.keys(MIME_MAP).includes(mimetype) && mimetype !== "application/octet-stream") {
    // Advisory only — log but don't reject
    console.warn(`[import-parser] Unexpected MIME type "${mimetype}" for .${ext}`);
  }
}

// ── Main dispatcher ─────────────────────────────────────────────────────────────

async function parseFile(buffer, originalname, mimetype) {
  validateFileSecurity(buffer, originalname, mimetype);

  const ext = originalname.split(".").pop().toLowerCase();

  if (ext === "xlsx" || ext === "xls") return parseExcel(buffer);
  if (ext === "csv") return parseCSV(buffer.toString("utf-8"));
  if (ext === "json") return parseJSON(buffer.toString("utf-8"));
  if (ext === "docx") return parseDocx(buffer);
  if (ext === "pdf") return parsePdf(buffer);
  if (ext === "txt" || ext === "md") return parseTxt(buffer.toString("utf-8"));
  if (ext === "zip") return parseZip(buffer);
  if (["png","jpg","jpeg","gif","webp"].includes(ext)) return parseImage(buffer, originalname);

  throw new Error(`Unsupported format: .${ext}`);
}

module.exports = { parseFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE };
