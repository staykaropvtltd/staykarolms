import { useState, useEffect } from "react";
import {
  X, ChevronLeft, Download, Printer, FileText, FileSpreadsheet,
  BarChart3, Trophy, Target, Users, Clock, CheckCircle2, XCircle,
  Search, ArrowUp, ArrowDown, ArrowUpDown, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { getTestAnalytics, getAttemptResult } from "@/shared/lib/api";
import { toast } from "sonner";

// ────────────────────────────────────────── Types ─────────────────────────────

interface ProfileInfo {
  id: string;
  name: string;
  email: string;
  roll_number: string | null;
}

interface AttemptRow {
  id: string;
  status: string;
  score: number | null;
  started_at: string;
  submitted_at: string | null;
  correct: number;
  wrong: number;
  answered: number;
  unanswered: number;
  time_taken_secs: number | null;
  percentage: number;
  max_score: number;
  profiles: ProfileInfo;
}

interface QuestionStat {
  id: string;
  question: string;
  type: string;
  marks: number;
  options: string[] | null;
  correct_answer: string | null;
  order_index: number;
  stats: { total: number; correct: number };
}

interface AnalyticsData {
  test: {
    id: string;
    title: string;
    type: string;
    duration_mins: number;
    batch: { name: string } | null;
  };
  attempts: AttemptRow[];
  questions: QuestionStat[];
  max_score: number;
  total_questions: number;
}

// ────────────────────────────────────────── Helpers ───────────────────────────

const PASS_THRESHOLD = 40;

function fmtTime(secs: number | null): string {
  if (secs == null || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type SortKey =
  | "rank" | "name" | "roll" | "score" | "pct"
  | "correct" | "wrong" | "unanswered" | "time" | "submitted";

function sortAttempts(
  list: AttemptRow[],
  key: SortKey,
  dir: "asc" | "desc"
): AttemptRow[] {
  return [...list].sort((a, b) => {
    let av: string | number, bv: string | number;
    switch (key) {
      case "name":       av = a.profiles?.name?.toLowerCase() ?? ""; bv = b.profiles?.name?.toLowerCase() ?? ""; break;
      case "roll":       av = a.profiles?.roll_number ?? ""; bv = b.profiles?.roll_number ?? ""; break;
      case "score":      av = a.score ?? -1; bv = b.score ?? -1; break;
      case "pct":        av = a.percentage; bv = b.percentage; break;
      case "correct":    av = a.correct; bv = b.correct; break;
      case "wrong":      av = a.wrong; bv = b.wrong; break;
      case "unanswered": av = a.unanswered; bv = b.unanswered; break;
      case "time":       av = a.time_taken_secs ?? Infinity; bv = b.time_taken_secs ?? Infinity; break;
      case "submitted":  av = a.submitted_at ?? ""; bv = b.submitted_at ?? ""; break;
      default:           return 0;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function blobDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escCsv(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function doExportCSV(ranked: AttemptRow[], title: string, batchName: string) {
  const H = [
    "Rank", "Student Name", "Roll Number", "Email", "Batch",
    "Score", "Max Score", "Percentage",
    "Correct", "Wrong", "Unanswered",
    "Time Taken", "Submitted At", "Status",
  ];
  const rows = ranked.map((a, i) => [
    i + 1, a.profiles?.name ?? "", a.profiles?.roll_number ?? "",
    a.profiles?.email ?? "", batchName,
    a.score ?? 0, a.max_score, `${a.percentage}%`,
    a.correct, a.wrong, a.unanswered,
    fmtTime(a.time_taken_secs),
    a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "",
    a.status,
  ]);
  const csv = [H, ...rows].map(r => r.map(escCsv).join(",")).join("\r\n");
  blobDownload("﻿" + csv, `${title}-results.csv`, "text/csv;charset=utf-8;");
  toast.success("CSV downloaded");
}

function doExportExcel(ranked: AttemptRow[], title: string, batchName: string) {
  const H = [
    "Rank", "Student Name", "Roll Number", "Email", "Batch",
    "Score", "Max Score", "Percentage",
    "Correct", "Wrong", "Unanswered", "Time Taken", "Submitted At",
  ];
  const rows = ranked.map((a, i) => [
    i + 1, a.profiles?.name ?? "", a.profiles?.roll_number ?? "",
    a.profiles?.email ?? "", batchName,
    a.score ?? 0, a.max_score, `${a.percentage}%`,
    a.correct, a.wrong, a.unanswered,
    fmtTime(a.time_taken_secs),
    a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "",
  ]);
  const tHead = `<tr style="background:#f5f0e8;font-weight:bold">${H.map(h => `<th>${escHtml(h)}</th>`).join("")}</tr>`;
  const tBody = rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1">${tHead}${tBody}</table></body></html>`;
  blobDownload(html, `${title}-results.xls`, "application/vnd.ms-excel;charset=utf-8;");
  toast.success("Excel file downloaded");
}

async function doExportPDF(ranked: AttemptRow[], title: string, batchName: string) {
  toast.info("Generating PDF…");
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new (jsPDF as any)({ orientation: "landscape", unit: "mm", format: "a4" });

    const margin = 12;
    const pageW: number = doc.internal.pageSize.getWidth();
    let y = 18;

    doc.setFontSize(13);
    doc.setTextColor(40);
    doc.text(`${title} — Leaderboard`, margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Batch: ${batchName}   |   Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 8;

    const cols = [
      { label: "Rank",        w: 11 },
      { label: "Name",        w: 40 },
      { label: "Roll No",     w: 22 },
      { label: "Email",       w: 50 },
      { label: "Score",       w: 18 },
      { label: "%",           w: 12 },
      { label: "Correct",     w: 16 },
      { label: "Wrong",       w: 14 },
      { label: "Unanswered",  w: 20 },
      { label: "Time",        w: 20 },
    ];
    const rowH = 6.5;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(50);
    doc.setFillColor(245, 240, 232);
    doc.setDrawColor(210, 200, 185);
    let x = margin;
    cols.forEach(col => {
      doc.rect(x, y, col.w, rowH, "FD");
      doc.text(col.label, x + 1.5, y + 4.2);
      x += col.w;
    });
    y += rowH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    ranked.forEach((a, i) => {
      if (y + rowH > (doc.internal.pageSize.getHeight() as number) - 14) {
        doc.addPage();
        y = 16;
      }
      const bg = i % 2 === 0 ? [255, 255, 255] : [250, 248, 245];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.setDrawColor(225, 218, 208);
      x = margin;
      const cells = [
        String(i + 1),
        (a.profiles?.name ?? "").slice(0, 22),
        (a.profiles?.roll_number ?? "—").slice(0, 12),
        (a.profiles?.email ?? "").slice(0, 28),
        `${a.score ?? 0}/${a.max_score}`,
        `${a.percentage}%`,
        String(a.correct),
        String(a.wrong),
        String(a.unanswered),
        fmtTime(a.time_taken_secs),
      ];
      doc.setTextColor(a.percentage >= PASS_THRESHOLD ? 30 : 180, 30, 30);
      cols.forEach((col, ci) => {
        doc.rect(x, y, col.w, rowH, "FD");
        doc.setTextColor(30);
        if (ci === 5) doc.setTextColor(a.percentage >= PASS_THRESHOLD ? 22 : 200, a.percentage >= PASS_THRESHOLD ? 130 : 30, 22);
        doc.text(cells[ci], x + 1.5, y + 4.2);
        doc.setTextColor(30);
        x += col.w;
      });
      y += rowH;
    });

    doc.save(`${title}-results.pdf`);
    toast.success("PDF downloaded");
  } catch (err) {
    console.error("[PDF export]", err);
    toast.error("Failed to generate PDF");
  }
}

function doPrint(ranked: AttemptRow[], title: string, batchName: string, maxScore: number) {
  const rows = ranked
    .map(
      (a, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(a.profiles?.name)}</td>
      <td>${escHtml(a.profiles?.roll_number ?? "—")}</td>
      <td>${escHtml(a.profiles?.email)}</td>
      <td>${escHtml(batchName)}</td>
      <td>${a.score ?? 0}/${maxScore}</td>
      <td style="color:${a.percentage >= PASS_THRESHOLD ? "#16a34a" : "#dc2626"}">${a.percentage}%</td>
      <td>${a.correct}</td><td>${a.wrong}</td><td>${a.unanswered}</td>
      <td>${fmtTime(a.time_taken_secs)}</td>
      <td>${escHtml(a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—")}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><title>${escHtml(title)} — Results</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:18px}
  h1{font-size:15px;margin:0 0 3px}p.sub{color:#666;margin:0 0 14px;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th{background:#f5f0e8;font-weight:700;padding:6px 7px;border:1px solid #ccc;text-align:left;font-size:10px}
  td{padding:5px 7px;border:1px solid #e5e5e5}
  tr:nth-child(even) td{background:#faf9f7}
  @media print{@page{margin:12mm}button{display:none}}
</style></head><body>
<h1>${escHtml(title)} — Leaderboard</h1>
<p class="sub">Batch: ${escHtml(batchName)} &nbsp;|&nbsp; Printed: ${new Date().toLocaleString()}</p>
<table><thead><tr>
  <th>Rank</th><th>Name</th><th>Roll No</th><th>Email</th><th>Batch</th>
  <th>Score</th><th>%</th><th>Correct</th><th>Wrong</th><th>Unanswered</th>
  <th>Time</th><th>Submitted</th>
</tr></thead><tbody>${rows}</tbody></table>
<br><button onclick="window.print()">Print</button>
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) { toast.error("Allow pop-ups to use Print"); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ────────────────────────────────── AttemptDetailView ────────────────────────

function AttemptDetailView({
  attempt,
  onBack,
  onClose,
}: {
  attempt: AttemptRow;
  onBack: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAttemptResult(attempt.id).then(({ data }) => {
      setDetail(data);
      setLoading(false);
    });
  }, [attempt.id]);

  const answers: any[] = detail?.test_answers ?? [];
  const totalPossible = answers.reduce((s: number, a: any) => s + (a.test_questions?.marks ?? 0), 0);
  const score = detail?.score ?? 0;
  const pct = totalPossible > 0 ? Math.round((score / totalPossible) * 100) : 0;
  const correctCount = answers.filter((a: any) => a.is_correct).length;
  const wrongCount   = answers.filter((a: any) => !a.is_correct && (a.answer != null && a.answer !== "")).length;
  const unanswered   = answers.filter((a: any) => a.answer == null || a.answer === "").length;

  const resolveOpt = (opts: string[] | null, idx: string | null) => {
    if (!Array.isArray(opts) || idx == null || idx === "") return null;
    const i = parseInt(idx);
    if (isNaN(i) || i < 0 || i >= opts.length) return null;
    return { letter: String.fromCharCode(65 + i), text: opts[i] };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <button onClick={onBack} title="Back to leaderboard"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate">{attempt.profiles?.name ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {attempt.profiles?.email}
            {attempt.profiles?.roll_number && (
              <span className="ml-2 opacity-60">· Roll: {attempt.profiles.roll_number}</span>
            )}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading attempt…</span>
        </div>
      ) : !detail ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="w-10 h-10 opacity-30" />
          <p>Could not load attempt details.</p>
        </div>
      ) : (
        <>
          {/* Score strip */}
          <div className="grid grid-cols-5 border-b border-border shrink-0">
            {[
              { label: "Score",       value: `${score}/${totalPossible}`, cls: "text-foreground" },
              { label: "Percentage",  value: `${pct}%`,  cls: pct >= PASS_THRESHOLD ? "text-green-500" : "text-red-500" },
              { label: "Correct",     value: correctCount, cls: "text-green-500" },
              { label: "Wrong",       value: wrongCount,   cls: "text-red-500" },
              { label: "Unanswered",  value: unanswered,   cls: "text-muted-foreground" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-center py-4 border-r border-border last:border-r-0">
                <p className={`text-xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Sub-header meta */}
          <div className="flex items-center gap-4 px-5 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground shrink-0">
            <span>Time: <strong>{fmtTime(attempt.time_taken_secs)}</strong></span>
            <span>Submitted: <strong>{fmtDate(attempt.submitted_at)}</strong></span>
            <span className={`ml-auto font-bold ${pct >= PASS_THRESHOLD ? "text-green-600" : "text-red-500"}`}>
              {pct >= PASS_THRESHOLD ? "PASSED" : "FAILED"}
            </span>
          </div>

          {/* Questions */}
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {answers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No answers were recorded for this attempt.</p>
              </div>
            )}
            {answers.map((ans: any, i: number) => {
              const q = ans.test_questions;
              if (!q) return null;
              const opts: string[] = Array.isArray(q.options) ? q.options : [];
              const isMcq = q.type === "mcq";
              const studentIdx = (ans.answer != null && ans.answer !== "") ? parseInt(ans.answer) : null;
              const correctIdx  = q.correct_answer != null ? parseInt(q.correct_answer) : null;
              const isCorrect   = ans.is_correct;
              const hasAnswer   = ans.answer != null && ans.answer !== "";
              const marksAwarded = ans.marks_awarded ?? 0;

              return (
                <div key={ans.id} className={`border rounded-xl overflow-hidden ${
                  isCorrect  ? "border-green-500/25" :
                  hasAnswer  ? "border-red-400/25" :
                               "border-border"
                }`}>
                  {/* Row header */}
                  <div className={`flex items-center justify-between gap-4 px-4 py-3 ${
                    isCorrect ? "bg-green-500/5" : hasAnswer ? "bg-red-500/5" : "bg-muted/20"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-black text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                        q.type === "mcq"    ? "bg-blue-500/10 text-blue-600" :
                        q.type === "coding" ? "bg-purple-500/10 text-purple-600" :
                                              "bg-slate-500/10 text-slate-600"
                      }`}>{q.type}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${
                        isCorrect  ? "bg-green-500/10 text-green-600" :
                        hasAnswer  ? "bg-red-500/10 text-red-500" :
                                     "bg-muted text-muted-foreground"
                      }`}>
                        {isCorrect  ? <CheckCircle2 className="w-3 h-3" /> :
                         hasAnswer  ? <XCircle className="w-3 h-3" /> :
                                      <Minus className="w-3 h-3" />}
                        {isCorrect ? "Correct" : hasAnswer ? "Wrong" : "Unanswered"}
                      </span>
                      <span className={`text-sm font-bold ${isCorrect ? "text-green-600" : "text-muted-foreground"}`}>
                        {marksAwarded}/{q.marks}
                      </span>
                    </div>
                  </div>

                  {/* Question text */}
                  <p className="px-4 py-3 text-sm font-medium text-foreground leading-snug">{q.question}</p>

                  {/* MCQ — all options */}
                  {isMcq && opts.length > 0 && (
                    <div className="px-4 pb-4 grid sm:grid-cols-2 gap-2">
                      {opts.map((opt, idx) => {
                        const isStu = studentIdx === idx;
                        const isCor = correctIdx === idx;
                        let cardCls = "border-border bg-muted/20 text-muted-foreground";
                        if (isCor && isStu)       cardCls = "border-green-500/60 bg-green-500/10 text-green-700";
                        else if (isCor)            cardCls = "border-green-400/40 bg-green-500/5 text-green-700";
                        else if (isStu && !isCorrect) cardCls = "border-red-400/40 bg-red-500/5 text-red-600";
                        return (
                          <div key={idx} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-sm ${cardCls}`}>
                            <span className={`w-5 h-5 rounded-md shrink-0 text-xs font-black flex items-center justify-center ${
                              isCor                     ? "bg-green-500 text-white" :
                              (isStu && !isCorrect)     ? "bg-red-400 text-white" :
                                                          "bg-muted-foreground/20 text-muted-foreground"
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="flex-1 leading-snug">{opt}</span>
                            {isStu && !isCor && (
                              <span className="text-xs font-semibold text-red-500 shrink-0">← You</span>
                            )}
                            {isCor && isStu && (
                              <span className="text-xs font-semibold text-green-600 shrink-0">✓ You</span>
                            )}
                            {isCor && !isStu && (
                              <span className="text-xs font-semibold text-green-600 shrink-0">✓ Correct</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Text answer */}
                  {!isMcq && (
                    <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3">
                      <div className={`rounded-lg p-3 border ${
                        isCorrect   ? "border-green-500/30 bg-green-500/5" :
                        hasAnswer   ? "border-red-400/30 bg-red-500/5" :
                                      "border-border bg-muted/20"
                      }`}>
                        <p className="text-xs font-bold text-muted-foreground mb-1">Student's Answer</p>
                        <p className={`text-sm font-medium whitespace-pre-wrap ${
                          isCorrect  ? "text-green-700" :
                          hasAnswer  ? "text-red-600" :
                                       "text-muted-foreground italic"
                        }`}>{ans.answer || "No answer"}</p>
                      </div>
                      {q.correct_answer && (
                        <div className="rounded-lg p-3 border border-green-500/30 bg-green-500/5">
                          <p className="text-xs font-bold text-muted-foreground mb-1">Expected Answer</p>
                          <p className="text-sm font-medium text-green-700 whitespace-pre-wrap">{q.correct_answer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────── OverviewTab ──────────────────────────

function OverviewTab({ data }: { data: AnalyticsData }) {
  const submitted   = data.attempts.filter(a => a.status === "submitted");
  const inProgress  = data.attempts.filter(a => a.status !== "submitted");

  if (submitted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Users className="w-12 h-12 opacity-20 mb-3" />
        <p className="font-medium">No submitted attempts yet</p>
        <p className="text-sm mt-1">Stats will appear once students complete the test.</p>
      </div>
    );
  }

  const scores    = submitted.map(a => a.score ?? 0);
  const avgScore  = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const highScore = Math.max(...scores);
  const lowScore  = Math.min(...scores);
  const avgPct    = Math.round(submitted.reduce((s, a) => s + a.percentage, 0) / submitted.length);
  const passCount = submitted.filter(a => a.percentage >= PASS_THRESHOLD).length;
  const failCount = submitted.length - passCount;
  const passRate  = Math.round((passCount / submitted.length) * 100);
  const failRate  = 100 - passRate;
  const timeSamples = submitted.filter(a => a.time_taken_secs != null).map(a => a.time_taken_secs!);
  const avgTime   = timeSamples.length
    ? Math.round(timeSamples.reduce((s, v) => s + v, 0) / timeSamples.length)
    : null;

  const cards = [
    { label: "Total Attempts",   value: data.attempts.length,           sub: `${submitted.length} submitted · ${inProgress.length} in progress`,              icon: Users,         cls: "text-foreground" },
    { label: "Avg Score",        value: `${avgScore}/${data.max_score}`, sub: `${avgPct}% average`,                                                            icon: Target,        cls: "text-[var(--gold)]" },
    { label: "Highest Score",    value: `${highScore}/${data.max_score}`,sub: `${Math.round((highScore / Math.max(data.max_score, 1)) * 100)}%`,                icon: TrendingUp,    cls: "text-green-500" },
    { label: "Lowest Score",     value: `${lowScore}/${data.max_score}`, sub: `${Math.round((lowScore / Math.max(data.max_score, 1)) * 100)}%`,                 icon: TrendingDown,  cls: "text-red-500" },
    { label: "Pass Rate",        value: `${passRate}%`,                  sub: `${passCount} passed (≥${PASS_THRESHOLD}%)`,                                     icon: CheckCircle2,  cls: "text-green-500" },
    { label: "Fail Rate",        value: `${failRate}%`,                  sub: `${failCount} failed`,                                                            icon: XCircle,       cls: "text-red-500" },
    { label: "Avg Completion",   value: fmtTime(avgTime),                sub: `of ${data.test.duration_mins} min allowed`,                                      icon: Clock,         cls: "text-blue-500" },
    { label: "Total Questions",  value: data.total_questions,            sub: `${data.max_score} total marks`,                                                   icon: BarChart3,     cls: "text-muted-foreground" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(({ label, value, sub, icon: Icon, cls }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
              <Icon className={`w-4 h-4 ${cls} opacity-60 shrink-0`} />
            </div>
            <p className={`text-2xl font-black ${cls} tabular-nums`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Pass / Fail bar */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-semibold mb-4">Pass vs Fail Distribution</h4>
        <div className="flex h-7 rounded-full overflow-hidden gap-px bg-muted">
          <div
            className="bg-green-500 flex items-center justify-center text-xs font-bold text-white transition-all"
            style={{ width: `${passRate}%` }}
          >
            {passRate >= 12 && `${passRate}% Pass`}
          </div>
          <div
            className="bg-red-400 flex items-center justify-center text-xs font-bold text-white transition-all"
            style={{ width: `${failRate}%` }}
          >
            {failRate >= 12 && `${failRate}% Fail`}
          </div>
        </div>
        <div className="flex items-center gap-6 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            Pass ≥ {PASS_THRESHOLD}%: <strong className="text-foreground">{passCount}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            Fail: <strong className="text-foreground">{failCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────── LeaderboardTab ───────────────────────────

function LeaderboardTab({
  data,
  onSelectAttempt,
}: {
  data: AnalyticsData;
  onSelectAttempt: (a: AttemptRow) => void;
}) {
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const batchName = data.test.batch?.name ?? "All Batches";
  const submitted = data.attempts.filter(a => a.status === "submitted");

  // Canonical rank order = score desc
  const ranked = sortAttempts(submitted, "pct", "desc");
  const rankMap = new Map(ranked.map((a, i) => [a.id, i + 1]));

  // User-driven sort + search
  const filtered = sortAttempts(
    submitted.filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        a.profiles?.name?.toLowerCase().includes(q) ||
        a.profiles?.email?.toLowerCase().includes(q) ||
        (a.profiles?.roll_number ?? "").toLowerCase().includes(q)
      );
    }),
    sortKey,
    sortDir
  );

  const inProgress = data.attempts.filter(a => a.status !== "submitted");

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SIcon = ({ k }: { k: SortKey }) =>
    k !== sortKey
      ? <ArrowUpDown className="w-3 h-3 opacity-30" />
      : sortDir === "asc"
        ? <ArrowUp className="w-3 h-3 text-primary" />
        : <ArrowDown className="w-3 h-3 text-primary" />;

  const TH = ({
    label, k, className = "",
  }: { label: string; k: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(k)}
      className={`px-3 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap transition-colors ${className}`}
    >
      <span className="flex items-center gap-1">{label}<SIcon k={k} /></span>
    </th>
  );

  if (submitted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Trophy className="w-12 h-12 opacity-20 mb-3" />
        <p className="font-medium">No submitted attempts yet</p>
        <p className="text-sm mt-1">The leaderboard will appear once students submit.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 shrink-0 bg-card">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, roll no, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length}/{submitted.length} shown
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {([
            { label: "CSV",   icon: FileText,        action: () => doExportCSV(ranked, data.test.title, batchName) },
            { label: "Excel", icon: FileSpreadsheet,  action: () => doExportExcel(ranked, data.test.title, batchName) },
            { label: "PDF",   icon: Download,        action: () => doExportPDF(ranked, data.test.title, batchName) },
            { label: "Print", icon: Printer,         action: () => doPrint(ranked, data.test.title, batchName, data.max_score) },
          ] as const).map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
              title={`Download ${label}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
              <TH label="Student"    k="name" />
              <TH label="Roll No"    k="roll" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Email</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Batch</th>
              <TH label="Score"      k="score" />
              <TH label="%"          k="pct" />
              <TH label="Correct"    k="correct" />
              <TH label="Wrong"      k="wrong" />
              <TH label="Unanswered" k="unanswered" />
              <TH label="Time"       k="time" />
              <TH label="Submitted"  k="submitted" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(attempt => {
              const rank   = rankMap.get(attempt.id) ?? 0;
              const passed = attempt.percentage >= PASS_THRESHOLD;
              return (
                <tr
                  key={attempt.id}
                  onClick={() => onSelectAttempt(attempt)}
                  className="hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 w-10">
                    {rank === 1 ? <span title="1st">🥇</span>
                    : rank === 2 ? <span title="2nd">🥈</span>
                    : rank === 3 ? <span title="3rd">🥉</span>
                    : <span className="text-sm font-bold text-muted-foreground">{rank}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {attempt.profiles?.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium text-foreground max-w-[140px] truncate">
                        {attempt.profiles?.name ?? "Unknown"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {attempt.profiles?.roll_number ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                    {attempt.profiles?.email ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{batchName}</td>
                  <td className="px-3 py-3 font-bold">
                    {attempt.score ?? 0}
                    <span className="text-muted-foreground font-normal text-xs">/{attempt.max_score}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      passed ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"
                    }`}>
                      {attempt.percentage}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-green-600 font-semibold tabular-nums">{attempt.correct}</td>
                  <td className="px-3 py-3 text-red-500 font-semibold tabular-nums">{attempt.wrong}</td>
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">{attempt.unanswered}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(attempt.time_taken_secs)}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(attempt.submitted_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-muted-foreground text-sm">No results match your search.</div>
        )}

        {/* In-progress */}
        {inProgress.length > 0 && (
          <div className="px-4 py-3 border-t border-dashed border-border bg-yellow-500/5">
            <p className="text-xs font-bold text-yellow-600 mb-2 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> In Progress ({inProgress.length})
            </p>
            <div className="space-y-1.5">
              {inProgress.map(a => (
                <div key={a.id} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {a.profiles?.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="font-medium">{a.profiles?.name ?? "Unknown"}</span>
                  <span>{a.profiles?.email ?? ""}</span>
                  <span className="ml-auto">Started {fmtDate(a.started_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────── QuestionTab ──────────────────────────────

function QuestionTab({ data }: { data: AnalyticsData }) {
  const submitted = data.attempts.filter(a => a.status === "submitted").length;

  if (submitted === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <BarChart3 className="w-12 h-12 opacity-20 mb-3" />
        <p className="font-medium">No data yet</p>
        <p className="text-sm mt-1">Question analytics appear after students submit.</p>
      </div>
    );
  }

  const qs = data.questions.map(q => ({
    ...q,
    accuracy:
      q.type === "mcq" && q.stats.total > 0
        ? Math.round((q.stats.correct / q.stats.total) * 100)
        : null,
  }));

  const mcqOnly = qs.filter(q => q.accuracy !== null);
  const hardest = mcqOnly.length
    ? [...mcqOnly].sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))[0]
    : null;
  const easiest = mcqOnly.length
    ? [...mcqOnly].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0]
    : null;

  return (
    <div className="p-6 space-y-5">
      {/* Callout cards */}
      {(hardest || easiest) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {hardest && (
            <div className="bg-red-500/5 border border-red-400/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Hardest Question</span>
              </div>
              <p className="text-sm font-medium text-foreground line-clamp-2">{hardest.question}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Only <strong>{hardest.accuracy}%</strong> of students answered correctly
              </p>
            </div>
          )}
          {easiest && easiest.id !== hardest?.id && (
            <div className="bg-green-500/5 border border-green-400/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-xs font-bold text-green-600 uppercase tracking-wide">Easiest Question</span>
              </div>
              <p className="text-sm font-medium text-foreground line-clamp-2">{easiest.question}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                <strong>{easiest.accuracy}%</strong> of students answered correctly
              </p>
            </div>
          )}
        </div>
      )}

      {/* Per-question table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["#", "Question", "Type", "Marks", "Attempted", "Correct", "Accuracy"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {qs.map((q, i) => {
              const pct = q.accuracy;
              const bar = pct === null ? "bg-muted"
                        : pct >= 70   ? "bg-green-500"
                        : pct >= 40   ? "bg-yellow-500"
                                      : "bg-red-500";
              const pctCls = pct === null ? "text-muted-foreground"
                           : pct >= 70   ? "text-green-600"
                           : pct >= 40   ? "text-yellow-600"
                                         : "text-red-500";
              const isHardest = hardest?.id === q.id;
              const isEasiest = easiest?.id === q.id && easiest.id !== hardest?.id;

              return (
                <tr key={q.id} className={`transition-colors hover:bg-muted/30 ${
                  isHardest ? "bg-red-500/5" : isEasiest ? "bg-green-500/5" : ""
                }`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{q.question}</p>
                    {isHardest && <span className="text-xs text-red-500 font-bold">⚠ Hardest</span>}
                    {isEasiest && <span className="text-xs text-green-600 font-bold">✓ Easiest</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      q.type === "mcq"    ? "bg-blue-500/10 text-blue-600" :
                      q.type === "coding" ? "bg-purple-500/10 text-purple-600" :
                                            "bg-slate-500/10 text-slate-600"
                    }`}>{q.type.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-foreground tabular-nums">{q.marks}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{q.stats.total}</td>
                  <td className="px-4 py-3 text-green-600 font-semibold tabular-nums">{q.stats.correct}</td>
                  <td className="px-4 py-3">
                    {pct === null ? (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    ) : (
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-9 text-right tabular-nums ${pctCls}`}>{pct}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────── Main component ───────────────────────────

type Tab = "overview" | "leaderboard" | "questions";

export function TestAnalyticsModal({
  test,
  onClose,
}: {
  test: any;
  onClose: () => void;
}) {
  const [data,             setData]            = useState<AnalyticsData | null>(null);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState<string | null>(null);
  const [activeTab,        setActiveTab]       = useState<Tab>("overview");
  const [selectedAttempt,  setSelectedAttempt] = useState<AttemptRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getTestAnalytics(test.id).then(({ data: d, error: e }) => {
      if (e || !d) setError(e ?? "Failed to load analytics");
      else setData(d);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [test.id]);

  const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: "overview",    label: "Overview",    Icon: BarChart3 },
    { key: "leaderboard", label: "Leaderboard", Icon: Trophy    },
    { key: "questions",   label: "Questions",   Icon: Target    },
  ];

  const typeLabel = test.type === "coding"   ? "CODING"
                  : test.type === "aptitude" ? "APTITUDE"
                  :                            "MOCK";
  const typeCls   = test.type === "coding"   ? "bg-blue-500/10 text-blue-600"
                  : test.type === "aptitude" ? "bg-purple-500/10 text-purple-600"
                  :                            "bg-emerald-500/10 text-emerald-600";

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-card shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BarChart3 className="w-5 h-5 text-primary shrink-0" />
          <h2 className="font-bold text-base truncate">{test.title}</h2>
          <span className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${typeCls}`}>
            {typeLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Tab bar — hidden when drilling into an attempt */}
      {!selectedAttempt && (
        <div className="border-b border-border bg-card shrink-0">
          <div className="flex px-5 gap-0">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading analytics…</span>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertCircle className="w-10 h-10 opacity-30" />
            <p className="font-medium">{error}</p>
            <button
              onClick={load}
              className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              Retry
            </button>
          </div>
        ) : !data ? null : selectedAttempt ? (
          <AttemptDetailView
            attempt={selectedAttempt}
            onBack={() => setSelectedAttempt(null)}
            onClose={onClose}
          />
        ) : (
          <>
            {activeTab === "overview" && (
              <div className="h-full overflow-auto">
                <OverviewTab data={data} />
              </div>
            )}
            {activeTab === "leaderboard" && (
              <div className="h-full flex flex-col overflow-hidden">
                <LeaderboardTab data={data} onSelectAttempt={setSelectedAttempt} />
              </div>
            )}
            {activeTab === "questions" && (
              <div className="h-full overflow-auto">
                <QuestionTab data={data} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
