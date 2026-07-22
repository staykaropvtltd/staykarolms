import { useState, useEffect } from "react";
import { Users, CheckCircle, XCircle, Clock, Download, Loader2, Layers } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { getCourses, getCourseAttendance, markAttendance, getBatches, getBatch } from "@/shared/lib/api";

type AttendanceStatus = "Present" | "Absent" | "Late";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  Present: "bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30",
  Absent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900",
  Late: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
};

const STATUS_ICON: Record<AttendanceStatus, React.ReactNode> = {
  Present: <CheckCircle className="w-3.5 h-3.5" />,
  Absent: <XCircle className="w-3.5 h-3.5" />,
  Late: <Clock className="w-3.5 h-3.5" />,
};

function generateDates(): string[] {
  const dates = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

const ATTENDANCE_DATES = generateDates();

interface StudentAttendance {
  studentId: string;
  studentName: string;
  avatar: string;
  records: Record<string, AttendanceStatus>;
}

function exportAttendanceCSV(records: StudentAttendance[], dates: string[], courseName: string) {
  const header = ["Student", ...dates, "Rate"].join(",");
  const rows = records.map(r => {
    const present = dates.filter(d => r.records[d] === "Present").length;
    const late = dates.filter(d => r.records[d] === "Late").length;
    const rate = dates.length > 0 ? Math.round(((present + late) / dates.length) * 100) : 0;
    return [r.studentName, ...dates.map(d => r.records[d] ?? "Absent"), `${rate}%`].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${courseName.replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AttendancePage() {
  const [mode, setMode] = useState<"course" | "batch">("course");

  // ── Course mode ──────────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<StudentAttendance[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Batch mode ───────────────────────────────────────────────────────────────
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchStudents, setBatchStudents] = useState<any[]>([]);
  const [batchAttendance, setBatchAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [batchCourseId, setBatchCourseId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [{ data: coursesData }, { data: batchesData }] = await Promise.all([
          getCourses(),
          getBatches(),
        ]);
        const normalizedCourses = ((coursesData as any[]) || []).map((item: any) =>
          item.courses ? item.courses : item
        );
        setCourses(normalizedCourses);
        setBatches((batchesData as any[]) || []);
        if (normalizedCourses.length > 0) setSelectedCourseId(normalizedCourses[0].id);
        if (batchesData && (batchesData as any[]).length > 0) setSelectedBatchId((batchesData as any[])[0].id);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    init();
  }, []);

  // Load batch students whenever the selected batch changes
  useEffect(() => {
    if (!selectedBatchId) return;
    setBatchLoading(true);
    getBatch(selectedBatchId).then(({ data }) => {
      const students = ((data as any)?.batch_students || [])
        .map((bs: any) => bs.profiles)
        .filter(Boolean);
      setBatchStudents(students);
      const init: Record<string, AttendanceStatus> = {};
      students.forEach((s: any) => { init[s.id] = "Absent"; });
      setBatchAttendance(init);
      setBatchLoading(false);
    });
  }, [selectedBatchId]);

  const loadAttendance = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const { data } = await getCourseAttendance(selectedCourseId);
      const studentMap = new Map<string, StudentAttendance>();
      (data || []).forEach((row: any) => {
        if (!studentMap.has(row.student_id)) {
          studentMap.set(row.student_id, {
            studentId: row.student_id,
            studentName: row.profiles?.name || "Unknown",
            avatar: row.profiles?.name?.charAt(0) || "U",
            records: {},
          });
        }
        studentMap.get(row.student_id)!.records[row.date] = row.status as AttendanceStatus;
      });
      setRecords(Array.from(studentMap.values()));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { loadAttendance(); }, [selectedCourseId]);

  const toggle = (studentId: string, date: string) => {
    setRecords(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const current = r.records[date] ?? "Absent";
      const next: AttendanceStatus = current === "Present" ? "Absent" : current === "Absent" ? "Late" : "Present";
      return { ...r, records: { ...r.records, [date]: next } };
    }));
  };

  const toggleBatch = (studentId: string) => {
    setBatchAttendance(prev => {
      const current = prev[studentId] ?? "Absent";
      const next: AttendanceStatus = current === "Present" ? "Absent" : current === "Absent" ? "Late" : "Present";
      return { ...prev, [studentId]: next };
    });
  };

  const handleSave = async () => {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      const flatRecords: any[] = [];
      records.forEach(r => {
        ATTENDANCE_DATES.forEach(d => {
          if (r.records[d]) {
            flatRecords.push({ student_id: r.studentId, course_id: selectedCourseId, date: d, status: r.records[d] });
          }
        });
      });
      await markAttendance(flatRecords);
      toast.success("Attendance saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save attendance");
    }
    setSaving(false);
  };

  const handleBatchSave = async () => {
    if (!batchCourseId) { toast.error("Please select a course"); return; }
    if (!batchDate) { toast.error("Please select a date"); return; }
    if (batchStudents.length === 0) { toast.error("No students in this batch"); return; }
    setBatchSaving(true);
    try {
      const flatRecords = batchStudents.map((s: any) => ({
        student_id: s.id,
        course_id: batchCourseId,
        date: batchDate,
        status: batchAttendance[s.id] || "Absent",
      }));
      await markAttendance(flatRecords);
      toast.success("Batch attendance saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save attendance");
    }
    setBatchSaving(false);
  };

  const totalPresent = records.flatMap(r => Object.values(r.records)).filter(v => v === "Present").length;
  const totalAbsent = records.flatMap(r => Object.values(r.records)).filter(v => v === "Absent").length;
  const totalLate = records.flatMap(r => Object.values(r.records)).filter(v => v === "Late").length;
  const totalCells = records.length * ATTENDANCE_DATES.length;
  const overallRate = totalCells > 0 ? Math.round(((totalPresent + totalLate) / totalCells) * 100) : 0;

  const batchPresent = Object.values(batchAttendance).filter(v => v === "Present").length;
  const batchLate = Object.values(batchAttendance).filter(v => v === "Late").length;

  return (
    <div className="p-8">
      <PageHeader
        title="Attendance"
        description="Mark and track student attendance by course or batch."
        actions={
          mode === "course" ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
              const course = courses.find(c => c.id === selectedCourseId);
              exportAttendanceCSV(records, ATTENDANCE_DATES, course?.title || "attendance");
              toast.success("Attendance exported as CSV");
            }} disabled={records.length === 0}>
              <Download className="size-4" /> Export CSV
            </Button>
          ) : null
        }
      />

      {/* Mode toggle */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit mb-6">
        {(["course", "batch"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {m === "course" ? "By Course" : "By Batch"}
          </button>
        ))}
      </div>

      {mode === "course" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Overall rate" value={`${overallRate}%`} icon={Users} trend={{ value: "Last 5 sessions", isPositive: true }} />
            <StatCard title="Present" value={String(totalPresent)} icon={CheckCircle} trend={{ value: "Across all dates", isPositive: true }} />
            <StatCard title="Absent" value={String(totalAbsent)} icon={XCircle} trend={{ value: "Needs follow-up", isPositive: false }} />
            <StatCard title="Late" value={String(totalLate)} icon={Clock} trend={{ value: "Marked late", isPositive: false }} />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCourseId(c.id)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${selectedCourseId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-foreground hover:bg-accent/50"}`}
              >
                {c.title}
              </button>
            ))}
          </div>

          {courses.length === 0 && !loading && (
            <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">You have no courses yet.</div>
          )}

          {courses.length > 0 && (
            <>
              <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-[var(--gold)]" /> Present</span>
                <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> Absent</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> Late</span>
                <span className="text-muted-foreground/60">· Click a cell to cycle status</span>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground sticky left-0 bg-muted/30 min-w-[160px]">Student</th>
                        {ATTENDANCE_DATES.map(d => (
                          <th key={d} className="text-center py-3 px-3 font-medium text-muted-foreground whitespace-nowrap">{d.slice(5)}</th>
                        ))}
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={ATTENDANCE_DATES.length + 2} className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : records.length === 0 ? (
                        <tr><td colSpan={ATTENDANCE_DATES.length + 2} className="py-20 text-center text-muted-foreground">No students found for this course.</td></tr>
                      ) : records.map(r => {
                        const presentCount = Object.values(r.records).filter(v => v === "Present").length;
                        const lateCount = Object.values(r.records).filter(v => v === "Late").length;
                        const rate = Math.round(((presentCount + lateCount) / ATTENDANCE_DATES.length) * 100);
                        return (
                          <tr key={r.studentId} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                            <td className="py-3 px-4 sticky left-0 bg-card">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[var(--gold-muted)] flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold text-[var(--gold)]">{r.avatar}</span>
                                </div>
                                <span className="font-medium text-foreground">{r.studentName}</span>
                              </div>
                            </td>
                            {ATTENDANCE_DATES.map(d => {
                              const status = (r.records[d] ?? "Absent") as AttendanceStatus;
                              return (
                                <td key={d} className="py-3 px-3 text-center">
                                  <button
                                    onClick={() => toggle(r.studentId, d)}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${STATUS_STYLES[status]}`}
                                  >
                                    {STATUS_ICON[status]}
                                    <span className="hidden sm:inline">{status}</span>
                                  </button>
                                </td>
                              );
                            })}
                            <td className="py-3 px-4 text-center">
                              <span className={`text-sm font-semibold tabular-nums ${rate >= 75 ? "text-[var(--gold)]" : "text-red-600"}`}>{rate}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{records.length} students · {ATTENDANCE_DATES.length} sessions</span>
                  <Button size="sm" onClick={handleSave} disabled={saving || records.length === 0}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Attendance
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ── Batch mode ─────────────────────────────────────────────────────── */
        <>
          {batches.length === 0 && !loading ? (
            <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No batches found. Create a batch first.
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Batch</label>
                  <select
                    value={selectedBatchId || ""}
                    onChange={e => setSelectedBatchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  >
                    {batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Course</label>
                  <select
                    value={batchCourseId || ""}
                    onChange={e => setBatchCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  >
                    <option value="">Select a course…</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                  <input
                    type="date"
                    value={batchDate}
                    onChange={e => setBatchDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                <StatCard title="Total Students" value={String(batchStudents.length)} icon={Users} trend={{ value: "In batch", isPositive: true }} />
                <StatCard title="Present" value={String(batchPresent)} icon={CheckCircle} trend={{ value: `${batchStudents.length > 0 ? Math.round((batchPresent / batchStudents.length) * 100) : 0}%`, isPositive: true }} />
                <StatCard title="Late" value={String(batchLate)} icon={Clock} trend={{ value: "Marked late", isPositive: false }} />
              </div>

              <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-[var(--gold)]" /> Present</span>
                <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> Absent</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> Late</span>
                <span className="text-muted-foreground/60">· Click a row to cycle status</span>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {batchLoading ? (
                  <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : batchStudents.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">No students in this batch.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {batchStudents.map((s: any) => {
                      const status = batchAttendance[s.id] ?? "Absent";
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-4 px-5 py-3 hover:bg-accent/20 transition-colors cursor-pointer"
                          onClick={() => toggleBatch(s.id)}
                        >
                          <div className="w-9 h-9 rounded-full bg-[var(--gold-muted)] flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-[var(--gold)]">{(s.name || "?").charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${STATUS_STYLES[status as AttendanceStatus]}`}>
                            {STATUS_ICON[status as AttendanceStatus]}
                            {status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{batchStudents.length} students · {batchDate}</span>
                  <Button size="sm" onClick={handleBatchSave} disabled={batchSaving || batchStudents.length === 0 || !batchCourseId}>
                    {batchSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Attendance
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
