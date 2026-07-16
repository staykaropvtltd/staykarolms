// backend/lib/question-detector.js
// Converts raw unstructured text (from PDF/DOCX/TXT/MD) into ParsedQuestion objects.

"use strict";

const ALL_TYPES = [
  "mcq","mcq-multi","true-false","fill-blank","short","long",
  "descriptive","coding","sql","case-study","matching","ordering","numerical","paragraph",
];

// ── Patterns ────────────────────────────────────────────────────────────────────

// Line that starts a new question block
const Q_START = /^[\s]*(?:\*{0,2}\s*)?(?:\d{1,3}[\.\)]\s+|Q\.?\s*\d{1,3}[\.\):\s]+|Question\s+\d{1,3}[\.\):\s]+)/i;
// MCQ option line: "A." "A)" "(A)" "(a)" "a."
const OPT_LINE = /^[\s]*(?:\(([A-Da-d])\)|([A-Da-d])[\.\)\-:]\s)(.+)/i;
// Answer indicator — m flag so ^ matches each line in a multi-line block
const ANS_LINE = /^[\s]*(?:ans(?:wer)?|solution|correct\s+answer|ans\.|key)[\s:\.]*([^\n]+)/im;
// Marks hint — matches "[2 marks]", "2 pts", "Marks: 3", "[3]"
const MARKS_HINT = /\bmarks?\s*[:\.\s]+\s*(\d{1,3})\b|\[?\s*(\d{1,3})\s*(?:marks?|m|pts?|points?)\s*\]?/i;
// Explanation
const EXPL_LINE = /^[\s]*(?:explanation|rationale|reason|note)[\s:\.]+/im;
// Difficulty — m flag for line-level matching in blocks
const DIFF_LINE = /\b(?:difficulty|level)[\s:\.]+\s*(easy|medium|hard)/im;
// Topic — m flag for line-level matching in blocks
const TOPIC_LINE = /\b(?:topic|category|section|chapter|unit)[\s:\.]+\s*([^\n\[\(]+)/im;
// Fill-in-blank marker
const BLANK_MARKER = /_{3,}|\.{3,}/;
// Code block
const CODE_BLOCK = /```[\s\S]*?```/;
// Coding keywords that suggest this is a coding problem
const CODING_KW = /\b(?:input\s+format|output\s+format|constraints?|sample\s+input|sample\s+output|time\s+limit|memory\s+limit|boilerplate|starter\s+code)\b/i;
// SQL keywords
const SQL_KW = /\b(?:write\s+(?:a\s+)?(?:sql\s+)?query|sql\s+query|select\s+.*\s+from|create\s+table|insert\s+into|update\s+.*\s+set)\b/i;
// Matching
const MATCH_KW = /\bmatch\s+the\s+following\b|\bcolumn[-\s]+[ai]\b.*\bcolumn[-\s]+[bi]\b/i;
// Ordering
const ORDER_KW = /\b(?:arrange|rearrange|reorder|put|place|sequence|order)\b.{0,80}\b(?:following|items?|steps?|events?|given)\b/i;
// Numerical
const NUMERICAL_KW = /\b(?:find\s+the\s+value|calculate|compute|what\s+is\s+the\s+(?:value|number|total|sum|product|result)|evaluate)\b/i;
// Long/descriptive
const LONG_KW = /\b(?:explain|describe|elaborate|discuss|analyze|analyse|critically\s+examine|compare\s+and\s+contrast|evaluate\s+the)\b/i;
// Multi-select MCQ
const MULTI_KW = /\bselect\s+all|choose\s+all|all\s+that\s+apply|multiple\s+correct|more\s+than\s+one\b/i;
// Matching pair line: "1. Python — Scripting"  or "A. Cat    I. Animal"
const PAIR_LINE = /^[\s]*(?:\d+[\.\)]\s+|[A-Za-z][\.\)]\s+)(.+?)\s*[-–—→|]+\s*(?:\d+[\.\)]\s+|[IVXivx]+[\.\)]\s+|[A-Za-z][\.\)]\s+)?(.+)/;

// ── Helpers ─────────────────────────────────────────────────────────────────────

function normId(rowNum) {
  return `r${rowNum}-${Math.random().toString(36).slice(2, 5)}`;
}

function extractOptions(block) {
  const lines = block.split("\n");
  const opts = [];
  for (const line of lines) {
    const m = line.match(OPT_LINE);
    if (m) opts.push((m[3] || "").trim());
    if (opts.length >= 4) break;
  }
  return opts;
}

function extractAnswer(block, type, options) {
  const m = block.match(ANS_LINE);
  if (!m) return type === "mcq" || type === "true-false" ? "0" : "";
  const raw = m[1].trim();

  if (type === "mcq" || type === "true-false") {
    const letter = raw.match(/^([A-Da-d])[\.\):]?/)?.[1]?.toLowerCase();
    if (letter) return String("abcd".indexOf(letter));
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0 && num <= 3) return String(num);
    const idx = options.findIndex(o => o.toLowerCase() === raw.toLowerCase());
    return idx >= 0 ? String(idx) : "0";
  }
  if (type === "mcq-multi") {
    const parts = raw.split(/[\s,]+/).filter(Boolean);
    const indices = parts.flatMap(p => {
      const l = p.toLowerCase().replace(/[.\)]/g, "");
      const li = "abcd".indexOf(l);
      if (li >= 0) return [li];
      const n = parseInt(l, 10);
      return !isNaN(n) && n >= 0 ? [n] : [];
    });
    return [...new Set(indices)].sort().join(",");
  }
  if (type === "numerical") {
    const numMatch = raw.match(/[\d.]+/);
    return numMatch ? numMatch[0] : raw;
  }
  return raw;
}

function extractMarks(block) {
  const m = block.match(MARKS_HINT);
  if (m) {
    const n = parseInt(m[1] || m[2], 10);
    if (!isNaN(n) && n >= 1 && n <= 100) return n;
  }
  return 1;
}

function extractExplanation(block) {
  const lines = block.split("\n");
  let inExpl = false;
  const parts = [];
  for (const line of lines) {
    if (EXPL_LINE.test(line)) {
      inExpl = true;
      const after = line.replace(EXPL_LINE, "").trim();
      if (after) parts.push(after);
      continue;
    }
    if (inExpl) {
      if (ANS_LINE.test(line) || /^[\s]*(?:marks?|difficulty|topic)[\s:]/i.test(line)) break;
      if (line.trim()) parts.push(line.trim());
    }
  }
  return parts.join(" ").trim();
}

function extractDifficulty(block) {
  const m = block.match(DIFF_LINE);
  return m ? m[1].toLowerCase() : "medium";
}

function extractTopic(block) {
  const m = block.match(TOPIC_LINE);
  if (!m) return "";
  return m[1].split(/[\[\(\n]/)[0].trim();
}

function extractQuestionText(block) {
  const lines = block.split("\n");
  const qLines = [];
  let pastHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (OPT_LINE.test(line) || ANS_LINE.test(line) || EXPL_LINE.test(line)) break;
    if (/^[\s]*(?:marks?|difficulty|topic|category|tags?)[\s:]/i.test(line)) break;

    if (i === 0) {
      // Strip leading question number
      const stripped = line.replace(/^[\s]*(?:\*{0,2}\s*)?(?:\d{1,3}[\.\)]\s+|Q\.?\s*\d{1,3}[\.\):\s]+|Question\s+\d{1,3}[\.\):\s]+)/i, "").replace(/\*{0,2}$/, "").trim();
      qLines.push(stripped);
    } else {
      qLines.push(line);
    }
    pastHeader = true;
  }

  return qLines.join("\n").trim();
}

function extractCodingMeta(block) {
  const get = (pattern) => {
    const m = block.match(pattern);
    return m ? m[1].trim() : "";
  };
  return {
    constraints: get(/\bconstraints?\s*:?\n+([\s\S]+?)(?=\n\s*(?:input|output|sample|example|note|time|memory|\d+\.)|$)/i),
    input_format: get(/\binput\s+format\s*:?\n+([\s\S]+?)(?=\n\s*(?:output|sample|example|\d+\.)|$)/i),
    output_format: get(/\boutput\s+format\s*:?\n+([\s\S]+?)(?=\n\s*(?:input|sample|example|\d+\.)|$)/i),
    sample_input: get(/\bsample\s+input\s*:?\n+([\s\S]+?)(?=\n\s*(?:sample\s+output|output|example\s+output|\d+\.)|$)/i),
    sample_output: get(/\b(?:sample|expected)\s+output\s*:?\n+([\s\S]+?)(?=\n\s*(?:sample\s+input|input|note|\d+\.)|$)/i),
    time_limit_ms: (() => { const m = block.match(/\btime\s+limit\s*:?\s*([\d.]+)\s*(ms|milliseconds?|s|seconds?)/i); if (!m) return null; const v = parseFloat(m[1]); return m[2].toLowerCase().startsWith("s") ? Math.round(v * 1000) : Math.round(v); })(),
    memory_limit_mb: (() => { const m = block.match(/\bmemory\s+limit\s*:?\s*([\d.]+)\s*(mb|megabytes?|gb|gigabytes?)/i); if (!m) return null; const v = parseFloat(m[1]); return m[2].toLowerCase().startsWith("g") ? Math.round(v * 1024) : Math.round(v); })(),
  };
}

function extractMatchingPairs(block) {
  const lines = block.split("\n");
  const pairs = [];
  let inPairs = false;

  for (const line of lines) {
    if (MATCH_KW.test(line)) { inPairs = true; continue; }
    if (!inPairs) continue;
    if (ANS_LINE.test(line) || EXPL_LINE.test(line)) break;
    const m = line.match(PAIR_LINE);
    if (m) pairs.push({ left: m[1].trim(), right: m[2].trim() });
  }

  if (!pairs.length) {
    // Try to find two-column format after question text
    const half = Math.ceil(lines.length / 2);
    for (let i = 0; i < half; i++) {
      const m = lines[i + half]?.match(/^[\s]*(?:[A-Za-z\d]+[\.\)]\s*)(.+)/);
      const n = lines[i]?.match(/^[\s]*(?:[A-Za-z\d]+[\.\)]\s*)(.+)/);
      if (m && n) pairs.push({ left: n[1].trim(), right: m[1].trim() });
    }
  }
  return pairs;
}

function extractOrderingItems(block) {
  const lines = block.split("\n");
  const items = [];
  let inItems = false;

  for (const line of lines) {
    if (ORDER_KW.test(line)) { inItems = true; continue; }
    if (!inItems && Q_START.test(line)) { inItems = true; continue; }
    if (!inItems) continue;
    if (ANS_LINE.test(line) || EXPL_LINE.test(line)) break;
    const m = line.match(/^[\s]*(?:[A-Da-d][\.\)]\s+|\d+[\.\)]\s+)(.+)/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function padOptions(opts, type) {
  if (type === "true-false") return ["True", "False"];
  if (type === "mcq" || type === "mcq-multi") {
    const arr = [...opts];
    while (arr.length < 4) arr.push("");
    return arr.slice(0, 4);
  }
  return opts;
}

function detectType(block) {
  // Coding / SQL (check before MCQ because coding q's may have numbered sub-items)
  if (CODE_BLOCK.test(block) || CODING_KW.test(block)) return "coding";
  if (SQL_KW.test(block)) return "sql";

  // Matching
  if (MATCH_KW.test(block)) return "matching";

  // Ordering
  if (ORDER_KW.test(block)) return "ordering";

  // MCQ variants
  const opts = extractOptions(block);
  if (opts.length >= 2) {
    // True/False
    if (opts.length === 2 && opts.every(o => /^(true|false)$/i.test(o.trim()))) return "true-false";
    // Multiple correct
    if (MULTI_KW.test(block)) return "mcq-multi";
    return "mcq";
  }

  // Fill in blank
  if (BLANK_MARKER.test(block)) return "fill-blank";

  // Numerical
  if (NUMERICAL_KW.test(block)) return "numerical";

  // Descriptive / long
  if (LONG_KW.test(block) && block.length > 150) return "long";

  return "short";
}

function validateQuestion(q) {
  const errs = [];
  const text = (q.question || "").trim();
  if (!text) errs.push("Question text is required");
  else if (text.length < 3) errs.push("Question too short");
  else if (text.length > 5000) errs.push("Question too long (> 5000 chars)");

  const m = q.marks;
  if (!Number.isInteger(m) || m < 1 || m > 100) errs.push("Marks must be 1–100");

  if (q.type === "mcq" || q.type === "mcq-multi" || q.type === "true-false") {
    const opts = q.options || [];
    const filled = opts.filter(o => (o || "").trim()).length;
    const minOpts = q.type === "true-false" ? 2 : 4;
    if (filled < minOpts) errs.push(`Needs ${minOpts} non-empty options (got ${filled})`);
    if (q.type !== "mcq-multi") {
      const ca = parseInt(q.correct_answer, 10);
      if (isNaN(ca) || ca < 0 || ca >= opts.length) errs.push(`Invalid correct answer "${q.correct_answer}"`);
      else if (!opts[ca]?.trim()) errs.push("Correct answer points to empty option");
    }
  }

  return errs;
}

// ── Block splitter ───────────────────────────────────────────────────────────────

function splitIntoBlocks(text) {
  const lines = text.split("\n");
  const blockStarts = [];

  for (let i = 0; i < lines.length; i++) {
    if (Q_START.test(lines[i]) && lines[i].trim().length > 3) {
      blockStarts.push(i);
    }
  }

  if (!blockStarts.length) return [text]; // treat entire text as one block

  const blocks = [];
  for (let i = 0; i < blockStarts.length; i++) {
    const from = blockStarts[i];
    const to = blockStarts[i + 1] ?? lines.length;
    const block = lines.slice(from, to).join("\n").trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

// ── Main export ─────────────────────────────────────────────────────────────────

function detectAndParseQuestions(text) {
  if (!text || !text.trim()) return [];

  const blocks = splitIntoBlocks(text.trim());
  const seenTexts = new Set();
  const results = [];

  blocks.forEach((block, idx) => {
    const rowNum = idx + 1;
    const type = detectType(block);

    let options = [];
    let metadata = {};

    if (type === "mcq" || type === "mcq-multi" || type === "true-false") {
      options = padOptions(extractOptions(block), type);
    } else if (type === "matching") {
      const pairs = extractMatchingPairs(block);
      metadata = { pairs };
      options = pairs.map(p => `${p.left} → ${p.right}`);
    } else if (type === "ordering") {
      const items = extractOrderingItems(block);
      metadata = { items };
      options = items;
    } else if (type === "coding" || type === "sql") {
      metadata = extractCodingMeta(block);
    }

    const questionText = extractQuestionText(block);
    const correct_answer = extractAnswer(block, type, options);
    const marks = extractMarks(block);
    const explanation = extractExplanation(block);
    const difficulty = extractDifficulty(block);
    const topic = extractTopic(block);

    const partial = { question: questionText, type, options, correct_answer, marks };
    const _errors = validateQuestion(partial);

    const lc = questionText.toLowerCase();
    if (_errors.length === 0 && lc && seenTexts.has(lc)) {
      _errors.push("Duplicate question in this file");
    }
    if (!_errors.some(e => e.includes("Duplicate")) && lc) seenTexts.add(lc);

    results.push({
      _id: normId(rowNum),
      _rowNum: rowNum,
      _errors,
      _sourceType: "text",
      question: questionText,
      type,
      options,
      correct_answer,
      marks,
      explanation,
      difficulty,
      topic,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  });

  return results;
}

module.exports = { detectAndParseQuestions, ALL_TYPES };
