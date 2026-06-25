import { useState, useEffect } from "react";
import { ClipboardList, FileCheck, X, Download, Send, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { getSubmissions, gradeSubmission as submitGrade } from "@/shared/lib/api";

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Graded: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Returned: "bg-[var(--gold-muted)] text-[var(--gold)]",
};

function GradeModal({ submission, onClose, onSuccess }: { submission: any; onClose: () => void; onSuccess: () => void }) {
  const [score, setScore] = useState(submission.grade !== null ? String(submission.grade) : "");
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const [rubric, setRubric] = useState({ correctness: 0, style: 0, efficiency: 0 });
  const [loading, setLoading] = useState(false);

  const maxScore = submission.assignments?.max_marks || 100;
  const rubricTotal = rubric.correctness + rubric.style + rubric.efficiency;

  const handleGradeSubmit = async () => {
    const finalGrade = Number(score) || rubricTotal;
    setLoading(true);
    try {
      await submitGrade(submission.id, finalGrade, feedback);
      toast.success(`Grade submitted for ${submission.profiles?.name}`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit grade");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Grade Submission</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{submission.profiles?.name} · {submission.assignments?.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Submission info */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">{submission.file_url}</p>
              <p className="text-xs text-muted-foreground">Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.success(`Downloading ${submission.file_url}…`)}>
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
          </div>

          {/* Rubric */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Rubric Scoring</h3>
            <div className="space-y-3">
              {[
                { key: "correctness" as const, label: "Correctness", max: 40 },
                { key: "style" as const, label: "Code Style", max: 30 },
                { key: "efficiency" as const, label: "Efficiency", max: 30 },
              ].map(({ key, label, max }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground w-28 shrink-0">{label} /{max}</label>
                  <input
                    type="range" min={0} max={max} value={rubric[key]}
                    onChange={e => setRubric(r => ({ ...r, [key]: Number(e.target.value) }))}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-sm font-semibold text-foreground w-8 text-right tabular-nums">{rubric[key]}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium text-foreground">Rubric total</span>
                <span className="text-lg font-bold text-foreground tabular-nums">{rubricTotal} / 100</span>
              </div>
            </div>
          </div>

          {/* Manual score override */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Final Score (override)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" min={0} max={maxScore}
                value={score || rubricTotal}
                onChange={e => setScore(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">/ {maxScore}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({Math.round(((Number(score) || rubricTotal) / maxScore) * 100)}%)
              </span>
            </div>
          </div>

          {/* Feedback */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Feedback to student</label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={4}
              placeholder="Write detailed feedback here…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1 gap-2" onClick={handleGradeSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit Grade & Feedback
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function AssignmentReviewPage() {
  const [tab, setTab] = useState<"Pending" | "Graded" | "Returned">("Pending");
  const [grading, setGrading] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const { data } = await getSubmissions();
      setSubmissions(data || []);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  // Compute stats
  const mappedSubmissions = submissions.map(s => ({
    ...s,
    uiStatus: s.grade === null ? "Pending" : "Graded"
  }));

  const filtered = mappedSubmissions.filter(s => 
    tab === "Returned" ? false : s.uiStatus === tab // Returned is mock state, just map Grade -> Graded
  );
  const pendingCount = mappedSubmissions.filter(s => s.uiStatus === "Pending").length;
  const gradedCount = mappedSubmissions.filter(s => s.uiStatus === "Graded").length;

  return (
    <div className="p-8">
      {grading && <GradeModal 
        submission={grading} 
        onClose={() => setGrading(null)} 
        onSuccess={() => {
          setGrading(null);
          loadSubmissions();
        }}
      />}

      <PageHeader title="Assignment Reviews" description="Grade submissions, provide feedback, and track completion." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Pending review" value={String(pendingCount)} icon={ClipboardList} trend={{ value: "Action needed", isPositive: false }} />
        <StatCard title="Graded" value={String(gradedCount)} icon={FileCheck} trend={{ value: "Total completed", isPositive: true }} />
        <StatCard title="Avg score given" value="82%" icon={FileCheck} trend={{ value: "+3% vs last batch", isPositive: true }} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-lg w-fit">
        {(["Pending", "Graded"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            <span className="ml-1.5 text-xs opacity-60">{mappedSubmissions.filter(s => s.uiStatus === t).length}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length} submission{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No {tab.toLowerCase()} submissions.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(sub => (
              <div key={sub.id} className="px-6 py-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[var(--gold-muted)] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-[var(--gold)]">{sub.profiles?.name?.charAt(0) || "U"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground">{sub.profiles?.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.uiStatus]}`}>{sub.uiStatus}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{sub.assignments?.title}</p>
                      <p className="text-xs text-muted-foreground">{sub.assignments?.courses?.title || "Course"} · Submitted {new Date(sub.submitted_at).toLocaleDateString()}</p>
                      {sub.uiStatus !== "Pending" && sub.grade !== null && (
                        <p className="text-xs mt-1 font-medium text-foreground">Score: {sub.grade}/{sub.assignments?.max_marks || 100} · {Math.round((sub.grade / (sub.assignments?.max_marks || 100)) * 100)}%</p>
                      )}
                      {sub.feedback && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{sub.feedback}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.success(`Downloading ${sub.file_url}…`)}>
                      <Download className="w-3.5 h-3.5" /> File
                    </Button>
                    {sub.uiStatus === "Pending" && (
                      <Button size="sm" onClick={() => setGrading(sub)}>Grade</Button>
                    )}
                    {sub.uiStatus !== "Pending" && (
                      <Button size="sm" variant="secondary" onClick={() => setGrading(sub)}>Edit</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

