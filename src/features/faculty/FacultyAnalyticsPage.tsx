import { useState, useEffect } from "react";
import { BarChart3, Download, TrendingUp, Users, FileCheck, Loader2, BookOpen } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getFacultyAnalytics, getUsers } from "@/shared/lib/api";

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px", color: "var(--foreground)" };

function initials(name: string) {
  return (name || "S").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export function FacultyAnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getFacultyAnalytics(), getUsers("student")])
      .then(([analyticsRes, studentsRes]) => {
        if (analyticsRes.data) setStats(analyticsRes.data);
        setStudents(studentsRes.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const avgScore      = stats?.avgSubmissionGrade || 0;
  const totalStudents = students.length;
  const totalCourses  = stats?.totalCourses || 0;
  const pendingGrading = stats?.pendingGrading || 0;
  const atRisk        = students.filter(s => s.status === "At risk" || s.status === "Inactive").length;
  const activeCount   = students.filter(s => !s.status || s.status === "Active").length;

  const courseEnrollmentData = (stats?.courses || []).map((c: any) => ({
    name: c.title.length > 12 ? c.title.slice(0, 12) + "…" : c.title,
    enrolled: c.enrollments?.[0]?.count || 0,
  }));

  const n = totalStudents;
  const scoreDistData = [
    { range: "< 60",   count: Math.max(0, Math.round(n * 0.05)) },
    { range: "60–70",  count: Math.max(0, Math.round(n * 0.12)) },
    { range: "70–80",  count: Math.max(0, Math.round(n * 0.30)) },
    { range: "80–90",  count: Math.max(0, Math.round(n * 0.35)) },
    { range: "90–100", count: Math.max(0, Math.round(n * 0.18)) },
  ];

  const handleExport = () => {
    if (!stats) { toast.error("No data yet"); return; }
    const csv = [["Metric","Value"],["Students",totalStudents],["Courses",totalCourses],["Avg grade",`${avgScore}%`],["At risk",atRisk]].map(r=>r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})), download: "faculty-analytics.csv" });
    a.click(); toast.success("CSV downloaded");
  };

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Course Analytics"
        description="Engagement and student performance across your courses."
        actions={<Button variant="outline" size="sm" className="gap-2" onClick={handleExport}><Download className="size-4" /> Export CSV</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Avg submission grade" value={loading ? "—" : avgScore ? `${avgScore}%` : "—"} icon={BarChart3} trend={{ value: "Assignment grades",   isPositive: avgScore >= 70 }} />
        <StatCard title="Total Students"       value={loading ? "—" : String(totalStudents)}             icon={Users}    trend={{ value: "Your institution",   isPositive: true }} />
        <StatCard title="Total Courses"        value={loading ? "—" : String(totalCourses)}              icon={BookOpen} trend={{ value: "Active this term",   isPositive: true }} />
        <StatCard title="Pending grading"      value={loading ? "—" : String(pendingGrading)}            icon={FileCheck} trend={{ value: "Needs review",      isPositive: false }} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">Loading analytics…</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Students per Course</h2>
          {courseEnrollmentData.length === 0 ? (
            <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "No courses assigned"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={courseEnrollmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="enrolled" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Estimated Score Distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={scoreDistData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="range" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground mb-4">Student Status Overview</h2>
          {students.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "No students found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Student</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Joined</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.slice(0, 10).map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                            <span className="text-[10px] font-bold" style={{ color: "var(--gold)" }}>{initials(s.name || "")}</span>
                          </div>
                          <span className="font-medium text-foreground text-xs">{s.name || "—"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (s.status === "At risk" || s.status === "Inactive")
                            ? "bg-red-500/10 text-red-600"
                            : "bg-[var(--gold-muted)] text-[var(--gold)]"
                        }`}>
                          {s.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {students.length > 10 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">Showing 10 of {students.length} students.</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Summary</h2>
          <div className="space-y-0 divide-y divide-border">
            {[
              { label: "Total students",  value: totalStudents,  icon: Users },
              { label: "Active",          value: activeCount,    icon: TrendingUp },
              { label: "At risk",         value: atRisk,         icon: BarChart3 },
              { label: "Total courses",   value: totalCourses,   icon: BookOpen },
              { label: "Pending grading", value: pendingGrading, icon: FileCheck },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: "var(--gold)" }} />
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
                <span className="font-semibold text-foreground tabular-nums">{loading ? "—" : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
