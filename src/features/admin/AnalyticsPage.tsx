import { useState, useEffect } from "react";
import { BarChart3, Download, TrendingUp, Users, BookOpen, Award, Loader2, ClipboardList, Video } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAdminAnalytics, getFacultyAnalytics } from "@/shared/lib/api";

interface AnalyticsPageProps {
  userType: Extract<UserType, "super-admin" | "admin" | "faculty">;
}

// Super-admin view — no real per-platform API exists yet
const SUPER_ADMIN_OVERVIEW = [
  { label: "Institutions", value: 18 },
  { label: "Students",     value: 4820 },
  { label: "Faculty",      value: 312 },
  { label: "Courses",      value: 248 },
  { label: "Tests",        value: 740 },
];

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--foreground)",
};

export function AnalyticsPage({ userType }: AnalyticsPageProps) {
  const isSuper   = userType === "super-admin";
  const isFaculty = userType === "faculty";

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSuper) { setLoading(false); return; }
    (isFaculty ? getFacultyAnalytics() : getAdminAnalytics())
      .then(({ data }) => { if (data) setStats(data); })
      .finally(() => setLoading(false));
  }, [userType]);

  const title       = isSuper ? "Platform Analytics" : isFaculty ? "Course Analytics" : "Institution Analytics";
  const description = isSuper ? "Aggregate metrics across all institutions." : isFaculty
    ? "Engagement and submissions across your courses."
    : "Students, courses, assignments, and tests for your institution.";

  const institutionOverviewData = [
    { label: "Students", value: stats?.totalStudents || 0 },
    { label: "Faculty",  value: stats?.totalFaculty  || 0 },
    { label: "Courses",  value: stats?.totalCourses  || 0 },
    { label: "Tests",    value: stats?.totalTests    || 0 },
    { label: "Classes",  value: stats?.totalClasses  || 0 },
  ];

  const courseEnrollmentData = (stats?.courses || []).map((c: any) => ({
    name: c.title.length > 12 ? c.title.slice(0, 12) + "…" : c.title,
    enrolled: c.enrollments?.[0]?.count || 0,
  }));

  const assessmentData = [
    { label: "Assignments",     value: stats?.assignmentStatistics?.totalAssignments || 0 },
    { label: "Submissions",     value: stats?.assignmentStatistics?.totalSubmissions || 0 },
    { label: "Test attempts",   value: stats?.testStatistics?.totalAttempts          || 0 },
    { label: "Tests completed", value: stats?.testStatistics?.completedAttempts      || 0 },
    { label: "Pending grading", value: stats?.pendingGrading                         || 0 },
  ];

  const handleExport = () => {
    if (!stats && !isSuper) { toast.error("No data to export yet"); return; }
    const rows = [["Metric", "Value"], ...institutionOverviewData.map(d => [d.label, d.value])];
    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "analytics.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Students"
          value={loading ? "—" : String(stats?.totalStudents ?? (isSuper ? "4,820" : "—"))}
          icon={Users} trend={{ value: "Live count", isPositive: true }} />
        <StatCard title="Total Courses"
          value={loading ? "—" : String(stats?.totalCourses ?? (isSuper ? 248 : "—"))}
          icon={BookOpen} trend={{ value: "Active this term", isPositive: true }} />
        <StatCard title={isFaculty ? "Avg submission grade" : "Avg Test Score"}
          value={loading ? "—" : stats?.avgSubmissionGrade ? `${stats.avgSubmissionGrade}%` : stats?.testStatistics?.averageScore ? `${stats.testStatistics.averageScore}%` : "—"}
          icon={TrendingUp} trend={{ value: "Graded work", isPositive: true }} />
        <StatCard title={isSuper ? "Institutions" : "Pending grading"}
          value={loading ? "—" : String(stats?.pendingGrading ?? (isSuper ? 18 : "—"))}
          icon={Award} trend={{ value: isSuper ? "Active tenants" : "Needs review", isPositive: false }} />
      </div>

      {loading && !isSuper && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">Loading analytics…</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">
            {isSuper ? "Platform Overview" : "Institution Overview"}
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={isSuper ? SUPER_ADMIN_OVERVIEW : institutionOverviewData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Students per Course</h2>
          {!isSuper && courseEnrollmentData.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "No courses found"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={isSuper ? SUPER_ADMIN_OVERVIEW : courseEnrollmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey={isSuper ? "label" : "name"} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey={isSuper ? "value" : "enrolled"} fill="var(--gold)" radius={[6, 6, 0, 0]}
                  name={isSuper ? "Count" : "Students"} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {!isSuper && (
          <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-foreground mb-4">Assessment Activity</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={assessmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Highlights</h2>
          <div className="space-y-0 divide-y divide-border">
            {(isSuper ? [
              { label: "Total institutions", value: "18",    icon: Award },
              { label: "Total students",     value: "4,820", icon: Users },
              { label: "Total courses",      value: "248",   icon: BookOpen },
              { label: "Live classes",       value: "94",    icon: Video },
              { label: "Certifications",     value: "1,240", icon: ClipboardList },
            ] : [
              { label: "Total students",   value: stats?.totalStudents  ?? "—", icon: Users },
              { label: "Total faculty",    value: stats?.totalFaculty   ?? "—", icon: Users },
              { label: "Total courses",    value: stats?.totalCourses   ?? "—", icon: BookOpen },
              { label: "Total tests",      value: stats?.totalTests     ?? "—", icon: BarChart3 },
              { label: "Pending grading",  value: stats?.pendingGrading ?? "—", icon: Award },
            ]).map(({ label, value, icon: Icon }) => (
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
