import { useState, useEffect } from "react";
import { Users, BookOpen, Award, GraduationCap, ClipboardList, Video, TrendingUp, UserPlus, Loader2, CheckCircle } from "lucide-react";
import { StatCard } from "@/shared/components/StatCard";
import { useNavigate } from "react-router";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getAdminAnalytics, getUsers } from "@/shared/lib/api";
import { useAuth } from "@/shared/context/AuthContext";

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--gold)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "var(--foreground)",
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    Promise.all([
      getAdminAnalytics(),
      getUsers("student"),
    ]).then(([analyticsRes, studentsRes]) => {
      if (controller.signal.aborted) return;
      setStats(analyticsRes.data);
      setRecentStudents((studentsRes.data || []).slice(0, 5));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [user?.id]);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-8">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
    </div>
  );

  // Real institution overview chart
  const overviewData = [
    { label: "Students",  value: stats?.totalStudents  || 0 },
    { label: "Faculty",   value: stats?.totalFaculty   || 0 },
    { label: "Courses",   value: stats?.totalCourses   || 0 },
    { label: "Tests",     value: stats?.totalTests     || 0 },
    { label: "Classes",   value: stats?.totalClasses   || 0 },
  ];

  // Assessment stats
  const assessmentData = [
    { label: "Total Assignments",   value: stats?.assignmentStatistics?.totalAssignments   || 0, fill: "var(--gold)" },
    { label: "Submissions",         value: stats?.assignmentStatistics?.totalSubmissions   || 0, fill: "var(--gold)" },
    { label: "Test Attempts",       value: stats?.testStatistics?.totalAttempts            || 0, fill: "var(--gold)" },
    { label: "Tests Completed",     value: stats?.testStatistics?.completedAttempts        || 0, fill: "var(--gold)" },
  ];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">Admin Dashboard</h1>
        <p className="text-muted-foreground">Institution overview — Academic Year 2025–26</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Students"      value={String(stats?.totalStudents  || 0)} icon={Users}         trend={{ value: "Enrolled", isPositive: true }} />
        <StatCard title="Courses"       value={String(stats?.totalCourses   || 0)} icon={BookOpen}      trend={{ value: "Published", isPositive: true }} />
        <StatCard title="Faculty"       value={String(stats?.totalFaculty   || 0)} icon={GraduationCap} trend={{ value: "Active", isPositive: true }} />
        <StatCard title="Pending Grade" value={String(stats?.pendingGrading || 0)} icon={Award}         trend={{ value: "Need review", isPositive: false }} />
      </div>

      {/* Second stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Attendance"   value={`${stats?.attendancePercent || 0}%`}           icon={CheckCircle}   trend={{ value: "Overall rate",    isPositive: (stats?.attendancePercent || 0) >= 75 }} />
        <StatCard title="Avg Test Score" value={stats?.testStatistics?.averageScore ? `${stats.testStatistics.averageScore}%` : "—"} icon={ClipboardList} trend={{ value: "Submitted tests",  isPositive: true }} />
        <StatCard title="Live Classes" value={String(stats?.totalClasses || 0)}               icon={Video}         trend={{ value: "Total scheduled",  isPositive: true }} />
        <StatCard title="Avg Asgn Grade" value={stats?.assignmentStatistics?.averageGrade ? `${stats.assignmentStatistics.averageGrade}%` : "—"} icon={TrendingUp} trend={{ value: "Graded submissions", isPositive: true }} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Institution Overview bar */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Institution Overview</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">Live counts</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={overviewData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Assessment Activity */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Assessment Activity</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">Assignments & tests</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={assessmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent students */}
        <div className="bg-card border border-border rounded-2xl p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Students</h2>
            <button onClick={() => navigate("/admin/students")} className="text-xs text-muted-foreground hover:text-foreground">View all →</button>
          </div>
          {recentStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-muted-foreground">
              <UserPlus className="w-7 h-7 mb-1 opacity-30" />
              <p className="text-xs">No students yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentStudents.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-[#1A1A1A]"
                    style={{ background: "var(--gold)" }}>
                    {(s.name || "S").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-card border border-border rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Add Student",    path: "/admin/students",    icon: Users },
              { label: "Create Course",  path: "/admin/courses",     icon: BookOpen },
              { label: "Manage Batches", path: "/admin/batches",     icon: GraduationCap },
              { label: "Start Class",    path: "/admin/live-classes",icon: Video },
              { label: "Attendance",     path: "/admin/attendance",  icon: CheckCircle },
              { label: "View Analytics", path: "/admin/analytics",   icon: TrendingUp },
            ].map(({ label, path, icon: Icon }) => (
              <button key={path} onClick={() => navigate(path)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-accent/50 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--gold-muted)" }}>
                  <Icon className="w-4 h-4" style={{ color: "var(--gold)" }} />
                </div>
                <span className="text-sm font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
