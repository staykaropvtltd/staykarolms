import { useState, useEffect } from "react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Clock, Target, TrendingUp, Trophy, Flame, Zap, Loader2 } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
} from "recharts";
import { getStudentAnalytics } from "@/shared/lib/api";

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

function StreakHeatmap({ enrolledCount, completedCount }: { enrolledCount: number; completedCount: number }) {
  const heatmapData = Array.from({ length: 35 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (34 - i));
    return {
      date: date.toISOString().split("T")[0],
      hours: 0,
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

  const xpCurrent = enrolledCount * 100 + completedTests * 50;
  const xpLevel = Math.floor(xpCurrent / 2000) + 1;
  const xpNextLevel = xpLevel * 2000;
  const xpPct = Math.round((xpCurrent / xpNextLevel) * 100);


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
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
              <h2 className="text-base font-semibold text-foreground mb-4">Weekly Learning Hours</h2>
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Clock className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">No activity data tracked yet.</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
              <h2 className="text-base font-semibold text-foreground mb-4">XP Earned Per Week</h2>
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Zap className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">No XP history tracked yet.</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
            <h2 className="text-base font-semibold text-foreground mb-4">Daily Activity Breakdown</h2>
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <TrendingUp className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-sm">Daily activity tracking is not yet available.</p>
            </div>
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
