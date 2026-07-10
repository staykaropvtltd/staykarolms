import { useState, useEffect, useRef } from "react";
import {
  Mic, Play, TrendingUp, Clock, Star, ChevronRight,
  StopCircle, CheckCircle2, SkipForward, AlertCircle, Loader2,
  Plus, FileUp, Trash2, X, BookOpen,
} from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  getAiSessions, saveAiSession,
  getInterviewQuestions, createInterviewQuestion, deleteInterviewQuestion,
} from "@/shared/lib/api";

interface AiInterviewerPageProps {
  userType: Extract<UserType, "student" | "admin" | "super-admin">;
}

interface InterviewQuestion {
  id: string | number;
  question: string;
  category: string;
  difficulty: string;
  track: string;
  answer_guide?: string;
}

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

const rubricBreakdown = [
  { category: "Problem Solving", score: 86 },
  { category: "Communication", score: 72 },
  { category: "Code Quality", score: 88 },
  { category: "Edge Cases", score: 74 },
];

const FALLBACK_QUESTIONS: InterviewQuestion[] = [
  { id: 1, question: "Explain the difference between BFS and DFS.", category: "DSA", difficulty: "Medium", track: "backend" },
  { id: 2, question: "What is the time complexity of quicksort?", category: "Algorithms", difficulty: "Easy", track: "backend" },
  { id: 3, question: "Design a URL shortener system.", category: "System Design", difficulty: "Hard", track: "system" },
  { id: 4, question: "Explain React's reconciliation algorithm.", category: "Frontend", difficulty: "Medium", track: "frontend" },
  { id: 5, question: "What are SOLID principles?", category: "OOP", difficulty: "Medium", track: "backend" },
];

const DIFF_COLORS: Record<string, string> = {
  Easy: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Hard: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const CAT_COLORS: Record<string, string> = {
  DSA: "bg-blue-500/10 text-blue-500",
  Algorithms: "bg-purple-500/10 text-purple-500",
  "System Design": "bg-rose-500/10 text-rose-500",
  Frontend: "bg-cyan-500/10 text-cyan-500",
  OOP: "bg-green-500/10 text-green-500",
};

const CODE_CATEGORIES = ["DSA", "Algorithms"];

const DURATION_OPTS: Record<string, number> = {
  "20 minutes": 20 * 60,
  "30 minutes": 30 * 60,
  "45 minutes": 45 * 60,
  "60 minutes": 60 * 60,
};

const TRACKS = ["general", "backend", "frontend", "datascience", "system", "behavioral"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

// ── Mic visualizer ─────────────────────────────────────────────────────────────
function MicVisualizer() {
  return (
    <div className="flex items-end gap-1 h-8">
      {[1, 2, 3, 4, 5].map((bar) => (
        <div key={bar} className="w-1.5 rounded-full bg-[var(--gold)]"
          style={{ animation: `micBar${bar} 0.${bar + 5}s ease-in-out infinite alternate`, height: "100%" }} />
      ))}
      <style>{`
        @keyframes micBar1 { from { transform: scaleY(0.2); } to { transform: scaleY(1); } }
        @keyframes micBar2 { from { transform: scaleY(0.5); } to { transform: scaleY(0.3); } }
        @keyframes micBar3 { from { transform: scaleY(0.3); } to { transform: scaleY(0.9); } }
        @keyframes micBar4 { from { transform: scaleY(0.7); } to { transform: scaleY(0.2); } }
        @keyframes micBar5 { from { transform: scaleY(0.4); } to { transform: scaleY(0.8); } }
        div[style*="micBar"] { transform-origin: bottom; }
      `}</style>
    </div>
  );
}

// ── Add Question Modal ──────────────────────────────────────────────────────────
function AddQuestionModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("General");
  const [difficulty, setDifficulty] = useState("Medium");
  const [track, setTrack] = useState("general");
  const [answerGuide, setAnswerGuide] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!question.trim()) { toast.error("Question text is required"); return; }
    setSaving(true);
    try {
      await createInterviewQuestion({ question: question.trim(), category, difficulty, track, answer_guide: answerGuide || undefined });
      toast.success("Question added");
      onAdded();
      onClose();
    } catch {
      toast.error("Failed to add question");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Add Interview Question</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Question *</label>
            <textarea
              rows={3}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. Explain the difference between BFS and DFS..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                placeholder="e.g. DSA"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Track</label>
              <select value={track} onChange={e => setTrack(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize">
                {TRACKS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Answer Guide (optional)</label>
            <textarea
              rows={2}
              value={answerGuide}
              onChange={e => setAnswerGuide(e.target.value)}
              placeholder="Key points the student should mention..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: "var(--gold)", color: "#1A1A1A" }} className="hover:opacity-90 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Add Question
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Import Questions Modal ──────────────────────────────────────────────────────
interface ParsedQuestion { question: string; category: string; difficulty: string; track: string; answer_guide?: string; }

function parseQuestionsFile(file: File): Promise<{ questions: ParsedQuestion[]; errors: string[] }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      const errors: string[] = [];
      const questions: ParsedQuestion[] = [];

      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : parsed.questions || [];
          arr.forEach((row: any, i: number) => {
            if (!row.question) { errors.push(`Row ${i + 1}: missing "question" field`); return; }
            questions.push({
              question: String(row.question),
              category: String(row.category || "General"),
              difficulty: String(row.difficulty || "Medium"),
              track: String(row.track || "general"),
              answer_guide: row.answer_guide ? String(row.answer_guide) : undefined,
            });
          });
        } else {
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          const delim = lines[0]?.includes("\t") ? "\t" : ",";
          const cleanCell = (c: string) => c.replace(/^["']|["']$/g, "").trim();
          const headers = lines[0].split(delim).map(cleanCell).map(h => h.toLowerCase());
          const qi = headers.indexOf("question");
          const ci = headers.indexOf("category");
          const di = headers.indexOf("difficulty");
          const ti = headers.indexOf("track");
          const ai = headers.indexOf("answer_guide");
          if (qi === -1) { errors.push('CSV must have a "question" column'); resolve({ questions, errors }); return; }
          for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(delim).map(cleanCell);
            const q = cells[qi];
            if (!q) { errors.push(`Row ${i + 1}: empty question`); continue; }
            questions.push({
              question: q,
              category: cells[ci] || "General",
              difficulty: cells[di] || "Medium",
              track: cells[ti] || "general",
              answer_guide: ai !== -1 && cells[ai] ? cells[ai] : undefined,
            });
          }
        }
      } catch (err: any) {
        errors.push(`Parse error: ${err.message}`);
      }
      resolve({ questions, errors });
    };
    reader.readAsText(file);
  });
}

function ImportQuestionsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedQuestion[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (f: File) => {
    setFile(f);
    const { questions, errors } = await parseQuestionsFile(f);
    setParsed(questions);
    setParseErrors(errors);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setImporting(true);
    let done = 0;
    for (const q of parsed) {
      try {
        await createInterviewQuestion(q);
      } catch {
        // skip failed rows, continue
      }
      done++;
      setProgress(Math.round((done / parsed.length) * 100));
    }
    toast.success(`Imported ${done} question${done !== 1 ? "s" : ""}`);
    setImporting(false);
    onImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Import Questions from File</h2>
          <button onClick={onClose} disabled={importing} className="p-1 hover:bg-muted rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {!file ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("q-file-input")?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? "border-[var(--gold)] bg-[var(--gold-muted)]" : "border-border hover:border-[var(--gold)]/50 hover:bg-muted/20"}`}
          >
            <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv, .tsv, .json</p>
            <input id="q-file-input" type="file" accept=".csv,.tsv,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{file.name}</span>
              <button onClick={() => { setFile(null); setParsed([]); setParseErrors([]); }} disabled={importing}
                className="text-muted-foreground hover:text-foreground">Change file</button>
            </div>
            {parseErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
                {parseErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
              </div>
            )}
            {parsed.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--gold)]">{parsed.length} question{parsed.length !== 1 ? "s" : ""} ready to import</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {parsed.map((q, i) => (
                    <div key={i} className="bg-muted/30 border border-border rounded-lg px-4 py-3">
                      <p className="text-sm font-medium">{q.question}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{q.category} · {q.difficulty} · {q.track}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {importing && (
              <div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--gold)] rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{progress}% imported…</p>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <p className="font-medium mb-1">Expected CSV format:</p>
          <code className="block whitespace-pre text-[10px]">question,category,difficulty,track,answer_guide{"\n"}Explain BFS vs DFS,DSA,Medium,backend,Start with graph theory...{"\n"}Design a URL shortener,System Design,Hard,system,</code>
        </div>

        <div className="flex justify-end gap-3 pt-1 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={!parsed.length || importing} style={{ background: "var(--gold)", color: "#1A1A1A" }} className="hover:opacity-90 gap-2">
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {parsed.length > 0 ? `${parsed.length} Questions` : ""}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function AiInterviewerPage({ userType }: AiInterviewerPageProps) {
  const isStudent = userType === "student";

  // Questions
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  // Student: sessions + tabs
  const [tab, setTab] = useState<"setup" | "history" | "questions">("setup");
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Student: active session
  const [track, setTrack] = useState("backend");
  const [difficulty, setDifficulty] = useState("mixed");
  const [selectedDuration, setSelectedDuration] = useState("30 minutes");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  // Snapshot of questions at session start — prevents index mismatch if DB questions reload
  const [sessionQuestions, setSessionQuestions] = useState<InterviewQuestion[]>([]);
  const [timeLeft, setTimeLeft] = useState(DURATION_OPTS["30 minutes"]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submittedQs, setSubmittedQs] = useState<boolean[]>([]);
  const [sessionScore, setSessionScore] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin: modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const loadQuestions = async () => {
    setQuestionsLoading(true);
    try {
      const { data } = await getInterviewQuestions();
      const valid = (Array.isArray(data) ? data : []).filter(
        (q): q is InterviewQuestion => q != null && typeof q.question === "string"
      );
      if (valid.length > 0) {
        setQuestions(valid);
      } else {
        setQuestions(isStudent ? FALLBACK_QUESTIONS : []);
      }
    } catch {
      setQuestions(isStudent ? FALLBACK_QUESTIONS : []);
    }
    setQuestionsLoading(false);
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const { data } = await getAiSessions();
      setSessions(data || []);
    } catch {
      setSessions([]);
    }
    setSessionsLoading(false);
  };

  useEffect(() => {
    loadQuestions();
    if (isStudent) loadSessions();
    else setSessionsLoading(false);
  }, [isStudent]);

  useEffect(() => {
    if (sessionActive && !sessionEnded) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { clearInterval(timerRef.current!); endSession(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionActive, sessionEnded]);

  const startSession = () => {
    const qs = (questions.length > 0 ? questions : FALLBACK_QUESTIONS).filter(Boolean);
    const secs = DURATION_OPTS[selectedDuration];
    setSessionQuestions(qs);
    setTimeLeft(secs);
    setCurrentQ(0);
    setAnswers(Array(qs.length).fill(""));
    setSubmittedQs(Array(qs.length).fill(false));
    setSessionEnded(false);
    setSessionActive(true);
    toast.success("Session started! Good luck.");
  };

  const endSession = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const qs = sessionQuestions.length > 0 ? sessionQuestions : FALLBACK_QUESTIONS;
    const answeredCount = submittedQs.filter(Boolean).length;
    const score = Math.round((answeredCount / qs.length) * 100);
    setSessionScore(score);
    setSessionEnded(true);
    try {
      await saveAiSession({ track, difficulty, duration_mins: Math.round((DURATION_OPTS[selectedDuration] - timeLeft) / 60) || 1, score, feedback: "Great job! Keep practicing.", questions: [] });
      toast.success("Session saved.");
      loadSessions();
    } catch { toast.error("Failed to save session"); }
  };

  const handleSubmitAnswer = () => {
    const qs = sessionQuestions.length > 0 ? sessionQuestions : FALLBACK_QUESTIONS;
    const updated = [...submittedQs];
    updated[currentQ] = true;
    setSubmittedQs(updated);
    if (currentQ < qs.length - 1) setCurrentQ(p => p + 1);
    else endSession();
  };

  const handleSkip = () => {
    const qs = sessionQuestions.length > 0 ? sessionQuestions : FALLBACK_QUESTIONS;
    if (currentQ < qs.length - 1) setCurrentQ(p => p + 1);
  };

  const handleDeleteQuestion = async (id: string | number) => {
    setDeletingId(id);
    try {
      await deleteInterviewQuestion(String(id));
      toast.success("Question deleted");
      loadQuestions();
    } catch { toast.error("Failed to delete question"); }
    setDeletingId(null);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const activeQuestions = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
  const isTimerLow = timeLeft < 5 * 60;
  const timeTaken = DURATION_OPTS[selectedDuration] - timeLeft;
  const answeredCount = submittedQs.filter(Boolean).length;
  const scoreHistory = sessions.map((s, i) => ({ session: `S${sessions.length - i}`, score: s.score })).reverse();
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + (s.score || 0), 0) / sessions.length) : 0;
  const bestScore = sessions.length > 0 ? Math.max(...sessions.map(s => s.score || 0)) : 0;
  const lastSession = sessions[0];

  // ── ACTIVE SESSION (students only) ─────────────────────────────────────────
  if (isStudent && sessionActive) {
    const q = sessionQuestions[currentQ];
    if (!q) return null;
    const isCodeQ = CODE_CATEGORIES.includes(q.category);

    return (
      <AnimatePresence mode="wait">
        <motion.div key="session" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="flex flex-col h-full">
          <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-muted)] flex items-center justify-center">
                <Mic className="w-4 h-4 text-[var(--gold)]" />
              </div>
              <div>
                <h1 className="font-bold text-foreground">AI Interview Session</h1>
                <p className="text-xs text-muted-foreground capitalize">{track} · {difficulty}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-semibold text-lg ${isTimerLow ? "bg-red-500/10 text-red-500" : "bg-muted text-foreground"}`}>
                <Clock className="w-4 h-4" />
                {formatTime(timeLeft)}
              </div>
              <Button variant="destructive" size="sm" onClick={endSession} className="gap-2">
                <StopCircle className="w-4 h-4" /> End Session
              </Button>
            </div>
          </div>

          {sessionEnded ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="text-center">
                  <div className="w-20 h-20 bg-[var(--gold-muted)] rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-10 h-10 text-[var(--gold)]" />
                  </div>
                  <h2 className="text-3xl font-bold">Session Complete</h2>
                  <p className="text-muted-foreground mt-2">Here is your performance summary</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-[var(--gold)]">{sessionScore}<span className="text-base text-foreground">/100</span></div>
                    <div className="text-xs text-muted-foreground mt-1">Overall Score</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{answeredCount}<span className="text-base text-foreground">/{sessionQuestions.length}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">Answered</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{formatTime(timeTaken)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Time Taken</div>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="font-semibold mb-4">Score Rubric Breakdown</h3>
                  <div className="space-y-3">
                    {rubricBreakdown.map(r => (
                      <div key={r.category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{r.category}</span>
                          <span className="font-semibold tabular-nums">{r.score}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${r.score}%` }} transition={{ duration: 0.8, delay: 0.1 }}
                            className={`h-full rounded-full ${r.score >= 80 ? "bg-[var(--gold)]" : r.score >= 65 ? "bg-amber-500" : "bg-red-500"}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-6 py-3 border-b border-border font-semibold">Per-question Review</div>
                  <div className="divide-y divide-border">
                    {sessionQuestions.map((aq, idx) => (
                      <div key={aq.id} className="px-6 py-4 flex items-start gap-4">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${submittedQs[idx] ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                          {submittedQs[idx] ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{aq.question}</p>
                          {answers[idx] ? <p className="text-xs text-muted-foreground mt-1 italic truncate">"{answers[idx]}"</p>
                            : <p className="text-xs text-muted-foreground mt-1 italic">Skipped</p>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DIFF_COLORS[aq.difficulty] || "bg-muted text-muted-foreground"}`}>{aq.difficulty}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button onClick={() => { setSessionActive(false); setSessionEnded(false); setTab("setup"); }} className="gap-2">
                    <Play className="w-4 h-4" /> Start New Session
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 grid grid-cols-3 overflow-hidden">
              <div className="col-span-1 border-r border-border bg-card overflow-y-auto p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-2">Questions</p>
                <div className="space-y-1">
                  {sessionQuestions.map((aq, idx) => {
                    const isActive = currentQ === idx;
                    const isDone = submittedQs[idx];
                    return (
                      <button key={aq.id} onClick={() => setCurrentQ(idx)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3
                          ${isActive ? "bg-[var(--gold-muted)] text-[var(--gold)]" : isDone ? "bg-green-500/5 text-green-600 dark:text-green-400 hover:bg-green-500/10" : "hover:bg-muted/60 text-foreground"}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${isActive ? "bg-[var(--gold)] text-[#1A1A1A]" : isDone ? "bg-green-500/20" : "bg-muted"}`}>
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">Q{idx + 1}</p>
                          <p className="text-xs text-muted-foreground truncate">{aq.category} · {aq.difficulty}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="col-span-2 flex flex-col overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div key={currentQ} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${CAT_COLORS[q.category] || "bg-muted text-muted-foreground"}`}>{q.category}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${DIFF_COLORS[q.difficulty] || "bg-muted text-muted-foreground"}`}>{q.difficulty}</span>
                        <span className="text-xs text-muted-foreground ml-auto">Question {currentQ + 1} of {sessionQuestions.length}</span>
                      </div>
                      <h2 className="text-lg font-semibold leading-snug">{q.question}</h2>
                    </div>

                    <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
                      {isCodeQ ? (
                        <div className="flex-1 rounded-xl overflow-hidden border border-border bg-[#1e1e1e] min-h-[200px]">
                          <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/70" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                            <div className="w-3 h-3 rounded-full bg-green-500/70" />
                            <span className="text-xs text-gray-400 ml-2 font-mono">solution.py</span>
                          </div>
                          <textarea
                            className="w-full h-full bg-transparent text-[#d4d4d4] p-4 font-mono text-sm resize-none focus:outline-none min-h-[180px]"
                            placeholder={`# Write your code here...\ndef solution():\n    pass`}
                            value={answers[currentQ] || ""}
                            onChange={e => { const u = [...answers]; u[currentQ] = e.target.value; setAnswers(u); }}
                          />
                        </div>
                      ) : (
                        <textarea
                          className="flex-1 w-full min-h-[200px] rounded-xl border border-border bg-muted/20 p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 placeholder:text-muted-foreground"
                          placeholder="Type your answer here... Speak clearly and structure your response."
                          value={answers[currentQ] || ""}
                          onChange={e => { const u = [...answers]; u[currentQ] = e.target.value; setAnswers(u); }}
                        />
                      )}
                      <div className="flex justify-between items-center">
                        <Button variant="outline" size="sm" onClick={handleSkip} disabled={currentQ === sessionQuestions.length - 1} className="gap-2">
                          <SkipForward className="w-4 h-4" /> Skip
                        </Button>
                        <Button size="sm" style={{ background: "var(--gold)", color: "#1A1A1A" }} className="hover:opacity-90 gap-2" onClick={handleSubmitAnswer}>
                          <CheckCircle2 className="w-4 h-4" />
                          {currentQ === sessionQuestions.length - 1 ? "Submit & Finish" : "Submit Answer"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="shrink-0 border-t border-border px-6 py-3 flex items-center gap-4 bg-card">
                  <div className="w-8 h-8 rounded-full bg-[var(--gold-muted)] flex items-center justify-center">
                    <Mic className="w-4 h-4 text-[var(--gold)]" />
                  </div>
                  <MicVisualizer />
                  <p className="text-xs text-muted-foreground">AI is listening...</p>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {submittedQs.filter(Boolean).length}/{sessionQuestions.length} answered
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── ADMIN / SUPER-ADMIN VIEW ────────────────────────────────────────────────
  if (!isStudent) {
    const tracks = [...new Set(questions.map(q => q.track))];
    const categories = [...new Set(questions.map(q => q.category))];

    return (
      <>
        <AnimatePresence>
          {showAddModal && <AddQuestionModal onClose={() => setShowAddModal(false)} onAdded={loadQuestions} />}
          {showImportModal && <ImportQuestionsModal onClose={() => setShowImportModal(false)} onImported={loadQuestions} />}
        </AnimatePresence>

        <motion.div key="admin" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.3 }} className="p-8 space-y-6">
          <PageHeader
            title="AI Interviewer"
            description="Manage the question bank used in student AI interview practice sessions."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImportModal(true)}>
                  <FileUp className="size-4" /> Import from file
                </Button>
                <Button size="sm" className="gap-2" style={{ background: "var(--gold)", color: "#1A1A1A" }} onClick={() => setShowAddModal(true)}>
                  <Plus className="size-4" /> Add Question
                </Button>
              </div>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total questions" value={questionsLoading ? "—" : String(questions.length)} icon={BookOpen} trend={{ value: "In question bank", isPositive: true }} />
            <StatCard title="Tracks covered" value={questionsLoading ? "—" : String(tracks.length)} icon={TrendingUp} trend={{ value: "Interview tracks", isPositive: true }} />
            <StatCard title="Categories" value={questionsLoading ? "—" : String(categories.length)} icon={Star} trend={{ value: "Unique categories", isPositive: true }} />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
              <span className="text-xs text-muted-foreground">Students use these during AI interview sessions</span>
            </div>

            {questionsLoading ? (
              <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : questions.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="font-medium text-foreground">No questions yet</p>
                <p className="text-sm text-muted-foreground">Add questions manually or import from a CSV/JSON file.</p>
                <Button size="sm" style={{ background: "var(--gold)", color: "#1A1A1A" }} onClick={() => setShowAddModal(true)} className="gap-2 mt-2">
                  <Plus className="size-4" /> Add First Question
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {questions.map(q => (
                  <div key={q.id} className="px-6 py-4 flex items-start gap-4 hover:bg-accent/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{q.question}</p>
                      {q.answer_guide && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic truncate">Guide: {q.answer_guide}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[q.category] || "bg-muted text-muted-foreground"}`}>{q.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFF_COLORS[q.difficulty] || "bg-muted text-muted-foreground"}`}>{q.difficulty}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{q.track}</span>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        disabled={deletingId === q.id}
                        className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors text-muted-foreground disabled:opacity-50"
                      >
                        {deletingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </>
    );
  }

  // ── STUDENT SETUP VIEW ─────────────────────────────────────────────────────
  return (
    <AnimatePresence mode="wait">
      <motion.div key="setup" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.3 }} className="p-8 space-y-6">
        <PageHeader
          title="AI Interview Prep"
          description="Practice behavioral + DSA rounds with a voice-capable AI assistant."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Sessions completed" value={sessionsLoading ? "—" : String(sessions.length)} icon={Mic} trend={{ value: "Total sessions", isPositive: true }} />
          <StatCard title="Avg score" value={sessionsLoading ? "—" : `${avgScore}/100`} icon={TrendingUp} trend={{ value: "Overall accuracy", isPositive: avgScore >= 70 }} />
          <StatCard title="Best score" value={sessionsLoading ? "—" : `${bestScore}/100`} icon={Star} trend={{ value: "Highest achieved", isPositive: true }} />
        </div>

        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
          {(["setup", "history", "questions"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "setup" ? "🎙 New Session" : t === "history" ? "📊 History" : "❓ Question Bank"}
            </button>
          ))}
        </div>

        {tab === "setup" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Session Setup</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Track</label>
                  <select value={track} onChange={e => setTrack(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="backend">Backend (Python / Java)</option>
                    <option value="frontend">Frontend (React)</option>
                    <option value="datascience">Data Science</option>
                    <option value="system">System Design</option>
                    <option value="behavioral">Behavioral</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Duration</label>
                  <select value={selectedDuration} onChange={e => setSelectedDuration(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {Object.keys(DURATION_OPTS).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              {questionsLoading ? (
                <Button className="w-full gap-2 mt-2" size="lg" disabled>
                  <Loader2 className="size-4 animate-spin" /> Loading questions…
                </Button>
              ) : (
                <Button className="w-full gap-2 mt-2" size="lg" onClick={startSession}>
                  <Mic className="size-4" /> Start Session ({activeQuestions.length} questions)
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Demo: no audio is recorded. Wire your provider keys to go live.</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
              <h2 className="font-semibold text-foreground">Score Rubric</h2>
              <div className="space-y-3">
                {rubricBreakdown.map(r => (
                  <div key={r.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{r.category}</span>
                      <span className="font-semibold text-foreground tabular-nums">{r.score}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.score >= 80 ? "bg-primary" : r.score >= 65 ? "bg-primary/60" : "bg-red-500"}`} style={{ width: `${r.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {lastSession && (
                <div className="rounded-lg bg-muted/40 p-4 mt-auto">
                  <p className="text-sm font-medium text-foreground mb-1">Last session</p>
                  <p className="text-xs text-muted-foreground">{lastSession.track} · Score {lastSession.score}/100 · {lastSession.duration_mins} mins</p>
                  <p className="text-xs text-muted-foreground mt-1 italic">"{lastSession.feedback || "Good job"}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground mb-4">Score Trend</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={scoreHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="session" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 5, fill: "var(--gold)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-3 border-b border-border">
                <span className="text-sm text-muted-foreground">{sessions.length} sessions</span>
              </div>
              <div className="divide-y divide-border">
                {sessionsLoading ? (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : sessions.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No sessions recorded yet. Start practicing!</div>
                ) : sessions.map((s: any) => (
                  <div key={s.id} className="px-6 py-4 hover:bg-accent/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{s.track || "Practice"}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(s.score || 0) >= 80 ? "bg-[var(--gold-muted)] text-[var(--gold)]" : (s.score || 0) >= 65 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>
                            {s.score || 0}/100
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(s.created_at).toLocaleDateString()} · {s.duration_mins || 0} mins</p>
                        <p className="text-xs text-muted-foreground mt-1 italic">"{s.feedback || "Good job"}"</p>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1 shrink-0">
                        <Play className="w-3.5 h-3.5" /> Replay
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "questions" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-border">
              <span className="text-sm text-muted-foreground">{activeQuestions.length} questions in the bank</span>
            </div>
            {questionsLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="divide-y divide-border">
                {activeQuestions.map(q => (
                  <div key={q.id} className="px-6 py-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{q.question}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{q.category} · {q.track}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DIFF_COLORS[q.difficulty] || "bg-muted text-muted-foreground"}`}>{q.difficulty}</span>
                    <Button variant="ghost" size="sm" className="shrink-0 gap-1" onClick={() => setTab("setup")}>
                      Practice <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
