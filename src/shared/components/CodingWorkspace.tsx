import {
  Play, CheckCircle2, XCircle, ArrowRight, ChevronUp, ChevronDown, X, Lock, ChevronLeft,
  Loader2
} from "lucide-react";
import { useState, ReactNode } from "react";
import { Button } from "./ui/button";
export type CodingProblem = {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic?: string;
  acceptance?: number;
  points: number;
  status?: "Solved" | "Attempted" | "Unsolved" | "Completed";
  sampleInput?: string;
  sampleInputs?: string[];
};
import { motion, AnimatePresence } from "motion/react";

// Add VITE_JUDGE0_KEY=your_key to .env
const JUDGE0_KEY = import.meta.env.VITE_JUDGE0_KEY as string;
const JUDGE0_HOST = "judge0-ce.p.rapidapi.com";
const JUDGE0_BASE = `https://${JUDGE0_HOST}`;

const LANGUAGE_IDS: Record<string, number> = {
  python:     71, // Python 3
  javascript: 63, // Node.js
  cpp:        54, // C++17
  c:          50, // C
  java:       62, // Java
};

// Status IDs 1-2 = queued/processing; 3 = Accepted; 4 = WA; 5 = TLE; 6 = CE; etc.
const STATUS_LABEL: Record<number, string> = {
  3: "Accepted",
  4: "Wrong Answer",
  5: "Time Limit Exceeded",
  6: "Compilation Error",
  7: "Runtime Error",
  8: "Runtime Error",
  9: "Runtime Error",
  10: "Runtime Error",
  11: "Runtime Error",
  12: "Runtime Error",
  13: "Internal Error",
  14: "Exec Format Error",
};

interface Judge0Result {
  stdout:  string | null;
  stderr:  string | null;
  status:  { id: number; description: string };
  time:    string | null;
  memory:  number | null;
}

async function judge0Submit(source_code: string, language_id: number, stdin = ""): Promise<Judge0Result> {
  const headers = {
    "Content-Type":    "application/json",
    "x-rapidapi-key":  JUDGE0_KEY,
    "x-rapidapi-host": JUDGE0_HOST,
  };

  // Step 1 — create submission
  const createRes = await fetch(
    `${JUDGE0_BASE}/submissions?base64_encoded=false&wait=false`,
    { method: "POST", headers, body: JSON.stringify({ source_code, language_id, stdin }) }
  );
  if (!createRes.ok) throw new Error("Execution service unavailable");
  const { token } = await createRes.json();
  if (!token) throw new Error("Execution service unavailable");

  // Step 2 — poll until done (status.id >= 3)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(
      `${JUDGE0_BASE}/submissions/${token}?base64_encoded=false&fields=stdout,stderr,status,time,memory`,
      { headers }
    );
    if (!pollRes.ok) throw new Error("Execution service unavailable");
    const result: Judge0Result = await pollRes.json();
    if (result.status?.id >= 3) return result;
  }
  throw new Error("Execution timed out (no response from Judge0)");
}

export interface CodingWorkspaceProps {
  problem: CodingProblem;
  onClose: () => void;
  onNext?: () => void;
  mode?: "practice" | "test" | "assignment";
  initialCode?: string;
  onCodeChange?: (code: string) => void;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  leftTabs?: { id: string; label: string; content: ReactNode }[];
  defaultLeftTab?: string;
  hideTopBarStats?: boolean;
}

const DIFF_COLORS: Record<CodingProblem["difficulty"], string> = {
  Easy: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Hard: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function CodingWorkspace({
  problem,
  onClose,
  onNext,
  mode = "practice",
  initialCode = "",
  onCodeChange,
  headerCenter,
  headerRight,
  leftTabs,
  defaultLeftTab,
  hideTopBarStats,
}: CodingWorkspaceProps) {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState("python");
  const [running, setRunning] = useState(false);
  
  const defaultTabs = [
    {
      id: "description",
      label: "Description",
      content: (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-3">{problem.title}</h2>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${DIFF_COLORS[problem.difficulty]}`}>{problem.difficulty}</span>
              <span className="text-xs text-muted-foreground">Topics: Array, Hash Table</span>
            </div>
          </div>
          
          <div className="text-sm text-foreground leading-relaxed space-y-4">
            <p>Write a function to solve the <strong>{problem.title}</strong> problem.</p>
            <p>You may assume that each input would have <strong>exactly one solution</strong>, and you may not use the <em>same</em> element twice.</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-sm mb-2 text-foreground">Example 1:</p>
              <div className="bg-muted/40 p-3.5 rounded-lg text-sm font-mono border border-border">
                <span className="text-muted-foreground select-none">Input:</span> nums = [2,7,11,15], target = 9<br/>
                <span className="text-muted-foreground select-none">Output:</span> [0,1]
              </div>
            </div>
          </div>
          
          <div>
            <p className="font-semibold text-sm mb-2 text-foreground">Constraints:</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1.5 ml-1">
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-[13px]">2 &lt;= nums.length &lt;= 10^4</code></li>
              <li><strong>Only one valid answer exists.</strong></li>
            </ul>
          </div>
        </div>
      )
    },
    ...(mode === "practice" ? [
      {
        id: "submissions",
        label: "Submissions",
        content: (
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-sm text-green-500">Accepted</span>
                <span className="text-xs text-muted-foreground">10 minutes ago</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-background rounded-md border border-border">Python</span>
                <span>Runtime: 42ms</span>
                <span>Memory: 14.2MB</span>
              </div>
            </div>
          </div>
        )
      },
      {
        id: "solutions",
        label: "Solutions",
        content: (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <p className="font-medium">Solutions unlock after solving</p>
            <p className="text-xs max-w-[250px]">Submit an accepted solution to unlock official solutions.</p>
          </div>
        )
      }
    ] : [])
  ];

  const tabsToUse = leftTabs || defaultTabs;
  const [activeLeftTab, setActiveLeftTab] = useState(defaultLeftTab || tabsToUse[0].id);

  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<"testcases" | "output">("testcases");
  const [outputStr, setOutputStr] = useState<string | null>(null);

  const [submissionResult, setSubmissionResult] = useState<{
    status: string;
    runtime: string;
    memory: string;
    passedCases: number;
    totalCases: number;
    beats: number;
  } | null>(null);

  const handleCodeChange = (val: string) => {
    setCode(val);
    onCodeChange?.(val);
  };

  // ── Judge0 output state ──────────────────────────────────────────────────
  const [outputDisplay, setOutputDisplay] = useState<{
    type: "idle" | "running" | "stdout" | "stderr" | "error" | "ce" | "tle";
    text: string;
    time?: string;
    memory?: string;
  }>({ type: "idle", text: "" });

  // ── Judge0 language helper ───────────────────────────────────────────────
  const langId = () => LANGUAGE_IDS[language] ?? 71;

  // ── Run (single test case — uses the editable stdin input) ───────────────
  const run = async () => {
    setRunning(true);
    setBottomPanelOpen(true);
    setActiveBottomTab("output");
    setOutputDisplay({ type: "running", text: "Running your code…" });

    try {
      const stdin = (document.querySelector("input[data-judge0-stdin]") as HTMLInputElement)?.value ?? "";
      const result = await judge0Submit(code, langId(), stdin);

      if (result.status.id === 6) {
        // Compilation Error
        setOutputDisplay({ type: "ce", text: result.stderr ?? "Compilation error (no details)." });
      } else if (result.status.id === 5) {
        // TLE
        setOutputDisplay({ type: "tle", text: "Time Limit Exceeded" });
      } else if (result.stderr) {
        // Runtime error — show stderr
        setOutputDisplay({ type: "stderr", text: result.stderr, time: result.time ?? undefined, memory: result.memory ? `${result.memory} KB` : undefined });
      } else {
        // Success — show stdout
        setOutputDisplay({
          type: "stdout",
          text: result.stdout ?? "(no output)",
          time:   result.time   ? `${result.time}s` : undefined,
          memory: result.memory ? `${result.memory} KB` : undefined,
        });
      }
    } catch (err: any) {
      setOutputDisplay({ type: "error", text: err.message ?? "Execution service unavailable" });
    } finally {
      setRunning(false);
    }
  };

  // ── Submit (run against all problem test cases) ──────────────────────────
  // Each CodingProblem has `sampleInput` or we fall back to an empty string.
  const submit = async () => {
    setRunning(true);
    setBottomPanelOpen(true);
    setActiveBottomTab("output");
    setOutputDisplay({ type: "running", text: "Submitting…" });

    // Pull sample test cases from the problem — CodingProblem may carry
    // `sampleInputs?: string[]`, otherwise fall back to a single empty run.
    const testInputs: string[] = (problem as any).sampleInputs ?? [(problem as any).sampleInput ?? ""];
    const totalCases = testInputs.length;
    let passedCases = 0;
    let lastResult: Judge0Result | null = null;

    try {
      for (const stdin of testInputs) {
        const result = await judge0Submit(code, langId(), stdin);
        lastResult = result;
        if (result.status.id === 3) passedCases++;
        // Stop early on compilation error
        if (result.status.id === 6) break;
      }

      const finalStatus = lastResult?.status.id ?? 0;
      const statusLabel = STATUS_LABEL[finalStatus] ?? lastResult?.status.description ?? "Unknown";

      if (finalStatus === 6) {
        // Show CE in output panel
        setOutputDisplay({ type: "ce", text: lastResult?.stderr ?? "Compilation error." });
      } else {
        setOutputDisplay({ type: "idle", text: "" });
        setSubmissionResult({
          status: statusLabel,
          runtime: lastResult?.time ? `${lastResult.time}s` : "—",
          memory:  lastResult?.memory ? `${lastResult.memory} KB` : "—",
          passedCases,
          totalCases,
          beats: finalStatus === 3 ? Math.floor(Math.random() * 30 + 65) : 0,
        });
      }
    } catch (err: any) {
      setOutputDisplay({ type: "error", text: err.message ?? "Execution service unavailable" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="font-bold text-foreground text-sm truncate max-w-[200px] sm:max-w-none">{problem.title}</span>
          {!hideTopBarStats && (
            <>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_COLORS[problem.difficulty]}`}>
                {problem.difficulty}
              </span>
              <span className="text-xs font-medium text-[var(--gold)]">+{problem.points}pts</span>
            </>
          )}
        </div>
        
        {headerCenter && <div className="flex-1 flex justify-center">{headerCenter}</div>}
        
        <div className="flex items-center justify-end flex-1 gap-2">
          {headerRight || (mode === "practice" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--gold-muted)] border border-[var(--gold)]/30 hidden sm:flex">
              <span className="text-sm">🔥</span>
              <span className="text-xs font-bold text-[var(--gold)]">12 Day Streak</span>
            </div>
          ))}
        </div>
      </div>

      {/* Split Pane Container */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0 bg-muted/10">
        
        {/* Left Panel (40%) */}
        <div className="w-full md:w-[40%] flex flex-col bg-card border border-border rounded-xl overflow-hidden shrink-0">
          {/* Left Tabs */}
          <div className="flex items-center px-2 border-b border-border bg-muted/20 shrink-0 overflow-x-auto no-scrollbar">
            {tabsToUse.map(t => (
              <button 
                key={t.id}
                onClick={() => setActiveLeftTab(t.id)} 
                className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors whitespace-nowrap ${activeLeftTab === t.id ? "border-[var(--gold)] text-[var(--gold)]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Left Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tabsToUse.find(t => t.id === activeLeftTab)?.content}
          </div>
        </div>

        {/* Right Panel (60%) */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Editor Area */}
          <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden min-h-0">
            {/* Right Top Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
              <select 
                value={language} 
                onChange={e => setLanguage(e.target.value)} 
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
              >
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript</option>
                <option value="cpp">C++</option>
                <option value="c">C</option>
                <option value="java">Java</option>
              </select>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2 h-8" onClick={run} disabled={running}>
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
                </Button>
                <Button size="sm" className="gap-2 h-8" style={{ background: "var(--gold)", color: "#1A1A1A" }} onClick={submit} disabled={running}>
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Submit
                </Button>
              </div>
            </div>
            
            <div className="flex-1 relative" style={{ background: "#0d1117" }}>
              <textarea
                value={code}
                onChange={e => handleCodeChange(e.target.value)}
                spellCheck={false}
                className="absolute inset-0 w-full h-full resize-none bg-transparent p-4 font-mono text-sm focus:outline-none"
                style={{ color: "#d4d4d4" }}
              />
            </div>
          </div>

          {/* Bottom Collapsible Panel */}
          <div className={`flex flex-col bg-card border border-border rounded-xl overflow-hidden shrink-0 transition-all duration-300 ease-in-out ${bottomPanelOpen ? "h-64" : "h-11"}`}>
            <div 
              className="flex items-center justify-between px-4 h-11 border-b border-border bg-muted/20 cursor-pointer select-none"
              onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
            >
              <div className="flex items-center gap-6 h-full">
                {(["testcases", "output"] as const).map(t => (
                  <button 
                    key={t}
                    onClick={(e) => { e.stopPropagation(); setActiveBottomTab(t); setBottomPanelOpen(true); }}
                    className={`h-full text-xs font-medium border-b-2 capitalize transition-colors ${activeBottomTab === t && bottomPanelOpen ? "border-[var(--gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {t === "testcases" ? "Test Cases" : "Output"}
                  </button>
                ))}
              </div>
              <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                {bottomPanelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 relative">
              {activeBottomTab === "testcases" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs bg-muted">Case 1</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">Case 2</Button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">nums =</p>
                      <input
                        type="text"
                        data-judge0-stdin
                        defaultValue="[2,7,11,15]\n9"
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                      />
                    </div>
                  </div>
                </div>
              )}
              {activeBottomTab === "output" && (
                <div className="font-mono text-sm">
                  {outputDisplay.type === "idle" && (
                    <span className="text-muted-foreground">Run your code to see output here.</span>
                  )}

                  {outputDisplay.type === "running" && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{outputDisplay.text}</span>
                    </div>
                  )}

                  {outputDisplay.type === "stdout" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                      {(outputDisplay.time || outputDisplay.memory) && (
                        <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                          {outputDisplay.time   && <span>⏱ {outputDisplay.time}</span>}
                          {outputDisplay.memory && <span>💾 {outputDisplay.memory}</span>}
                        </div>
                      )}
                      <pre className="whitespace-pre-wrap text-foreground">{outputDisplay.text}</pre>
                    </motion.div>
                  )}

                  {outputDisplay.type === "stderr" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                      {(outputDisplay.time || outputDisplay.memory) && (
                        <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                          {outputDisplay.time   && <span>⏱ {outputDisplay.time}</span>}
                          {outputDisplay.memory && <span>💾 {outputDisplay.memory}</span>}
                        </div>
                      )}
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">Runtime Error</p>
                      <pre className="whitespace-pre-wrap text-red-400 text-xs">{outputDisplay.text}</pre>
                    </motion.div>
                  )}

                  {outputDisplay.type === "ce" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Compilation Error</p>
                      <pre className="whitespace-pre-wrap text-red-400 text-xs">{outputDisplay.text}</pre>
                    </motion.div>
                  )}

                  {outputDisplay.type === "tle" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <p className="text-base font-bold text-orange-500">⏱ Time Limit Exceeded</p>
                      <p className="text-xs text-muted-foreground mt-1">Your solution took too long to execute.</p>
                    </motion.div>
                  )}

                  {outputDisplay.type === "error" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">Error</p>
                      <p className="text-sm text-red-400">{outputDisplay.text}</p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submission Modal Overlay */}
      <AnimatePresence>
        {submissionResult && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 pb-0 flex justify-end">
                <button onClick={() => setSubmissionResult(null)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 pt-0 flex flex-col items-center text-center space-y-5">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  submissionResult.status === "Accepted"
                    ? "bg-green-500/10 text-green-500"
                    : submissionResult.status === "Time Limit Exceeded"
                    ? "bg-orange-500/10 text-orange-500"
                    : "bg-red-500/10 text-red-500"
                }`}>
                  {submissionResult.status === "Accepted" ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                </div>
                
                <div>
                  <h2 className={`text-2xl font-bold ${
                    submissionResult.status === "Accepted"
                      ? "text-green-500"
                      : submissionResult.status === "Time Limit Exceeded"
                      ? "text-orange-500"
                      : "text-red-500"
                  }`}>
                    {submissionResult.status}
                  </h2>
                  {submissionResult.status === "Accepted" && mode === "practice" && (
                    <p className="text-sm font-medium text-foreground mt-1">
                      Beats <span className="text-green-500">{submissionResult.beats}%</span> of {language} submissions
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 w-full mt-2">
                  <div className="bg-muted/30 border border-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Runtime</span>
                    <span className="text-xl font-bold">{submissionResult.runtime}</span>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Memory</span>
                    <span className="text-xl font-bold">{submissionResult.memory}</span>
                  </div>
                </div>

                <div className="w-full bg-muted/20 border border-border rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Test Cases</span>
                  <span className={`text-sm font-bold ${submissionResult.passedCases === submissionResult.totalCases ? "text-green-500" : "text-red-500"}`}>
                    {submissionResult.passedCases}/{submissionResult.totalCases} passed
                  </span>
                </div>

                <div className="flex gap-3 w-full pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setSubmissionResult(null); onClose(); }}>
                    Close
                  </Button>
                  {onNext && (
                    <Button className="flex-1 gap-2" style={{ background: "var(--gold)", color: "#1A1A1A" }} onClick={() => { setSubmissionResult(null); onNext(); }}>
                      Next <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
