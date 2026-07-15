import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Search, Filter, ClipboardList, Clock, Calendar, CheckCircle2,
  ChevronRight, GripVertical, Trash2, Edit2, Play, Users, Loader2,
  Upload, X, Award, User, TrendingUp,
} from "lucide-react";
import { getTests, createTest, addTestQuestion, publishTest, updateTest, deleteTest, getTestAttempts, getBatches } from "@/shared/lib/api";
import { toast } from "sonner";

interface TestManagementPageProps {
  userType: "admin" | "faculty";
}

type Tab = "all" | "create";

export function TestManagementPage({ userType }: TestManagementPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [step, setStep] = useState(1);

  const handleCreated = () => {
    setActiveTab("all");
    setStep(1);
  };

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
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <AllTestsTab />
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <CreateTestTab step={step} setStep={setStep} onCreated={handleCreated} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Edit Test Modal ───────────────────────────────────────────────────────────

function EditTestModal({ test, onClose, onSaved }: { test: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: test.title ?? "",
    type: test.type ?? "aptitude",
    duration_mins: test.duration_mins ?? 60,
    scheduled_at: test.scheduled_at ? test.scheduled_at.slice(0, 16) : "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const { error } = await updateTest(test.id, {
      title: form.title.trim(),
      type: form.type as "coding" | "aptitude" | "mock",
      duration_mins: Number(form.duration_mins),
      scheduled_at: form.scheduled_at || undefined,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Test updated");
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-bold">Edit Test</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Test Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="coding">Coding</option>
                <option value="aptitude">Aptitude</option>
                <option value="mock">Mock</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Duration (mins)</label>
              <input
                type="number"
                value={form.duration_mins}
                onChange={(e) => setForm({ ...form, duration_mins: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Scheduled Date & Time</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 font-semibold border border-border rounded-xl hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Test Results Modal ────────────────────────────────────────────────────────

function TestResultsModal({ test, onClose }: { test: any; onClose: () => void }) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTestAttempts(test.id).then(({ data }) => {
      setAttempts(data || []);
      setLoading(false);
    });
  }, [test.id]);

  const submitted = attempts.filter((a) => a.status === "submitted");
  const avgScore = submitted.length
    ? Math.round(submitted.reduce((s: number, a: any) => s + (a.score || 0), 0) / submitted.length)
    : 0;
  const maxScore = submitted.length ? Math.max(...submitted.map((a: any) => a.score || 0)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold">{test.title}</h3>
            <p className="text-sm text-muted-foreground">Student Results</p>
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
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-border shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{attempts.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Attempts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: "var(--gold)" }}>{avgScore}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{maxScore}</p>
                <p className="text-xs text-muted-foreground mt-1">Highest Score</p>
              </div>
            </div>

            {/* Attempt list */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Student</th>
                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                    <th className="px-6 py-3 text-left font-semibold">Score</th>
                    <th className="px-6 py-3 text-left font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attempts.map((attempt: any) => (
                    <tr key={attempt.id} className="hover:bg-muted/30 transition-colors">
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
                        {attempt.status === "submitted" ? (
                          <span className="font-bold text-foreground">{attempt.score ?? 0}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {attempt.submitted_at
                          ? new Date(attempt.submitted_at).toLocaleString()
                          : "—"}
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

// ── All Tests Tab ──────────────────────────────────────────────────────────

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

  const filtered = tests.filter((t) =>
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
        <TestResultsModal
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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
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
                            className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors"
                            title="Edit test"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setResultsTest(test)}
                            className="p-1.5 hover:bg-blue-500/10 hover:text-blue-600 rounded-lg text-muted-foreground transition-colors"
                            title="View student results"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          {test.status === "draft" && (
                            <button
                              onClick={() => handlePublish(test.id)}
                              className="p-1.5 hover:bg-green-500/10 hover:text-green-600 rounded-lg text-muted-foreground transition-colors"
                              title="Publish test"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(test.id, test.title)}
                            disabled={deletingId === test.id}
                            className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg text-muted-foreground transition-colors disabled:opacity-40"
                            title="Delete test"
                          >
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

// ── Create Test Wizard ─────────────────────────────────────────────────────

function CreateTestTab({ step, setStep, onCreated }: { step: number; setStep: (s: number) => void; onCreated?: () => void }) {
  const [formData, setFormData] = useState({
    title: "",
    type: "coding",
    batch_id: "",
    duration_mins: 60,
    scheduled_at: "",
  });

  const [questions, setQuestions] = useState<any[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => {
    getBatches().then(({ data }) => setBatches(data || []));
  }, []);

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
        {[1, 2, 3].map((s) => (
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
        {step === 1 && (
          <Step1Details formData={formData} setFormData={setFormData} onNext={handleNext} batches={batches} />
        )}
        {step === 2 && (
          <Step2Questions questions={questions} setQuestions={setQuestions} onNext={handleNext} onPrev={handlePrev} />
        )}
        {step === 3 && (
          <Step3Review
            formData={formData}
            questions={questions}
            onPublish={handlePublish}
            onSaveDraft={handleSaveDraft}
            onPrev={handlePrev}
            publishing={publishing}
            saving={saving}
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
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Mid-term Assessment"
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Test Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="coding">Coding</option>
            <option value="aptitude">Aptitude (MCQ)</option>
            <option value="mock">Mock Interview</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Target Batch</label>
          <select
            value={formData.batch_id}
            onChange={(e) => setFormData({ ...formData, batch_id: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All students</option>
            {batches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Duration (minutes)</label>
          <input
            type="number"
            value={formData.duration_mins}
            onChange={(e) => setFormData({ ...formData, duration_mins: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold">Scheduled Date & Time</label>
          <input
            type="datetime-local"
            value={formData.scheduled_at}
            onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
            className="w-full px-4 py-2 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={!formData.title}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Next Step <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── CSV / JSON question parser ────────────────────────────────────────────────

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
          id: Date.now().toString() + i,
          type: q.type || "mcq",
          question: q.question,
          marks: Number(q.marks) || 1,
          options: q.options || ["", "", "", ""],
          correct_answer: q.correct_answer !== undefined ? String(q.correct_answer) : "0",
        });
      });
    } catch {
      errors.push("Invalid JSON file");
    }
  } else {
    // CSV: type,question,option_a,option_b,option_c,option_d,correct,marks
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    let start = 0;
    if (lines[0] && /type|question/i.test(lines[0])) start = 1;
    lines.slice(start).forEach((line, idx) => {
      const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
      const [type, question, optA, optB, optC, optD, correct, marksStr] = cols;
      if (!question) { errors.push(`Row ${idx + start + 2}: missing question`); return; }
      const qType = (type || "mcq").toLowerCase();
      const marks = Number(marksStr) || 1;
      const correctIdx = correct
        ? ["a", "b", "c", "d"].indexOf(correct.toLowerCase().trim())
        : 0;
      questions.push({
        id: Date.now().toString() + idx,
        type: qType,
        question,
        marks,
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
    reader.onload = ev => {
      const result = parseQuestionsFile(ev.target?.result as string, file.name);
      setPreview(result);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">Import Questions from File</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="font-medium text-foreground">Supported formats:</p>
            <p><span className="font-mono bg-muted px-1 rounded">.csv</span> — columns: <span className="font-mono">type, question, option_a, option_b, option_c, option_d, correct (a/b/c/d), marks</span></p>
            <p><span className="font-mono bg-muted px-1 rounded">.json</span> — array of <span className="font-mono">{"{ type, question, options[], correct_answer, marks }"}</span></p>
          </div>

          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/10 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
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
                      <p key={i} className="text-xs text-muted-foreground truncate">Q{i + 1}: [{q.type.toUpperCase()}] {q.question}</p>
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
              onClick={() => { if (preview) { onImported(preview.questions); onClose(); } }}
            >
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
  const [newQ, setNewQ] = useState({ type: "mcq", question: "", marks: 1, options: ["", "", "", ""], correct_answer: "0" });

  const handleAdd = () => {
    setQuestions([...questions, { ...newQ, id: Date.now().toString() }]);
    setIsAdding(false);
    setNewQ({ type: "mcq", question: "", marks: 1, options: ["", "", "", ""], correct_answer: "0" });
  };

  return (
    <div className="space-y-6">
      {showImport && (
        <ImportQuestionsModal
          onClose={() => setShowImport(false)}
          onImported={qs => setQuestions([...questions, ...qs])}
        />
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Questions</h2>
          <p className="text-sm text-muted-foreground">Add questions manually or import from CSV / JSON.</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <Upload className="w-4 h-4" /> Import File
        </button>
      </div>

      <div className="space-y-4">
        {questions.map((q: any, i: number) => (
          <div key={q.id} className="flex gap-4 p-4 border rounded-xl bg-background items-start">
            <GripVertical className="w-5 h-5 text-muted-foreground cursor-move mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold bg-muted px-2 py-1 rounded">Q{i + 1}</span>
                <span className="text-xs font-bold text-muted-foreground uppercase">{q.type}</span>
                <span className="text-xs font-bold text-primary ml-auto">{q.marks} Mark(s)</span>
              </div>
              <p className="text-sm font-medium">{q.question}</p>
            </div>
            <button
              onClick={() => setQuestions(questions.filter((_: any, idx: number) => idx !== i))}
              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="font-semibold">Add New Question</span>
          </button>
        ) : (
          <div className="p-5 border rounded-xl bg-muted/20 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold">Question Type</label>
                <select
                  value={newQ.type}
                  onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="mcq">Multiple Choice</option>
                  <option value="coding">Coding Problem</option>
                  <option value="short">Short Answer</option>
                </select>
              </div>
              <div className="w-24 space-y-2">
                <label className="text-xs font-bold">Marks</label>
                <input
                  type="number"
                  value={newQ.marks}
                  onChange={(e) => setNewQ({ ...newQ, marks: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">Question Text</label>
              <textarea
                value={newQ.question}
                onChange={(e) => setNewQ({ ...newQ, question: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter your question here…"
              />
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
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        isCorrect ? "border-green-500 bg-green-500/5" : "border-muted bg-background"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setNewQ({ ...newQ, correct_answer: idx.toString() })}
                        title="Mark as correct answer"
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isCorrect
                            ? "border-green-500 bg-green-500 text-white"
                            : "border-muted-foreground/40 hover:border-green-500 text-transparent hover:text-green-500"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                        isCorrect ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                        {letter}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const opts = [...newQ.options];
                          opts[idx] = e.target.value;
                          setNewQ({ ...newQ, options: opts });
                        }}
                        className="flex-1 px-3 py-1.5 text-sm bg-transparent border border-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={`Option ${letter}`}
                      />
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
              <button onClick={handleAdd} disabled={!newQ.question} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50">
                Save Question
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onPrev} className="px-6 py-2.5 font-bold hover:bg-muted rounded-xl transition-colors">Back</button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
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
        <button onClick={onPrev} disabled={publishing || saving} className="px-6 py-2.5 font-bold hover:bg-muted rounded-xl transition-colors disabled:opacity-50">
          Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={onSaveDraft}
            disabled={publishing || saving}
            className="flex items-center gap-2 px-6 py-2.5 font-bold border hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save as Draft
          </button>
          <button
            onClick={onPublish}
            disabled={publishing || saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Publish Test
          </button>
        </div>
      </div>
    </div>
  );
}
