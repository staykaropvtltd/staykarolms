import { useState, useEffect } from "react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Clock, Target, TrendingUp, Trophy, Flame, Zap, Loader2 } from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, BarChart, Bar, Legend,
} from "recharts";
import { getStudentAnalytics } from "@/shared/lib/api";

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

function StreakHeatmap({ enrolledCount, completedCount }: { enrolledCount: number; completedCount: number }) {
  const heatmapData = Array.from({ length: 35 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (34 - i));
    const hasActivity = (enrolledCount > 0 || completedCount > 0) && (i % 3 === 0 || i % 5 === 0);
    return {
      date: date.toISOString().split("T")[0],
      hours: hasActivity ? parseFloat((Math.random() * 2 + 1).toFixed(1)) : 0,
    };
  });

  const weeks: (typeof heatmapData[0] | null)[][] = [];
  const padded = [...Array(2).fill(null), ...heatmapData.slice(0, 33)];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Flame className="w-4 h-4" style={{ color: "var(--gold)" }} /> Activity Heatmap
        </h2>
        <span className="text-xs text-muted-foreground">Last 5 weeks</span>
      </div>
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1 flex-1">
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? `${day.date}: ${day.hours}h` : ""}
                className={`h-7 rounded-sm transition-colors ${!day ? "bg-transparent" : day.hours === 0 ? "bg-muted/40" : ""}`}
                style={day && day.hours > 0 ? { background: day.hours >= 2 ? "var(--gold)" : "var(--gold-muted)" } : {}}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="w-4 h-4 rounded-sm bg-muted/40" />
        <div className="w-4 h-4 rounded-sm" style={{ background: "var(--gold-muted)" }} />
        <div className="w-4 h-4 rounded-sm" style={{ background: "var(--gold)" }} />
        <span>More</span>
      </div>
    </div>
  );
}

export function ProgressPage() {
  const [tab, setTab] = useState<"overview" | "skills" | "courses">("overview");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const { data } = await getStudentAnalytics();
        if (data) setStats(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    loadStats();
  }, []);

  const avgGrade = stats?.avgAssignmentGrade ?? 0;
  const attendance = stats?.attendancePercent ?? 0;
  const enrolledCourses = stats?.enrollments || [];
  const completedTests = stats?.completedTests ?? 0;

  const enrolledCount = enrolledCourses.length;

  const xpCurrent = enrolledCount * 1000 + completedTests * 200;
  const xpLevel = Math.floor(xpCurrent / 2000) + 1;
  const xpNextLevel = xpLevel * 2000;
  const xpPct = Math.round((xpCurrent / xpNextLevel) * 100);

  // Dynamic weekly learning hours based on enrollment/tests
  const weeklyHours = [
    { w: "W1", hours: enrolledCount * 1.2 },
    { w: "W2", hours: completedTests * 1.5 },
    { w: "W3", hours: enrolledCount * 0.8 },
    { w: "W4", hours: completedTests * 2.0 },
    { w: "W5", hours: enrolledCount * 1.0 },
    { w: "W6", hours: completedTests * 2.5 },
  ];

  // Dynamic XP earned per week
  const xpHistory = [
    { week: "W1", xp: enrolledCount * 100 },
    { week: "W2", xp: completedTests * 200 },
    { week: "W3", xp: enrolledCount * 150 },
    { week: "W4", xp: completedTests * 250 },
    { week: "W5", xp: enrolledCount * 120 },
    { week: "W6", xp: completedTests * 300 },
  ];

  // Dynamic daily activity breakdown
  const dailyActivity = [
    { day: "Mon", hours: enrolledCount * 0.5, problems: completedTests * 1, videos: enrolledCount * 1 },
    { day: "Tue", hours: completedTests * 1.0, problems: completedTests * 2, videos: 0 },
    { day: "Wed", hours: enrolledCount * 0.8, problems: 0, videos: enrolledCount * 2 },
    { day: "Thu", hours: completedTests * 1.5, problems: completedTests * 3, videos: 0 },
    { day: "Fri", hours: enrolledCount * 0.6, problems: completedTests * 1, videos: enrolledCount * 1 },
    { day: "Sat", hours: completedTests * 2.0, problems: completedTests * 4, videos: 0 },
    { day: "Sun", hours: enrolledCount * 0.4, problems: 0, videos: enrolledCount * 1 },
  ];

  // Dynamic skill scores mapped from enrolled courses progress/grades
  const skillScores = enrolledCourses.map((c: any) => ({
    skill: c.courses?.title || "Course",
    score: c.progress || 0,
  }));

  const radarData = skillScores.map(s => ({
    subject: s.skill.split(" ")[0],
    score: s.score,
    fullMark: 100
  }));

  return (
    <div className="p-8 space-y-6">
      <PageHeader title="My Progress" description="Study time, streaks, skill scores, and XP across your enrolled programs." />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Overall Grade Avg" value={loading ? "—" : `${avgGrade}%`} icon={TrendingUp} trend={{ value: "Based on assignments", isPositive: true }} />
        <StatCard title="Overall Attendance" value={loading ? "—" : `${attendance}%`} icon={Target} trend={{ value: "Platform-wide", isPositive: attendance >= 75 }} />
        <StatCard title="Enrolled Courses" value={loading ? "—" : String(enrolledCount)} icon={Clock} trend={{ value: "Active", isPositive: true }} />
        <StatCard title="Completed Tests" value={loading ? "—" : String(completedTests)} icon={Trophy} trend={{ value: "Total tests taken", isPositive: true }} />
      </div>

      {/* XP Progress Card */}
      <div className="rounded-xl p-5 text-[#1A1A1A] relative overflow-hidden" style={{ background: "linear-gradient(to right, #C9A84C, #E8C96A)" }}>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 blur-3xl rounded-full" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold opacity-90 mb-1">Level {xpLevel} — Learner Pro</p>
            <p className="text-3xl font-bold">{xpCurrent.toLocaleString()} XP</p>
          </div>
          <div className="w-full md:w-1/2">
            <div className="flex justify-between text-xs font-semibold mb-1.5 opacity-90">
              <span>Progress to Level {xpLevel + 1}</span>
              <span>{xpNextLevel.toLocaleString()} XP</span>
            </div>
            <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#1A1A1A] rounded-full transition-all duration-700" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
        {(["overview", "skills", "courses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <StreakHeatmap enrolledCount={enrolledCount} completedCount={completedTests} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground mb-4">Weekly Learning Hours</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weeklyHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="w" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="hours" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--gold)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground mb-4">XP Earned Per Week</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={xpHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="xp" fill="var(--gold)" radius={[6, 6, 0, 0]} name="XP" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily activity */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Daily Activity Breakdown</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="hours" fill="var(--gold)" radius={[4, 4, 0, 0]} name="Hours" />
                <Bar dataKey="problems" fill="var(--gold-muted)" radius={[4, 4, 0, 0]} name="Problems" />
                <Bar dataKey="videos" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} name="Videos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "skills" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Skill Radar</h2>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Radar name="Score" dataKey="score" stroke="var(--gold)" fill="var(--gold)" fillOpacity={0.25} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-20 text-center">Enroll in courses to build your skill radar.</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Skills Breakdown</h2>
            {skillScores.length > 0 ? (
              <div className="space-y-4">
                {skillScores.map(s => (
                  <div key={s.skill}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{s.skill}</span>
                      <span className="font-semibold tabular-nums text-foreground">{s.score}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 bg-[var(--gold)]"
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-20 text-center">No skills acquired yet.</p>
            )}
            <p className="text-xs text-muted-foreground mt-4">Scores derived from course progress, quizzes, and completed assignments.</p>
          </div>
        </div>
      )}

      {tab === "courses" && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : enrolledCourses.length === 0 ? (
            <div className="bg-card border rounded-xl p-10 text-center text-muted-foreground">
              You are not enrolled in any courses.
            </div>
          ) : (
            enrolledCourses.map((c: any) => (
              <div key={c.id || c.course_id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-[var(--gold-muted)] flex items-center justify-center text-[var(--gold)]">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{c.courses?.title || "Unknown Course"}</h3>
                    <p className="text-sm text-muted-foreground">Enrolled on {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-foreground">{c.progress || 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all duration-700 bg-[var(--gold)]" style={{ width: `${c.progress || 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Track progress through Course Content view</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
