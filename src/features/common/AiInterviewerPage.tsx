import { useState, useEffect, useRef } from "react";
import {
  Mic, Play, Settings2, TrendingUp, Clock, Star, ChevronRight,
  StopCircle, CheckCircle2, SkipForward, AlertCircle, Loader2
} from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { getAiSessions, saveAiSession } from "@/shared/lib/api";

interface AiInterviewerPageProps {
  userType: Extract<UserType, "student" | "admin">;
}

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

const rubricBreakdown = [
  { category: "Problem Solving", score: 86 },
  { category: "Communication", score: 72 },
  { category: "Code Quality", score: 88 },
  { category: "Edge Cases", score: 74 },
];

const questionBank = [
  { id: 1, question: "Explain the difference between BFS and DFS.", category: "DSA", difficulty: "Medium" },
  { id: 2, question: "What is the time complexity of quicksort?", category: "Algorithms", difficulty: "Easy" },
  { id: 3, question: "Design a URL shortener system.", category: "System Design", difficulty: "Hard" },
  { id: 4, question: "Explain React's reconciliation algorithm.", category: "Frontend", difficulty: "Medium" },
  { id: 5, question: "What are SOLID principles?", category: "OOP", difficulty: "Medium" },
];

const DIFF_COLORS = {
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

function MicVisualizer() {
  return (
    <div className="flex items-end gap-1 h-8">
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          className="w-1.5 rounded-full bg-[var(--gold)]"
          style={{
            animation: `micBar${bar} 0.${bar + 5}s ease-in-out infinite alternate`,
            height: "100%",
          }}
        />
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

export function AiInterviewerPage({ userType }: AiInterviewerPageProps) {
  const isStudent = userType === "student";

  // Setup state
  const [track, setTrack] = useState("backend");
  const [difficulty, setDifficulty] = useState("mixed");
  const [selectedDuration, setSelectedDuration] = useState("30 minutes");
  const [tab, setTab] = useState<"setup" | "history" | "questions">("setup");

  // API State
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION_OPTS["30 minutes"]);
  const [answers, setAnswers] = useState<string[]>(Array(questionBank.length).fill(""));
  const [submittedQs, setSubmittedQs] = useState<boolean[]>(Array(questionBank.length).fill(false));
  const [sessionScore, setSessionScore] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const { data } = await getAiSessions();
      setSessions(data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isStudent) {
      loadSessions();
    } else {
      setLoading(false);
    }
  }, [isStudent]);

  useEffect(() => {
    if (sessionActive && !sessionEnded) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            endSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionActive, sessionEnded]);

  const startSession = () => {
    const secs = DURATION_OPTS[selectedDuration];
    setTimeLeft(secs);
    setCurrentQ(0);
    setAnswers(Array(questionBank.length).fill(""));
    setSubmittedQs(Array(questionBank.length).fill(false));
    setSessionEnded(false);
    setSessionActive(true);
    toast.success("Session started! Good luck.");
  };

  const endSession = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Calculate Score
    const answeredCount = submittedQs.filter(Boolean).length;
    const score = Math.round((answeredCount / questionBank.length) * 100);
    setSessionScore(score);
    setSessionEnded(true);

    try {
      await saveAiSession({
        track,
        difficulty,
        duration_mins: Math.round((DURATION_OPTS[selectedDuration] - timeLeft) / 60) || 1,
        score,
        feedback: "Great job! Keep practicing DSA.",
        questions: [] // Could pass submitted questions here
      });
      toast.success("Session saved. Here's your score summary.");
      loadSessions(); // Reload history
    } catch (err) {
      toast.error("Failed to save session data");
    }
  };

  const handleSubmitAnswer = () => {
    const updated = [...submittedQs];
    updated[currentQ] = true;
    setSubmittedQs(updated);
    if (currentQ < questionBank.length - 1) {
      setCurrentQ((prev) => prev + 1);
    } else {
      endSession();
    }
  };

  const handleSkip = () => {
    if (currentQ < questionBank.length - 1) {
      setCurrentQ((prev) => prev + 1);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const isTimerLow = timeLeft < 5 * 60;
  const timeTaken = DURATION_OPTS[selectedDuration] - timeLeft;
  const answeredCount = submittedQs.filter(Boolean).length;

  const scoreHistory = sessions.map((s, i) => ({ session: `S${sessions.length - i}`, score: s.score })).reverse();
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + (s.score || 0), 0) / sessions.length) : 0;
  const bestScore = sessions.length > 0 ? Math.max(...sessions.map(s => s.score || 0)) : 0;
  const lastSession = sessions[0];

  // ── ACTIVE SESSION UI ──────────────────────────────────────────────────────
  if (sessionActive) {
    const q = questionBank[currentQ];
    const isCodeQ = CODE_CATEGORIES.includes(q.category);

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="session"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col h-full"
        >
          {/* Top bar */}
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
                <StopCircle className="w-4 h-4" />
                End Session
              </Button>
            </div>
          </div>

          {/* Body */}
          {sessionEnded ? (
            // ── Score Summary ───────────────────────────────────────────────
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 overflow-y-auto p-8"
            >
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
                    <div className="text-3xl font-bold">{answeredCount}<span className="text-base text-foreground">/{questionBank.length}</span></div>
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
                    {rubricBreakdown.map((r) => (
                      <div key={r.category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{r.category}</span>
                          <span className="font-semibold tabular-nums">{r.score}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${r.score}%` }}
                            transition={{ duration: 0.8, delay: 0.1 }}
                            className={`h-full rounded-full ${r.score >= 80 ? "bg-[var(--gold)]" : r.score >= 65 ? "bg-amber-500" : "bg-red-500"}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-6 py-3 border-b border-border font-semibold">Per-question Review</div>
                  <div className="divide-y divide-border">
                    {questionBank.map((q, idx) => (
                      <div key={q.id} className="px-6 py-4 flex items-start gap-4">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${submittedQs[idx] ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                          {submittedQs[idx] ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{q.question}</p>
                          {answers[idx] ? (
                            <p className="text-xs text-muted-foreground mt-1 italic truncate">"{answers[idx]}"</p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1 italic">Skipped</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DIFF_COLORS[q.difficulty as keyof typeof DIFF_COLORS]}`}>{q.difficulty}</span>
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
            // ── Active Q&A Layout ───────────────────────────────────────────
            <div className="flex-1 grid grid-cols-3 overflow-hidden">
              {/* Left: question list */}
              <div className="col-span-1 border-r border-border bg-card overflow-y-auto p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-2">Questions</p>
                <div className="space-y-1">
                  {questionBank.map((q, idx) => {
                    const isActive = currentQ === idx;
                    const isDone = submittedQs[idx];
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentQ(idx)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3
                          ${isActive ? "bg-[var(--gold-muted)] text-[var(--gold)]" : isDone ? "bg-green-500/5 text-green-600 dark:text-green-400 hover:bg-green-500/10" : "hover:bg-muted/60 text-foreground"}`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${isActive ? "bg-[var(--gold)] text-[#1A1A1A]" : isDone ? "bg-green-500/20" : "bg-muted"}`}>
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">Q{idx + 1}</p>
                          <p className="text-xs text-muted-foreground truncate">{q.category} · {q.difficulty}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: question + answer area */}
              <div className="col-span-2 flex flex-col overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentQ}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="p-6 border-b border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${CAT_COLORS[q.category] || "bg-muted text-muted-foreground"}`}>{q.category}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${DIFF_COLORS[q.difficulty as keyof typeof DIFF_COLORS]}`}>{q.difficulty}</span>
                        <span className="text-xs text-muted-foreground ml-auto">Question {currentQ + 1} of {questionBank.length}</span>
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
                            value={answers[currentQ]}
                            onChange={(e) => {
                              const updated = [...answers];
                              updated[currentQ] = e.target.value;
                              setAnswers(updated);
                            }}
                          />
                        </div>
                      ) : (
                        <textarea
                          className="flex-1 w-full min-h-[200px] rounded-xl border border-border bg-muted/20 p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 placeholder:text-muted-foreground"
                          placeholder="Type your answer here... Speak clearly and structure your response."
                          value={answers[currentQ]}
                          onChange={(e) => {
                            const updated = [...answers];
                            updated[currentQ] = e.target.value;
                            setAnswers(updated);
                          }}
                        />
                      )}

                      <div className="flex justify-between items-center">
                        <Button variant="outline" size="sm" onClick={handleSkip} disabled={currentQ === questionBank.length - 1} className="gap-2">
                          <SkipForward className="w-4 h-4" />
                          Skip
                        </Button>
                        <Button
                          size="sm"
                          style={{ background: "var(--gold)", color: "#1A1A1A" }}
                          className="hover:opacity-90 gap-2"
                          onClick={handleSubmitAnswer}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {currentQ === questionBank.length - 1 ? "Submit & Finish" : "Submit Answer"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Bottom mic bar */}
                <div className="shrink-0 border-t border-border px-6 py-3 flex items-center gap-4 bg-card">
                  <div className="w-8 h-8 rounded-full bg-[var(--gold-muted)] flex items-center justify-center">
                    <Mic className="w-4 h-4 text-[var(--gold)]" />
                  </div>
                  <MicVisualizer />
                  <p className="text-xs text-muted-foreground">AI is listening...</p>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {submittedQs.filter(Boolean).length}/{questionBank.length} answered
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── SETUP UI (default) ──────────────────────────────────────────────────────
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="setup"
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.3 }}
        className="p-8 space-y-6"
      >
        <PageHeader
          title={isStudent ? "AI Interview Prep" : "AI Interviewer"}
          description={isStudent ? "Practice behavioral + DSA rounds with a voice-capable AI assistant." : "Configure institution-wide templates, rubrics, and proctoring defaults."}
          actions={!isStudent && (
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="size-4" /> Templates
            </Button>
          )}
        />

        {isStudent && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Sessions completed" value={loading ? "—" : String(sessions.length)} icon={Mic} trend={{ value: "Total sessions", isPositive: true }} />
            <StatCard title="Avg score" value={loading ? "—" : `${avgScore}/100`} icon={TrendingUp} trend={{ value: "Overall accuracy", isPositive: avgScore >= 70 }} />
            <StatCard title="Best score" value={loading ? "—" : `${bestScore}/100`} icon={Star} trend={{ value: "Highest achieved", isPositive: true }} />
          </div>
        )}

        {isStudent && (
          <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
            {(["setup", "history", "questions"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "setup" ? "🎙 New Session" : t === "history" ? "📊 History" : "❓ Question Bank"}
              </button>
            ))}
          </div>
        )}

        {(!isStudent || tab === "setup") && (
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
              <Button className="w-full gap-2 mt-2" size="lg" onClick={startSession}>
                <Mic className="size-4" /> Start Session
              </Button>
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
                  <Button variant="outline" size="sm" className="mt-3 gap-2">
                    <Play className="size-3.5" /> Replay summary
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {isStudent && tab === "history" && (
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
                {loading ? (
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

        {isStudent && tab === "questions" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-border">
              <span className="text-sm text-muted-foreground">Sample question bank</span>
            </div>
            <div className="divide-y divide-border">
              {questionBank.map(q => (
                <div key={q.id} className="px-6 py-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{q.question}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{q.category}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DIFF_COLORS[q.difficulty as keyof typeof DIFF_COLORS]}`}>{q.difficulty}</span>
                  <Button variant="ghost" size="sm" className="shrink-0 gap-1">
                    Practice <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
