import { useState, useEffect, useRef } from "react";
import { TestAnalyticsModal } from "./TestAnalyticsModal";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Search, ClipboardList, Clock, Calendar, CheckCircle2,
  ChevronRight, ChevronLeft, GripVertical, Trash2, Edit2, Play,
  Users, Loader2, Upload, X, Award, User,
} from "lucide-react";
import {
  getTests, createTest, addTestQuestion, publishTest,
  updateTest, deleteTest, getTestAttempts, getBatches,
  getTest, updateTestQuestion, deleteTestQuestion, getAttemptResult,
} from "@/shared/lib/api";
import { toast } from "sonner";

interface TestManagementPageProps {
  userType: "admin" | "faculty";
}

type Tab = "all" | "create";

export function TestManagementPage({ userType }: TestManagementPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [step, setStep] = useState(1);

  const handleCreated = () => { setActiveTab("all"); setStep(1); };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">Test Management</h1>
          <p className="text-muted-foreground">Create and manage coding, aptitude, and mock interview tests.</p>
        </div>
        <div className="flex bg-card p-1 rounded-xl border shadow-sm">
          <button
            onClick={() => { setActiveTab("all"); setStep(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "all" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            All Tests
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "create" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Create Test
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "all" ? (
          <motion.div key="all" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <AllTestsTab />
          </motion.div>
        ) : (
          <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <CreateTestTab step={step} setStep={setStep} onCreated={handleCreated} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Question display card (read-only row inside edit modal) ───────────────────

function QuestionDisplayCard({
  question, index, deleting, onEdit, onDelete,
}: {
  question: any; index: number; deleting: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const correctLetter = question.type === "mcq" && question.correct_answer !== undefined
    ? String.fromCharCode(65 + parseInt(question.correct_answer))
    : null;

  return (
    <div className="flex gap-3 p-4 border rounded-xl bg-background items-start">
      <span className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-black text-muted-foreground mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-bold uppercase text-muted-foreground">{question.type}</span>
          <span className="text-xs font-bold text-primary">{question.marks} mark{question.marks !== 1 ? "s" : ""}</span>
          {correctLetter && (
            <span className="text-xs text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded font-semibold">
              ✓ {correctLetter}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground font-medium leading-snug line-clamp-2">{question.question}</p>
        {question.type === "mcq" && Array.isArray(question.options) && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {question.options.map((opt: string, i: number) => (
              <span key={i} className={`text-xs px-2 py-1 rounded truncate ${
                question.correct_answer === String(i)
                  ? "bg-green-500/10 text-green-700 font-semibold"
                  : "bg-muted text-muted-foreground"
              }`}>
                {String.fromCharCode(65 + i)}. {opt || <span className="italic opacity-50">empty</span>}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} title="Edit question"
          className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} disabled={deleting} title="Delete question"
          className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg text-muted-foreground transition-colors disabled:opacity-40">
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Inline question form (used for both edit and add) ────────────────────────

function QuestionEditForm({
  question, index, onSave, onCancel,
}: {
  question: any | null;
  index: number;
  onSave: (payload: any) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    type:           question?.type           ?? "mcq",
    question:       question?.question       ?? "",
    marks:          question?.marks          ?? 1,
    options:        (Array.isArray(question?.options) && question.options.length === 4)
                      ? [...question.options]
                      : ["", "", "", ""],
    correct_answer: question?.correct_answer ?? "0",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.question.trim()) { toast.error("Question text is required"); return; }
    setSaving(true);
    const payload = {
      type:           form.type,
      question:       form.question.trim(),
      marks:          Number(form.marks) || 1,
      options:        form.type === "mcq" ? form.options : null,
      correct_answer: form.type === "mcq" ? form.correct_answer : null,
    };
    const ok = await onSave(payload);
    if (!ok) setSaving(false);
    // on success the parent unmounts this component — no need to setSaving(false)
  };

  return (
    <div className="p-4 border-2 border-primary/30 bg-primary/5 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
          {index + 1}
        </span>
        <span className="text-xs font-bold text-primary">{question ? "Editing question" : "New question"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Type</label>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
            className="w-full px-3 py-1.5 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="mcq">Multiple Choice</option>
            <option value="coding">Coding</option>
            <option value="short">Short Answer</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Marks</label>
          <input type="number" min={1} value={form.marks}
            onChange={e => setForm({ ...form, marks: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-1.5 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Question Text</label>
        <textarea value={form.question} rows={2} placeholder="Enter question text…"
          onChange={e => setForm({ ...form, question: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
      </div>

      {form.type === "mcq" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Options — click ○ to mark correct</label>
          <div className="space-y-1.5">
            {form.options.map((opt: string, idx: number) => {
              const isCorrect = form.correct_answer === String(idx);
              return (
                <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all ${
                  isCorrect ? "border-green-500 bg-green-500/5" : "border-border bg-background"
                }`}>
                  <button type="button"
                    onClick={() => setForm({ ...form, correct_answer: String(idx) })}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                      isCorrect ? "border-green-500 bg-green-500" : "border-muted-foreground/40 hover:border-green-500"
                    }`}>
                    {isCorrect && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`w-5 h-5 text-xs font-black shrink-0 flex items-center justify-center rounded ${
                    isCorrect ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <input type="text" value={opt} placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    onChange={e => { const o = [...form.options]; o[idx] = e.target.value; setForm({ ...form, options: o }); }}
                    className="flex-1 px-2 py-1 text-sm bg-transparent border border-muted rounded focus:outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm font-semibold hover:bg-muted rounded-lg transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !form.question.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {question ? "Update" : "Add Question"}
        </button>
      </div>
    </div>
  );
}

// ── Edit Test Modal — details + questions ─────────────────────────────────────

function EditTestModal({ test, onClose, onSaved }: { test: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title:        test.title        ?? "",
    type:         test.type         ?? "aptitude",
    duration_mins: test.duration_mins ?? 60,
    scheduled_at: test.scheduled_at ? test.scheduled_at.slice(0, 16) : "",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQs, setLoadingQs] = useState(true);
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [addingQ, setAddingQ] = useState(false);
  const [deletingQId, setDeletingQId] = useState<string | null>(null);

  useEffect(() => {
    getTest(test.id).then(({ data }) => {
      const qs = data?.test_questions ?? [];
      qs.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setQuestions(qs);
      setLoadingQs(false);
    });
  }, [test.id]);

  const handleSaveDetails = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSavingDetails(true);
    const { error } = await updateTest(test.id, {
      title:        form.title.trim(),
      type:         form.type as "coding" | "aptitude" | "mock",
      duration_mins: Number(form.duration_mins),
      scheduled_at: form.scheduled_at || undefined,
    });
    setSavingDetails(false);
    if (error) { toast.error(error); return; }
    toast.success("Test details updated");
    onSaved();
  };

  const handleUpdateQuestion = async (qId: string, payload: any): Promise<boolean> => {
    const { error } = await updateTestQuestion(test.id, qId, payload);
    if (error) { toast.error(error); return false; }
    setQuestions(qs => qs.map(q => q.id === qId ? { ...q, ...payload } : q));
    setEditingQId(null);
    toast.success("Question updated");
    return true;
  };

  const handleAddQuestion = async (payload: any): Promise<boolean> => {
    const { data, error } = await addTestQuestion(test.id, { ...payload, order_index: questions.length });
    if (error) { toast.error(error); return false; }
    if (data) setQuestions(qs => [...qs, data]);
    setAddingQ(false);
    toast.success("Question added");
    return true;
  };

  const handleDeleteQuestion = async (qId: string) => {
    setDeletingQId(qId);
    const { error } = await deleteTestQuestion(test.id, qId);
    setDeletingQId(null);
    if (error) { toast.error(error); return; }
    setQuestions(qs => qs.filter(q => q.id !== qId));
    toast.success("Question deleted");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold">Edit Test</h3>
            <p className="text-sm text-muted-foreground truncate max-w-xs">{test.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-8">

          {/* ── Details section ── */}
          <section>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Test Details</h4>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Test Title</label>
                <input type="text" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="coding">Coding</option>
                    <option value="aptitude">Aptitude</option>
                    <option value="mock">Mock</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Duration (mins)</label>
                  <input type="number" value={form.duration_mins}
                    onChange={e => setForm({ ...form, duration_mins: parseInt(e.target.value) || 60 })}
                    className="w-full px-3 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Scheduled Date & Time</label>
                <input type="datetime-local" value={form.scheduled_at}
                  onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                  className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="flex justify-end">
                <button onClick={handleSaveDetails} disabled={savingDetails}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {savingDetails && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Details
                </button>
              </div>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* ── Questions section ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Questions {!loadingQs && `(${questions.length})`}
              </h4>
            </div>

            {loadingQs ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading questions…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {questions.map((q, i) =>
                  editingQId === q.id ? (
                    <QuestionEditForm
                      key={q.id}
                      question={q}
                      index={i}
                      onSave={(payload) => handleUpdateQuestion(q.id, payload)}
                      onCancel={() => setEditingQId(null)}
                    />
                  ) : (
                    <QuestionDisplayCard
                      key={q.id}
                      question={q}
                      index={i}
                      deleting={deletingQId === q.id}
                      onEdit={() => { setAddingQ(false); setEditingQId(q.id); }}
                      onDelete={() => handleDeleteQuestion(q.id)}
                    />
                  )
                )}

                {questions.length === 0 && !addingQ && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No questions yet.</p>
                )}

                {addingQ ? (
                  <QuestionEditForm
                    key="new"
                    question={null}
                    index={questions.length}
                    onSave={handleAddQuestion}
                    onCancel={() => setAddingQ(false)}
                  />
                ) : (
                  <button
                    onClick={() => { setEditingQId(null); setAddingQ(true); }}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl hover:bg-muted/40 text-muted-foreground text-sm font-semibold transition-colors">
                    <Plus className="w-4 h-4" /> Add Question
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 font-semibold border border-border rounded-xl hover:bg-muted transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Attempt detail modal — per-question breakdown ─────────────────────────────

function AttemptDetailModal({
  attempt, detail, loading, onBack, onClose,
}: {
  attempt: any; detail: any; loading: boolean; onBack: () => void; onClose: () => void;
}) {
  const answers: any[] = (detail?.test_answers ?? []).slice().sort(
    (a: any, b: any) => (a.test_questions?.order_index ?? 0) - (b.test_questions?.order_index ?? 0)
  );
  const totalPossible = answers.reduce((s, a) => s + (a.test_questions?.marks ?? 0), 0);
  const score = detail?.score ?? 0;
  const pct = totalPossible > 0 ? Math.round((score / totalPossible) * 100) : 0;
  const correctCount = answers.filter(a => a.is_correct).length;

  const resolveOption = (options: any[], indexStr: string | null) => {
    if (!Array.isArray(options) || indexStr === null || indexStr === undefined || indexStr === "") return null;
    const idx = parseInt(indexStr);
    if (isNaN(idx) || idx < 0 || idx >= options.length) return null;
    return { letter: String.fromCharCode(65 + idx), text: options[idx] };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-border shrink-0">
          <button onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Back to list">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold">{attempt.profiles?.name ?? "Unknown"}</h3>
            <p className="text-sm text-muted-foreground truncate">{attempt.profiles?.email ?? ""}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading attempt…</span>
          </div>
        ) : !detail ? (
          <div className="py-20 text-center text-muted-foreground">
            <p>Could not load attempt details.</p>
          </div>
        ) : (
          <>
            {/* Score summary */}
            <div className="grid grid-cols-4 gap-0 border-b border-border shrink-0">
              {[
                { label: "Score",      value: `${score}/${totalPossible}`, color: "text-foreground" },
                { label: "Percentage", value: `${pct}%`,                   color: "text-[var(--gold)]" },
                { label: "Correct",    value: correctCount,                 color: "text-green-600" },
                { label: "Incorrect",  value: answers.length - correctCount, color: "text-red-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center py-5 border-r border-border last:border-r-0">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Per-question breakdown */}
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {answers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No answers were recorded for this attempt.</p>
              )}
              {answers.map((ans: any, i: number) => {
                const q = ans.test_questions;
                if (!q) return null;
                const isMcq = q.type === "mcq";
                const studentOpt = isMcq ? resolveOption(q.options, ans.answer) : null;
                const correctOpt = isMcq ? resolveOption(q.options, q.correct_answer) : null;
                const studentDisplay = isMcq
                  ? (studentOpt ? `${studentOpt.letter}. ${studentOpt.text}` : "No answer")
                  : (ans.answer ?? "No answer");
                const correctDisplay = isMcq
                  ? (correctOpt ? `${correctOpt.letter}. ${correctOpt.text}` : "—")
                  : (q.correct_answer ?? "—");
                const isCorrect = ans.is_correct;
                const marksAwarded = ans.marks_awarded ?? 0;

                return (
                  <div key={ans.id} className={`border rounded-xl p-4 ${
                    isCorrect ? "border-green-500/30 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                  }`}>
                    {/* Question header */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-black text-muted-foreground shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold uppercase text-muted-foreground">{q.type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${
                          isCorrect ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"
                        }`}>
                          {isCorrect ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {isCorrect ? "Correct" : "Incorrect"}
                        </span>
                        <span className={`text-sm font-bold ${isCorrect ? "text-green-600" : "text-muted-foreground"}`}>
                          {marksAwarded}/{q.marks}
                        </span>
                      </div>
                    </div>

                    {/* Question text */}
                    <p className="text-sm font-semibold text-foreground mb-3 leading-snug">{q.question}</p>

                    {/* Answer comparison */}
                    <div className={`grid gap-3 ${!isCorrect ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                      <div className={`rounded-lg p-3 border ${
                        isCorrect
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-red-400/30 bg-red-500/5"
                      }`}>
                        <p className="text-xs font-bold text-muted-foreground mb-1">Student's Answer</p>
                        <p className={`text-sm font-medium ${isCorrect ? "text-green-700" : "text-red-600"}`}>
                          {studentDisplay}
                        </p>
                      </div>
                      {!isCorrect && (
                        <div className="rounded-lg p-3 border border-green-500/30 bg-green-500/5">
                          <p className="text-xs font-bold text-muted-foreground mb-1">Correct Answer</p>
                          <p className="text-sm font-medium text-green-700">{correctDisplay}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Test Results Modal — list view + drill-down ───────────────────────────────

function TestResultsModal({ test, onClose }: { test: any; onClose: () => void }) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    getTestAttempts(test.id).then(({ data }) => {
      setAttempts(data || []);
      setLoading(false);
    });
  }, [test.id]);

  const handleSelectAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    setDetail(null);
    setDetailLoading(true);
    const { data } = await getAttemptResult(attempt.id);
    setDetail(data);
    setDetailLoading(false);
  };

  const handleBack = () => { setSelectedAttempt(null); setDetail(null); };

  if (selectedAttempt) {
    return (
      <AttemptDetailModal
        attempt={selectedAttempt}
        detail={detail}
        loading={detailLoading}
        onBack={handleBack}
        onClose={onClose}
      />
    );
  }

  const submitted = attempts.filter(a => a.status === "submitted");
  const avgScore = submitted.length
    ? Math.round(submitted.reduce((s, a) => s + (a.score || 0), 0) / submitted.length)
    : 0;
  const maxScore = submitted.length ? Math.max(...submitted.map(a => a.score || 0)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold">{test.title}</h3>
            <p className="text-sm text-muted-foreground">Student Results — click a row to view detail</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading results…</span>
          </div>
        ) : attempts.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No attempts yet</p>
            <p className="text-sm">Students will appear here once they attempt this test.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0 border-b border-border shrink-0">
              {[
                { label: "Total Attempts", value: attempts.length,   color: "text-foreground" },
                { label: "Avg Score",      value: avgScore,          color: "text-[var(--gold)]" },
                { label: "Highest Score",  value: maxScore,          color: "text-green-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center py-5 border-r border-border last:border-r-0">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Student</th>
                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                    <th className="px-6 py-3 text-left font-semibold">Score</th>
                    <th className="px-6 py-3 text-left font-semibold">Submitted</th>
                    <th className="px-6 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attempts.map((attempt: any) => (
                    <tr
                      key={attempt.id}
                      onClick={() => handleSelectAttempt(attempt)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {attempt.profiles?.name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{attempt.profiles?.name ?? "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{attempt.profiles?.email ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                          attempt.status === "submitted"
                            ? "bg-green-500/10 text-green-600"
                            : "bg-yellow-500/10 text-yellow-600"
                        }`}>
                          {attempt.status === "submitted" ? "Submitted" : "In Progress"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {attempt.status === "submitted"
                          ? <span className="font-bold text-foreground">{attempt.score ?? 0}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── All Tests Tab ─────────────────────────────────────────────────────────────

function AllTestsTab() {
  const [filterType, setFilterType] = useState("all");
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingTest, setEditingTest] = useState<any | null>(null);
  const [resultsTest, setResultsTest] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTests = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filterType !== "all") params.type = filterType;
    const { data } = await getTests(Object.keys(params).length ? params : undefined);
    setTests(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTests(); }, [filterType]);

  const handlePublish = async (testId: string) => {
    const { error } = await publishTest(testId);
    if (error) { toast.error(error); return; }
    toast.success("Test published!");
    fetchTests();
  };

  const handleDelete = async (testId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(testId);
    const { error } = await deleteTest(testId);
    setDeletingId(null);
    if (error) { toast.error(error); return; }
    toast.success("Test deleted");
    fetchTests();
  };

  const filtered = tests.filter(t =>
    !search || t.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {editingTest && (
        <EditTestModal
          test={editingTest}
          onClose={() => setEditingTest(null)}
          onSaved={fetchTests}
        />
      )}
      {resultsTest && (
        <TestAnalyticsModal
          test={resultsTest}
          onClose={() => setResultsTest(null)}
        />
      )}

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tests…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
          >
            <option value="all">All Types</option>
            <option value="coding">Coding</option>
            <option value="aptitude">Aptitude</option>
            <option value="mock">Mock</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 bg-card border rounded-2xl">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading tests…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No tests found.</p>
            <p className="text-sm mt-1">Create one to get started.</p>
          </div>
        ) : (
          <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-6 py-4">Test Title</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Questions</th>
                    <th className="px-6 py-4">Created By</th>
                    <th className="px-6 py-4">Schedule</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((test: any) => (
                    <tr key={test.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground max-w-xs">
                        <p className="truncate">{test.title}</p>
                        {test.duration_mins && (
                          <p className="text-xs text-muted-foreground font-normal flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {test.duration_mins} min
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          test.type === "coding"   ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                          test.type === "aptitude" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                                     "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {test.type?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {test.test_questions?.[0]?.count ?? 0} Qs
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-sm">{test.profiles?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>{test.scheduled_at ? new Date(test.scheduled_at).toLocaleDateString() : "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                          test.status === "published" ? "bg-green-500/10 text-green-600 border-green-500/20" :
                          test.status === "completed" ? "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20" :
                                                        "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                        }`}>
                          {test.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingTest(test)}
                            title="Edit test"
                            className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setResultsTest(test)}
                            title="View results"
                            className="p-1.5 hover:bg-blue-500/10 hover:text-blue-600 rounded-lg text-muted-foreground transition-colors">
                            <Users className="w-4 h-4" />
                          </button>
                          {test.status === "draft" && (
                            <button
                              onClick={() => handlePublish(test.id)}
                              title="Publish test"
                              className="p-1.5 hover:bg-green-500/10 hover:text-green-600 rounded-lg text-muted-foreground transition-colors">
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(test.id, test.title)}
                            disabled={deletingId === test.id}
                            title="Delete test"
                            className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg text-muted-foreground transition-colors disabled:opacity-40">
                            {deletingId === test.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Create Test Wizard ────────────────────────────────────────────────────────

function CreateTestTab({ step, setStep, onCreated }: { step: number; setStep: (s: number) => void; onCreated?: () => void }) {
  const [formData, setFormData] = useState({
    title: "", type: "coding", batch_id: "", duration_mins: 60, scheduled_at: "",
  });
  const [questions, setQuestions] = useState<any[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => { getBatches().then(({ data }) => setBatches(data || [])); }, []);

  const handleNext = () => setStep(Math.min(step + 1, 3));
  const handlePrev = () => setStep(Math.max(step - 1, 1));

  const createTestWithQuestions = async () => {
    const { data: testData, error: testError } = await createTest({
      title: formData.title,
      type: formData.type as "coding" | "aptitude" | "mock",
      batch_id: formData.batch_id || undefined,
      duration_mins: formData.duration_mins,
      scheduled_at: formData.scheduled_at || undefined,
    });
    if (testError || !testData) throw new Error(testError || "Failed to create test");
    for (const q of questions) {
      const { error: qError } = await addTestQuestion(testData.id, {
        question: q.question,
        type: q.type as "mcq" | "coding" | "short",
        options: q.type === "mcq" ? q.options : undefined,
        correct_answer: q.type === "mcq" ? q.correct_answer : undefined,
        marks: q.marks,
        order_index: questions.indexOf(q),
      });
      if (qError) toast.error(`Failed to add question: ${qError}`);
    }
    return testData;
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const testData = await createTestWithQuestions();
      await publishTest(testData.id);
      toast.success("Test created and published!");
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to create test");
    }
    setPublishing(false);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await createTestWithQuestions();
      toast.success("Test saved as draft!");
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save draft");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full -z-10" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-300"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        />
        {[1, 2, 3].map(s => (
          <div key={s} className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
              step >= s ? "bg-primary text-primary-foreground shadow-md" : "bg-card text-muted-foreground border-2"
            }`}>
              {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
            </div>
            <span className={`text-xs font-semibold ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
              {s === 1 ? "Details" : s === 2 ? "Questions" : "Review"}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-2xl p-6 sm:p-8 shadow-sm min-h-[400px]">
        {step === 1 && <Step1Details formData={formData} setFormData={setFormData} onNext={handleNext} batches={batches} />}
        {step === 2 && <Step2Questions questions={questions} setQuestions={setQuestions} onNext={handleNext} onPrev={handlePrev} />}
        {step === 3 && (
          <Step3Review
            formData={formData} questions={questions}
            onPublish={handlePublish} onSaveDraft={handleSaveDraft}
            onPrev={handlePrev} publishing={publishing} saving={saving}
          />
        )}
      </div>
    </div>
  );
}

function Step1Details({ formData, setFormData, onNext, batches = [] }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Test Details</h2>
        <p className="text-sm text-muted-foreground">Configure the basic settings for this test.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Test Title</label>
          <input type="text" value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Mid-term Assessment"
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold">Test Type</label>
          <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="coding">Coding</option>
            <option value="aptitude">Aptitude (MCQ)</option>
            <option value="mock">Mock Interview</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold">Target Batch</label>
          <select value={formData.batch_id} onChange={e => setFormData({ ...formData, batch_id: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All students</option>
            {batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold">Duration (minutes)</label>
          <input type="number" value={formData.duration_mins}
            onChange={e => setFormData({ ...formData, duration_mins: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold">Scheduled Date & Time</label>
          <input type="datetime-local" value={formData.scheduled_at}
            onChange={e => setFormData({ ...formData, scheduled_at: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <button onClick={onNext} disabled={!formData.title}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
          Next Step <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── CSV / JSON question parser ─────────────────────────────────────────────────

// Normalize correct_answer to a 0-based string index.
// Accepts: numeric index (0-3), letter ("a"-"d"), or option text (ignored → "0").
function normalizeCorrectAnswer(val: unknown): string {
  if (val === undefined || val === null) return "0";
  const s = String(val).toLowerCase().trim();
  const letterIdx = ["a", "b", "c", "d"].indexOf(s);
  if (letterIdx >= 0) return String(letterIdx);
  const n = parseInt(s);
  if (!isNaN(n) && n >= 0 && n <= 3) return String(n);
  return "0";
}

function parseQuestionsFile(text: string, filename: string): { questions: any[]; errors: string[] } {
  const questions: any[] = [];
  const errors: string[] = [];
  if (filename.endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : data.questions || [];
      arr.forEach((q: any, i: number) => {
        if (!q.question) { errors.push(`Item ${i + 1}: missing "question" field`); return; }
        questions.push({
          id: Date.now().toString() + i, type: q.type || "mcq", question: q.question,
          marks: Number(q.marks) || 1, options: q.options || ["", "", "", ""],
          correct_answer: normalizeCorrectAnswer(q.correct_answer),
        });
      });
    } catch { errors.push("Invalid JSON file"); }
  } else {
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    let start = 0;
    if (lines[0] && /type|question/i.test(lines[0])) start = 1;
    lines.slice(start).forEach((line, idx) => {
      const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
      const [type, question, optA, optB, optC, optD, correct, marksStr] = cols;
      if (!question) { errors.push(`Row ${idx + start + 2}: missing question`); return; }
      const qType = (type || "mcq").toLowerCase();
      const marks = Number(marksStr) || 1;
      const correctIdx = correct ? ["a","b","c","d"].indexOf(correct.toLowerCase().trim()) : 0;
      questions.push({
        id: Date.now().toString() + idx, type: qType, question, marks,
        options: [optA || "", optB || "", optC || "", optD || ""],
        correct_answer: correctIdx >= 0 ? String(correctIdx) : "0",
      });
    });
  }
  return { questions, errors };
}

function ImportQuestionsModal({ onClose, onImported }: { onClose: () => void; onImported: (qs: any[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ questions: any[]; errors: string[] } | null>(null);
  const [filename, setFilename] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = ev => setPreview(parseQuestionsFile(ev.target?.result as string, file.name));
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">Import Questions from File</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="font-medium text-foreground">Supported formats:</p>
            <p><span className="font-mono bg-muted px-1 rounded">.csv</span> — type, question, option_a–d, correct (a/b/c/d), marks</p>
            <p><span className="font-mono bg-muted px-1 rounded">.json</span> — array of {"{ type, question, options[], correct_answer, marks }"}</p>
          </div>
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/10 transition-colors"
            onClick={() => fileRef.current?.click()}>
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{filename || "Click to upload CSV or JSON"}</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv and .json</p>
            <input ref={fileRef} type="file" accept=".csv,.json,.txt" className="hidden" onChange={handleFile} />
          </div>
          {preview && (
            <div className="rounded-lg border border-border overflow-hidden text-sm">
              {preview.questions.length > 0 && (
                <div className="p-3 bg-[var(--gold-muted)]">
                  <p className="font-medium text-foreground">{preview.questions.length} question{preview.questions.length !== 1 ? "s" : ""} ready to import</p>
                  <div className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
                    {preview.questions.slice(0, 4).map((q, i) => (
                      <p key={i} className="text-xs text-muted-foreground truncate">Q{i+1}: [{q.type.toUpperCase()}] {q.question}</p>
                    ))}
                    {preview.questions.length > 4 && <p className="text-xs text-muted-foreground">+{preview.questions.length - 4} more…</p>}
                  </div>
                </div>
              )}
              {preview.errors.length > 0 && (
                <div className="p-3 bg-red-500/5 border-t border-border">
                  <p className="text-xs font-medium text-red-500">{preview.errors.length} row{preview.errors.length !== 1 ? "s" : ""} skipped</p>
                  {preview.errors.slice(0, 3).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 py-2 text-sm font-bold rounded-xl text-[#1A1A1A] disabled:opacity-50"
              style={{ background: "var(--gold)" }}
              disabled={!preview || preview.questions.length === 0}
              onClick={() => { if (preview) { onImported(preview.questions); onClose(); } }}>
              Add {preview?.questions.length ?? 0} Questions
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2Questions({ questions, setQuestions, onNext, onPrev }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newQ, setNewQ] = useState({ type: "mcq", question: "", marks: 1, options: ["","","",""], correct_answer: "0" });

  const handleAdd = () => {
    setQuestions([...questions, { ...newQ, id: Date.now().toString() }]);
    setIsAdding(false);
    setNewQ({ type: "mcq", question: "", marks: 1, options: ["","","",""], correct_answer: "0" });
  };

  return (
    <div className="space-y-6">
      {showImport && (
        <ImportQuestionsModal onClose={() => setShowImport(false)} onImported={qs => setQuestions([...questions, ...qs])} />
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Questions</h2>
          <p className="text-sm text-muted-foreground">Add questions manually or import from CSV / JSON.</p>
        </div>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted transition-colors shrink-0">
          <Upload className="w-4 h-4" /> Import File
        </button>
      </div>

      <div className="space-y-4">
        {questions.map((q: any, i: number) => (
          <div key={q.id} className="flex gap-4 p-4 border rounded-xl bg-background items-start">
            <GripVertical className="w-5 h-5 text-muted-foreground cursor-move mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold bg-muted px-2 py-1 rounded">Q{i+1}</span>
                <span className="text-xs font-bold text-muted-foreground uppercase">{q.type}</span>
                <span className="text-xs font-bold text-primary ml-auto">{q.marks} Mark(s)</span>
              </div>
              <p className="text-sm font-medium">{q.question}</p>
            </div>
            <button onClick={() => setQuestions(questions.filter((_: any, idx: number) => idx !== i))}
              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {!isAdding ? (
          <button onClick={() => setIsAdding(true)}
            className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground">
            <Plus className="w-8 h-8 mb-2" />
            <span className="font-semibold">Add New Question</span>
          </button>
        ) : (
          <div className="p-5 border rounded-xl bg-muted/20 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold">Question Type</label>
                <select value={newQ.type} onChange={e => setNewQ({...newQ, type: e.target.value})}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="mcq">Multiple Choice</option>
                  <option value="coding">Coding Problem</option>
                  <option value="short">Short Answer</option>
                </select>
              </div>
              <div className="w-24 space-y-2">
                <label className="text-xs font-bold">Marks</label>
                <input type="number" value={newQ.marks} onChange={e => setNewQ({...newQ, marks: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold">Question Text</label>
              <textarea value={newQ.question} onChange={e => setNewQ({...newQ, question: e.target.value})} rows={3}
                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter your question here…" />
            </div>
            {newQ.type === "mcq" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold">Answer Options</label>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Click the circle to mark correct answer</span>
                </div>
                {newQ.options.map((opt, idx) => {
                  const isCorrect = newQ.correct_answer === idx.toString();
                  const letter = String.fromCharCode(65 + idx);
                  return (
                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      isCorrect ? "border-green-500 bg-green-500/5" : "border-muted bg-background"
                    }`}>
                      <button type="button" onClick={() => setNewQ({...newQ, correct_answer: idx.toString()})}
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isCorrect ? "border-green-500 bg-green-500 text-white"
                                    : "border-muted-foreground/40 hover:border-green-500 text-transparent hover:text-green-500"
                        }`}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                        isCorrect ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                      }`}>{letter}</span>
                      <input type="text" value={opt} placeholder={`Option ${letter}`}
                        onChange={e => { const opts=[...newQ.options]; opts[idx]=e.target.value; setNewQ({...newQ, options: opts}); }}
                        className="flex-1 px-3 py-1.5 text-sm bg-transparent border border-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      {isCorrect && (
                        <span className="text-xs font-bold text-green-600 bg-green-500/10 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-semibold hover:bg-muted rounded-lg">Cancel</button>
              <button onClick={handleAdd} disabled={!newQ.question}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50">
                Save Question
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onPrev} className="px-6 py-2.5 font-bold hover:bg-muted rounded-xl transition-colors">Back</button>
        <button onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity">
          Review <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Step3Review({ formData, questions, onPublish, onSaveDraft, onPrev, publishing, saving }: any) {
  const totalMarks = questions.reduce((sum: number, q: any) => sum + q.marks, 0);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Review & Publish</h2>
        <p className="text-sm text-muted-foreground">Verify test details before publishing.</p>
      </div>
      <div className="bg-muted/30 border rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">{formData.title}</h3>
            <p className="text-sm text-muted-foreground capitalize">{formData.type} Test</p>
          </div>
          <span className="px-3 py-1 bg-primary/10 text-primary font-bold rounded-lg text-sm border border-primary/20">
            {questions.length} Questions
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</span>
            <p className="font-semibold">{formData.duration_mins} mins</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Schedule</span>
            <p className="font-semibold text-sm">{formData.scheduled_at ? new Date(formData.scheduled_at).toLocaleString() : "Not set"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Batch</span>
            <p className="font-semibold text-sm">{formData.batch_id || "All students"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Award className="w-3 h-3" /> Total Marks</span>
            <p className="font-semibold text-sm">{totalMarks}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-between pt-6 border-t">
        <button onClick={onPrev} disabled={publishing || saving}
          className="px-6 py-2.5 font-bold hover:bg-muted rounded-xl transition-colors disabled:opacity-50">
          Back
        </button>
        <div className="flex gap-3">
          <button onClick={onSaveDraft} disabled={publishing || saving}
            className="flex items-center gap-2 px-6 py-2.5 font-bold border hover:bg-muted rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save as Draft
          </button>
          <button onClick={onPublish} disabled={publishing || saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Publish Test
          </button>
        </div>
      </div>
    </div>
  );
}
