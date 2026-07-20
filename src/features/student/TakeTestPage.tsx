import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2, AlertCircle, Loader2, Code2, AlignLeft, ShieldOff, AlertTriangle, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getTest, startAttempt, saveAnswer, submitAttempt } from "@/shared/lib/api";
import { toast } from "sonner";

type AnswerState = Record<string, string>;
type FlagState = Record<string, boolean>;

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function TakeTestPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFlaggedBlocked, setIsFlaggedBlocked] = useState(false);

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [flags, setFlags] = useState<FlagState>({});

  const [timeLeft, setTimeLeft] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [testStarted, setTestStarted] = useState(false);
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  // Cheating detection — counts tab switches + fullscreen exits
  const violationCount = useRef(0);
  const submitInProgress = useRef(false);
  const isFullscreenRef = useRef(false);
  const [showTabWarning, setShowTabWarning] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: testData } = await getTest(testId!);
        if (!testData) { toast.error("Test not found"); return; }
        setTest(testData);
        setTimeLeft((testData.duration_mins || 30) * 60);

        const { data: attemptData, error: attemptError } = await startAttempt(testId!);
        if (attemptError === "test_flagged" || (attemptData as any)?.error === "test_flagged") {
          setIsFlaggedBlocked(true);
          setLoading(false);
          return;
        }
        if (attemptError === "already_submitted" || (attemptData as any)?.error === "already_submitted") {
          setIsAlreadySubmitted(true);
          setLoading(false);
          return;
        }
        if (attemptData?.id) {
          setAttemptId(attemptData.id);
          const raw: any[] = testData.test_questions || [];
          setQuestions(raw.length > 0 ? seededShuffle(raw, attemptData.id) : raw);
        }
      } catch (err: any) {
        if (err.message?.includes("test_flagged") || err.message?.includes("terminated")) {
          setIsFlaggedBlocked(true);
          setLoading(false);
          return;
        }
        toast.error(err.message || "Failed to load test");
      }
      setLoading(false);
    }
    if (testId) init();
  }, [testId]);

  useEffect(() => {
    if (!testStarted || timeLeft <= 0 || isSubmitted || isReviewing) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [testStarted, timeLeft, isSubmitted, isReviewing]);

  // Tab switch + fullscreen exit detection — one warning, then auto-submit
  useEffect(() => {
    if (!attemptId || isSubmitted || !testStarted) return;

    const triggerViolation = () => {
      if (isSubmitted || submitInProgress.current) return;
      violationCount.current += 1;
      if (violationCount.current === 1) {
        setShowTabWarning(true);
      } else {
        handleFlaggedSubmit();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      triggerViolation();
    };

    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      if (!inFullscreen && isFullscreenRef.current) {
        isFullscreenRef.current = false;
        triggerViolation();
      }
      if (inFullscreen) isFullscreenRef.current = true;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, isSubmitted, testStarted]);

  const handleFlaggedSubmit = async () => {
    if (submitInProgress.current || isSubmitted) return;
    submitInProgress.current = true;
    setIsSubmitted(true);
    setIsReviewing(false);
    setShowTabWarning(false);

    const totalMarks = questions.reduce((sum: number, q: any) => sum + (q.marks || 1), 0);
    const timeTaken  = (test?.duration_mins || 30) * 60 - timeLeft;

    if (attemptId) {
      const { data: submitData } = await submitAttempt(attemptId, true, "tab_switch");
      setResult({
        score:      submitData?.score ?? 0,
        maxScore:   totalMarks,
        correct:    submitData?.correct_count ?? 0,
        wrong:      submitData?.wrong_count ?? 0,
        unanswered: questions.length - (submitData?.answered_count ?? 0),
        timeTaken,
        flagged:    true,
      });
    } else {
      setResult({ score: 0, maxScore: totalMarks, correct: 0, wrong: 0, unanswered: 0, timeTaken, flagged: true });
    }
  };

  const handleBeginTest = async () => {
    try {
      await document.documentElement.requestFullscreen();
      isFullscreenRef.current = true;
    } catch {
      // Fullscreen not supported or denied — proceed without enforcement
    }
    setTestStarted(true);
  };

  // Auto-submit when timer expires (only after test has started)
  useEffect(() => {
    if (timeLeft !== 0 || isSubmitted || !attemptId || !test || !testStarted) return;
    (async () => {
      setIsSubmitted(true);
      toast.info("Time's up! Submitting automatically…");
      const { data: submitData } = await submitAttempt(attemptId, true);
      const totalMarks = questions.reduce((sum: number, q: any) => sum + (q.marks || 1), 0);
      if (submitData) {
        setResult({
          score:      submitData.score ?? 0,
          maxScore:   totalMarks,
          correct:    submitData.correct_count ?? 0,
          wrong:      submitData.wrong_count ?? 0,
          unanswered: questions.length - (submitData.answered_count ?? 0),
          timeTaken:  (test.duration_mins || 30) * 60,
        });
      } else {
        setResult({ score: 0, maxScore: totalMarks, correct: 0, wrong: 0, unanswered: questions.length, timeTaken: (test.duration_mins || 30) * 60 });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isSubmitted, attemptId, test, testStarted]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <span className="text-muted-foreground">Loading test…</span>
    </div>
  );

  if (isAlreadySubmitted) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Test Already Submitted</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You have already completed this test. Retakes are only allowed with instructor approval.
          </p>
          <button
            onClick={() => navigate("/student/dashboard")}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Blocked: previous attempt was flagged and admin hasn't granted retake yet
  if (isFlaggedBlocked) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-red-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <ShieldOff className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Test Access Blocked</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your previous attempt was terminated because a tab switch or application change was detected during the test.
            Contact your instructor to request permission to retake.
          </p>
          <button
            onClick={() => navigate("/student/dashboard")}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!test) return null;

  // ── Ready to Begin screen (shown before student enters fullscreen) ─────────
  if (!testStarted) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-2xl p-8 text-center space-y-6 shadow-xl">
          <div
            className="w-16 h-16 mx-auto rounded-xl flex items-center justify-center"
            style={{ background: "var(--gold)" }}
          >
            <Maximize2 className="w-8 h-8 text-[#1A1A1A]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">{test.title}</h1>
            <p className="text-sm text-muted-foreground">
              {test.duration_mins || 30} minutes · {questions.length} questions
            </p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left space-y-2">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Before you begin:</p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside leading-relaxed">
              <li>The exam will open in fullscreen mode.</li>
              <li>Switching tabs or exiting fullscreen triggers a warning.</li>
              <li>A second violation auto-submits your test.</li>
              <li>You cannot retake the test once submitted.</li>
            </ul>
          </div>
          <button
            onClick={handleBeginTest}
            className="w-full py-4 bg-primary text-primary-foreground font-bold text-lg rounded-xl hover:opacity-90 transition-opacity"
          >
            Begin Exam
          </button>
        </div>
      </div>
    );
  }

  const handleAnswer = (val: string) => {
    const q = questions[currentQIndex];
    if (!q) return;
    setAnswers({ ...answers, [q.id]: val });
    if (attemptId) saveAnswer(attemptId, q.id, val).catch(() => {});
  };

  const toggleFlag = () => {
    const q = questions[currentQIndex];
    if (!q) return;
    setFlags({ ...flags, [q.id]: !flags[q.id] });
  };

  const handleSubmitFinal = async () => {
    setIsReviewing(false);
    setIsSubmitted(true);
    const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
    const timeTaken  = (test.duration_mins || 30) * 60 - timeLeft;
    if (attemptId) {
      const { data: submitData, error: submitError } = await submitAttempt(attemptId);
      if (submitError) toast.error("Submit failed — your answers were saved.");
      if (submitData) {
        setResult({
          score:      submitData.score ?? 0,
          maxScore:   totalMarks,
          correct:    submitData.correct_count ?? 0,
          wrong:      submitData.wrong_count ?? 0,
          unanswered: questions.length - (submitData.answered_count ?? 0),
          timeTaken,
        });
        return;
      }
    }
    setResult({ score: 0, maxScore: totalMarks, correct: 0, wrong: 0, unanswered: questions.length, timeTaken });
  };

  // ── Result Screen ─────────────────────────────────────────────────────────
  if (isSubmitted && result) {
    // Flagged result — show termination notice instead of score
    if (result.flagged) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-red-500/30 rounded-2xl p-8 text-center space-y-5 shadow-xl">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <span className="inline-block px-4 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-red-500/15 text-red-600 border border-red-500/30 mb-3">
                Test Terminated
              </span>
              <h1 className="text-2xl font-bold">Suspicious Activity Detected</h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your test <span className="font-semibold text-foreground">{test.title}</span> was automatically submitted because a tab switch or application change was detected.
            </p>
            <p className="text-muted-foreground text-sm">
              Contact your instructor to request permission to retake this test.
            </p>
            <button
              onClick={() => navigate("/student/dashboard")}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

    const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
    const passThreshold = test.pass_percentage ?? 40;
    const passed = pct >= passThreshold;
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-card border rounded-2xl p-8 text-center space-y-6 shadow-lg">
          {/* Pass/Fail Badge */}
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center ${
            passed ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}>
            <CheckCircle2 className="w-12 h-12" />
          </div>

          {/* Pass/Fail label */}
          <div>
            <span className={`inline-block px-5 py-1.5 rounded-full text-sm font-black tracking-widest uppercase mb-3 ${
              passed
                ? "bg-green-500/15 text-green-600 border border-green-500/30"
                : "bg-red-500/15 text-red-600 border border-red-500/30"
            }`}>
              {passed ? "✓ PASS" : "✗ FAIL"}
            </span>
            <h1 className="text-3xl font-bold mb-2">Test Submitted!</h1>
            <p className="text-muted-foreground">You completed <span className="font-semibold text-foreground">{test.title}</span></p>
            {!passed && (
              <p className="text-xs text-muted-foreground mt-1">Passing score: {passThreshold}%</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 py-6 border-y">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Score</p>
              <p className="text-3xl font-black text-primary">{result.score}<span className="text-base text-muted-foreground"> / {result.maxScore}</span></p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Percentage</p>
              <p className={`text-3xl font-black ${passed ? "text-green-500" : "text-red-500"}`}>{pct}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Time Taken</p>
              <p className="text-3xl font-black">{formatTime(result.timeTaken)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border bg-green-500/5 border-green-500/20 text-center">
              <p className="text-2xl font-black text-green-500">{result.correct ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Correct</p>
            </div>
            <div className="p-4 rounded-xl border bg-red-500/5 border-red-500/20 text-center">
              <p className="text-2xl font-black text-red-500">{result.wrong ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Wrong</p>
            </div>
            <div className="p-4 rounded-xl border bg-muted text-center">
              <p className="text-2xl font-black text-muted-foreground">{result.unanswered ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Unanswered</p>
            </div>
          </div>
          <button onClick={() => navigate("/student/dashboard")} className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Review Screen ─────────────────────────────────────────────────────────
  if (isReviewing) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-6 bg-card shrink-0">
          <h1 className="font-bold text-lg">{test.title} — Review</h1>
          <div className={`flex items-center gap-2 font-bold px-4 py-1.5 rounded-lg border ${timeLeft < 300 ? "text-red-500 bg-red-500/10 border-red-500/20" : "bg-muted"}`}>
            <Clock className="w-4 h-4" /><span>{formatTime(timeLeft)}</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-12">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Review Your Answers</h2>
            <div className="flex items-center justify-between py-3">
              <span className="text-xs text-muted-foreground">Total: {questions.length} Questions</span>
              <span className="text-xs text-muted-foreground">Total Marks: {questions.reduce((s, q) => s + (q.marks || 1), 0)}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl border bg-card text-center">
                <p className="text-2xl font-bold text-primary">{Object.keys(answers).length}</p>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Answered</p>
              </div>
              <div className="p-4 rounded-xl border bg-card text-center">
                <p className="text-2xl font-bold text-muted-foreground">{questions.length - Object.keys(answers).length}</p>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Unanswered</p>
              </div>
              <div className="p-4 rounded-xl border bg-card text-center">
                <p className="text-2xl font-bold text-orange-500">{Object.values(flags).filter(Boolean).length}</p>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Flagged</p>
              </div>
            </div>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="flex items-center justify-between p-4 rounded-xl border bg-card">
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-center font-bold text-muted-foreground">Q{i + 1}</span>
                    <div>
                      <p className="font-medium truncate max-w-xs md:max-w-md">{q.question}</p>
                      <span className={`text-xs mt-0.5 px-2 py-0.5 rounded-full font-medium inline-block ${
                        q.type === "mcq" ? "bg-blue-500/10 text-blue-600" :
                        q.type === "coding" ? "bg-purple-500/10 text-purple-600" :
                        "bg-slate-500/10 text-slate-600"
                      }`}>{q.type?.toUpperCase() || "MCQ"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {flags[q.id] && <Flag className="w-4 h-4 text-orange-500 fill-current" />}
                    <span className={`text-xs font-bold px-2 py-1 rounded ${answers[q.id] ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                      {answers[q.id] ? "Answered" : "Not Answered"}
                    </span>
                    <button onClick={() => { setCurrentQIndex(i); setIsReviewing(false); }} className="text-sm font-semibold text-primary hover:underline">Edit</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 pt-8">
              <button onClick={() => setIsReviewing(false)} className="flex-1 py-3 border font-bold rounded-xl hover:bg-muted transition-colors">Back to Test</button>
              <button onClick={handleSubmitFinal} className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity">Confirm Submit</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No questions guard ────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-lg font-semibold">No questions found for this test.</p>
        <button onClick={() => navigate("/student/dashboard")} className="text-primary hover:underline">Back to Dashboard</button>
      </div>
    );
  }

  const currentQ = questions[currentQIndex];
  const isMCQ = currentQ?.type === "mcq";
  const isCoding = currentQ?.type === "coding";

  // ── Unified Test UI — all question types in one interface ─────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col h-screen overflow-hidden">

      {/* Tab-switch warning overlay */}
      {showTabWarning && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border-2 border-red-500 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-red-500 uppercase tracking-wide">⚠ Warning</h2>
            <p className="font-semibold text-foreground">Security violation detected!</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This is your <strong>first and only warning</strong>. Switching tabs, exiting fullscreen, or opening another application will <strong className="text-red-500">automatically submit and terminate</strong> your test. You cannot retake it without instructor approval.
            </p>
            <button
              onClick={() => setShowTabWarning(false)}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
            >
              I understand — Return to Test
            </button>
          </div>
        </div>
      )}
      {/* Top Bar */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-bold text-lg truncate">{test.title}</h1>
          <span className="text-sm text-muted-foreground hidden md:inline shrink-0">Q {currentQIndex + 1} / {questions.length}</span>
        </div>
        <div className={`flex items-center gap-2 font-bold px-4 py-1.5 rounded-lg border shrink-0 transition-colors ${timeLeft < 300 ? "text-red-500 bg-red-500/10 border-red-500/20" : "bg-muted"}`}>
          <Clock className="w-4 h-4" /><span>{formatTime(timeLeft)}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — Question Navigator */}
        <aside className="hidden md:flex w-64 border-r bg-card flex-col shrink-0">
          <div className="p-4 border-b">
            <h3 className="text-sm font-bold">Question Overview</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{Object.keys(answers).length}/{questions.length} answered</p>
          </div>
          <div className="p-4 grid grid-cols-4 gap-2 overflow-y-auto">
            {questions.map((q, i) => {
              const isAns = !!answers[q.id];
              const isFlagged = !!flags[q.id];
              const isActive = i === currentQIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(i)}
                  title={`Q${i + 1}: ${(q.type || "mcq").toUpperCase()}`}
                  className={`aspect-square flex items-center justify-center text-sm font-bold rounded-lg border-2 transition-all relative ${
                    isActive ? "border-primary bg-primary/10 text-primary shadow-sm" :
                    isAns ? "bg-green-500/10 border-green-500/30 text-green-700" :
                    "bg-background border-muted hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  {i + 1}
                  {isFlagged && <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-card" />}
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full text-[5px] font-black flex items-center justify-center ${
                    q.type === "coding" ? "bg-purple-500 text-white" :
                    q.type === "short" ? "bg-slate-500 text-white" :
                    "bg-blue-500 text-white"
                  }`}>
                    {q.type === "coding" ? "C" : q.type === "short" ? "S" : "M"}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="p-4 border-t mt-auto space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> MCQ</div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Coding</div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> Short Answer</div>
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col bg-muted/10 min-w-0">
          <div className="flex-1 p-6 md:p-10 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQIndex}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Question header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Question {currentQIndex + 1}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                        isMCQ ? "bg-blue-500/10 text-blue-600" :
                        isCoding ? "bg-purple-500/10 text-purple-600" :
                        "bg-slate-500/10 text-slate-600"
                      }`}>
                        {isMCQ ? "Multiple Choice" : isCoding ? <><Code2 className="w-3 h-3" />Coding</> : <><AlignLeft className="w-3 h-3" />Short Answer</>}
                      </span>
                    </div>
                    <span className="text-xs font-bold bg-muted px-2 py-1 rounded">{currentQ?.marks || 1} Mark{(currentQ?.marks || 1) !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Question text */}
                  <h2 className="text-xl md:text-2xl font-medium mb-8 leading-relaxed">{currentQ?.question}</h2>

                  {/* MCQ Options */}
                  {isMCQ && (
                    <div className="space-y-3">
                      {(Array.isArray(currentQ.options) ? currentQ.options : []).map((opt: string, idx: number) => {
                        const isSelected = answers[currentQ.id] === idx.toString();
                        return (
                          <label
                            key={idx}
                            className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all select-none ${
                              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted bg-card hover:border-primary/40 hover:bg-muted/30"
                            }`}
                          >
                            <input type="radio" name={`q-${currentQ.id}`} value={idx.toString()} checked={isSelected} onChange={() => handleAnswer(idx.toString())} className="sr-only" />
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                            </div>
                            <span className={`text-base ${isSelected ? "font-semibold" : ""}`}>
                              <span className="font-bold text-muted-foreground mr-2">{String.fromCharCode(65 + idx)}.</span>{opt}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Coding / Short Answer */}
                  {!isMCQ && (
                    <div className="space-y-3">
                      {isCoding && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-sm text-purple-700 dark:text-purple-300">
                          <Code2 className="w-4 h-4 shrink-0" />
                          Write your solution below. Explain your approach and include code.
                        </div>
                      )}
                      <textarea
                        value={answers[currentQ?.id] || ""}
                        onChange={(e) => handleAnswer(e.target.value)}
                        rows={isCoding ? 12 : 5}
                        placeholder={isCoding ? "// Write your code solution here...\n// Explain your approach and time complexity" : "Type your answer here…"}
                        className={`w-full px-4 py-3 text-sm border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors resize-none ${
                          isCoding ? "font-mono bg-zinc-950 dark:bg-zinc-900 text-zinc-100 border-zinc-700 placeholder:text-zinc-600" : "bg-background border-muted"
                        }`}
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Nav */}
          <footer className="h-20 border-t bg-card flex items-center justify-between px-6 shrink-0">
            <button
              onClick={toggleFlag}
              className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors ${flags[currentQ?.id] ? "text-orange-500 bg-orange-500/10" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Flag className={`w-4 h-4 ${flags[currentQ?.id] ? "fill-current" : ""}`} />
              <span className="hidden sm:inline">Flag for review</span>
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentQIndex(Math.max(0, currentQIndex - 1))}
                disabled={currentQIndex === 0}
                className="flex items-center gap-1 px-4 py-2 border font-bold rounded-xl hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              {currentQIndex < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQIndex(currentQIndex + 1)}
                  className="flex items-center gap-1 px-6 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setIsReviewing(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-colors"
                >
                  Finish <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
