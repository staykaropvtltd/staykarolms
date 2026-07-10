import { useState, useEffect } from "react";
import { Users, CheckCircle, XCircle, Clock, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { getCourses, getCourseAttendance, markAttendance } from "@/shared/lib/api";

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

// Generate last 5 days in YYYY-MM-DD format
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
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<StudentAttendance[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data } = await getCourses();
        setCourses(data || []);
        if (data && data.length > 0) {
          setSelectedCourseId(data[0].id);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    init();
  }, []);

  const loadAttendance = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const { data } = await getCourseAttendance(selectedCourseId);
      
      // Group by student
      const studentMap = new Map<string, StudentAttendance>();
      
      (data || []).forEach((row: any) => {
        if (!studentMap.has(row.student_id)) {
          studentMap.set(row.student_id, {
            studentId: row.student_id,
            studentName: row.profiles?.name || "Unknown",
            avatar: row.profiles?.name?.charAt(0) || "U",
            records: {}
          });
        }
        const student = studentMap.get(row.student_id)!;
        student.records[row.date] = row.status as AttendanceStatus;
      });
      
      setRecords(Array.from(studentMap.values()));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedCourseId]);

  const toggle = (studentId: string, date: string) => {
    setRecords(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const current = r.records[date] ?? "Absent";
      const next: AttendanceStatus = current === "Present" ? "Absent" : current === "Absent" ? "Late" : "Present";
      return { ...r, records: { ...r.records, [date]: next } };
    }));
  };

  const handleSave = async () => {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      const flatRecords: any[] = [];
      records.forEach(r => {
        ATTENDANCE_DATES.forEach(d => {
          if (r.records[d]) {
            flatRecords.push({
              student_id: r.studentId,
              course_id: selectedCourseId,
              date: d,
              status: r.records[d]
            });
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

  const totalPresent = records.flatMap(r => Object.values(r.records)).filter(v => v === "Present").length;
  const totalAbsent = records.flatMap(r => Object.values(r.records)).filter(v => v === "Absent").length;
  const totalLate = records.flatMap(r => Object.values(r.records)).filter(v => v === "Late").length;
  const totalCells = records.length * ATTENDANCE_DATES.length;
  const overallRate = totalCells > 0 ? Math.round(((totalPresent + totalLate) / totalCells) * 100) : 0;

  return (
    <div className="p-8">
      <PageHeader
        title="Attendance"
        description="Mark and track student attendance across all your sessions."
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => {
            const course = courses.find(c => c.id === selectedCourseId);
            exportAttendanceCSV(records, ATTENDANCE_DATES, course?.title || "attendance");
            toast.success("Attendance exported as CSV");
          }} disabled={records.length === 0}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Overall rate" value={`${overallRate}%`} icon={Users} trend={{ value: "Last 6 sessions", isPositive: true }} />
        <StatCard title="Present" value={String(totalPresent)} icon={CheckCircle} trend={{ value: "Across all dates", isPositive: true }} />
        <StatCard title="Absent" value={String(totalAbsent)} icon={XCircle} trend={{ value: "Needs follow-up", isPositive: false }} />
        <StatCard title="Late" value={String(totalLate)} icon={Clock} trend={{ value: "Marked late", isPositive: false }} />
      </div>

      {/* Course selector */}
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
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
          You have no courses yet.
        </div>
      )}

      {courses.length > 0 && (
        <>
          {/* Legend */}
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
                    <tr>
                      <td colSpan={ATTENDANCE_DATES.length + 2} className="py-20 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={ATTENDANCE_DATES.length + 2} className="py-20 text-center text-muted-foreground">
                        No students found for this course. (They need to enroll first)
                      </td>
                    </tr>
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
                                title={`Click to change: ${status}`}
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
              <Button size="sm" variant="default" onClick={handleSave} disabled={saving || records.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Attendance
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
