import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  BookOpen, Trophy, TrendingUp, Flame, Zap,
  AlertCircle, Star, ChevronRight, Video, ExternalLink, Loader2
} from "lucide-react";
import { StatCard } from "@/shared/components/StatCard";
import { DashboardSkeletons } from "@/shared/components/SkeletonLoader";
import { useNavigate } from "react-router";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getStudentAnalytics, getActiveLiveClasses, getAssignments, getTests } from "@/shared/lib/api";
import { useAuth } from "@/shared/context/AuthContext";

function getUrgency(dueDate?: string): "high" | "medium" | "low" {
  if (!dueDate) return "low";
  const diff = new Date(dueDate).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 2) return "high";
  if (days < 5) return "medium";
  return "low";
}

const URGENCY_BORDER: Record<string, string> = { high: "border-l-red-500", medium: "border-l-amber-500", low: "border-l-[var(--gold)]" };
const URGENCY_DOT: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-[var(--gold)]" };
const URGENCY_DATE_COLOR: Record<string, string> = { high: "text-red-500", medium: "text-amber-500", low: "text-[var(--gold)]" };
const TYPE_BADGE: Record<string, string> = { assignment: "bg-[var(--gold-muted)] text-[var(--gold)]", quiz: "bg-[var(--gold-muted)] text-[var(--gold)]", project: "bg-[var(--gold-muted)] text-[var(--gold)]" };
const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--gold)", borderRadius: "10px", fontSize: "12px", color: "var(--foreground)" };

// ─── XP & Level Card ─────────────────────────────────────────────────────────
function XPLevelCard({ current, next, level }: { current: number; next: number; level: number }) {
  const pct = Math.min(100, Math.round((current / next) * 100));
  return (
    <motion.div
      className="rounded-2xl p-5 shadow-md bg-[#F5F0E8] text-[#1A1A1A] dark:bg-[#1A1A1A] dark:text-[#F5F0E8] border border-[#E8E0D0] dark:border-[#2A2A2A]"
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-inner" style={{ background: "var(--gold)", color: "#1A1A1A" }}>{level}</div>
          <div>
            <p className="text-xs text-[#6B6560] dark:text-[#9A9590]">Current Level</p>
            <p className="font-bold text-lg leading-tight" style={{ color: "var(--gold)" }}>Learner Pro</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#6B6560] dark:text-[#9A9590]">Total XP</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--gold)" }}>{current.toLocaleString()}</p>
        </div>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-[#E8E0D0] dark:bg-[#2A2A2A]">
        <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(to right, #C9A84C, #E8C96A)" }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }} />
      </div>
      <div className="flex justify-between items-center mt-2">
        <p className="text-xs text-[#6B6560] dark:text-[#9A9590]">{(next - current).toLocaleString()} XP to Level {level + 1}</p>
        <p className="text-xs tabular-nums text-[#6B6560] dark:text-[#9A9590]">{current.toLocaleString()} / {next.toLocaleString()}</p>
      </div>
    </motion.div>
  );
}

// ─── Streak Widget ────────────────────────────────────────────────────────────
function StreakWidget({ streak }: { streak: number }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const last7 = Array.from({ length: 7 }, (_, i) => ({
    day: days[i],
    active: streak > i,
  }));

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Flame className="w-5 h-5 text-orange-400" /><h3 className="font-semibold text-foreground">Learning Streak</h3></div>
        <div className="flex items-baseline gap-1"><span className="text-3xl font-bold tabular-nums" style={{ color: "var(--gold)" }}>{streak}</span><span className="text-sm text-muted-foreground">days</span></div>
      </div>
      <div className="flex gap-1.5 justify-between">
        {last7.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-transform hover:scale-110" style={d.active ? { background: "var(--gold)", boxShadow: "0 0 8px var(--gold-muted)" } : { background: "var(--muted)" }}>
              {d.active ? "🔥" : <span className="opacity-30">·</span>}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{d.day}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">🏆 Personal best: {Math.max(streak, 7)} days</p>
    </div>
  );
}

// ─── Upcoming Tests Widget ───────────────────────────────────────────────────
function UpcomingTestsWidget({ tests }: { tests: any[] }) {
  const navigate = useNavigate();
  const upcoming = tests
    .filter(t => t.status === "published")
    .sort((a, b) => {
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    })
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  const TYPE_COLOR: Record<string, string> = {
    aptitude: "bg-purple-500/10 text-purple-600",
    coding: "bg-blue-500/10 text-blue-600",
    mock: "bg-emerald-500/10 text-emerald-600",
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4"><span className="text-base">📝</span><h3 className="font-semibold text-foreground">Upcoming Tests</h3></div>
      <div className="space-y-3">
        {upcoming.map((test) => (
          <div
            key={test.id}
            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: "var(--muted)" }}
            onClick={() => navigate(`/student/${test.type === "coding" ? "coding-test" : "aptitude-test"}`)}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm" style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>
              {test.scheduled_at ? new Date(test.scheduled_at).getDate() : "—"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{test.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{test.duration_mins} mins · {test.test_questions?.[0]?.count ?? 0} questions</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 capitalize ${TYPE_COLOR[test.type] || "bg-muted text-muted-foreground"}`}>{test.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Active Live Classes Widget ───────────────────────────────────────────────
function ActiveLiveClassesWidget() {
  const [liveClasses, setLiveClasses] = useState<any[]>([]);
  const { isAuthenticated } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const load = async () => {
      try {
        const { data, status } = await getActiveLiveClasses();
        if (data) setLiveClasses(data);
        if (status === 401 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch (err) {}
    };

    load();
    intervalRef.current = setInterval(load, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated]);
  if (liveClasses.length === 0) return null;
  return (
    <div className="bg-card border border-red-500/30 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2"><span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span></div>
      <div className="flex items-center gap-2 mb-4 text-red-500"><Video className="w-5 h-5" /><h3 className="font-semibold text-foreground">Live Now</h3></div>
      <div className="space-y-3">
        {liveClasses.map(cls => (
          <div key={cls.id} className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
            <p className="text-sm font-semibold text-foreground truncate">{cls.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">{cls.courses?.title || "General"}</p>
            {cls.meeting_link ? (
              <a href={cls.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors">
                <ExternalLink className="w-3 h-3" /> Join Class
              </a>
            ) : <span className="text-xs text-muted-foreground">No link provided</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── XP Rank Card ─────────────────────────────────────────────────────────────
function LeaderboardCard({ currentXP, level }: { currentXP: number; level: number }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5" style={{ color: "var(--gold)" }} />
        <h3 className="font-semibold text-foreground">Your XP Rank</h3>
      </div>
      <div className="flex flex-col items-center gap-3 py-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ background: "var(--gold-muted)", color: "var(--gold)", border: "2px solid var(--gold)" }}
        >
          {level}
        </div>
        <div className="text-center">
          <p className="font-bold text-xl tabular-nums" style={{ color: "var(--gold)" }}>{currentXP.toLocaleString()} XP</p>
          <p className="text-xs text-muted-foreground mt-1">Level {level} · Learner Pro</p>
        </div>
        <p className="text-xs text-muted-foreground text-center px-3 py-2 rounded-xl w-full" style={{ background: "var(--muted)" }}>
          Complete courses &amp; tests to earn more XP
        </p>
      </div>
    </div>
  );
}

// ─── Deadlines Panel ──────────────────────────────────────────────────────────
function DeadlinesPanel({ assignments }: { assignments: any[] }) {
  const navigate = useNavigate();

  const items = assignments
    .filter(a => a.due_date)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 4)
    .map(a => ({
      id: a.id,
      title: a.title,
      course: a.courses?.title || "General",
      due: new Date(a.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      urgency: getUrgency(a.due_date),
      type: "assignment" as const,
    }));

  if (items.length === 0) return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4"><AlertCircle className="w-5 h-5 text-amber-500" /><h3 className="font-semibold text-foreground">Upcoming Deadlines</h3></div>
      <p className="text-sm text-muted-foreground">No upcoming deadlines. You're all caught up! 🎉</p>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4"><AlertCircle className="w-5 h-5 text-amber-500" /><h3 className="font-semibold text-foreground">Upcoming Deadlines</h3></div>
      <div className="space-y-3">
        {items.map((d) => (
          <div key={d.id} className={`p-3 rounded-xl border-l-4 ${URGENCY_BORDER[d.urgency]} cursor-pointer hover:opacity-90 transition-opacity`} style={{ background: "var(--muted)" }} onClick={() => navigate("/student/assignments")}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-foreground leading-tight">{d.title}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${TYPE_BADGE[d.type]}`}>{d.type}</span>
            </div>
            <p className="text-xs text-muted-foreground">{d.course}</p>
            <div className="flex items-center gap-1.5 mt-1.5"><div className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[d.urgency]}`} /><p className={`text-xs font-semibold ${URGENCY_DATE_COLOR[d.urgency]}`}>{d.due}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Continue Learning ────────────────────────────────────────────────────────
function ContinueLearning({ enrollments }: { enrollments: any[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2"><BookOpen className="w-5 h-5" style={{ color: "var(--gold)" }} /><h2 className="text-lg font-bold text-foreground">Continue Learning</h2></div>
        <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted" onClick={() => navigate("/student/my-courses")}>View all <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
      <div className="space-y-4">
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrolled courses.</p>
        ) : (
          enrollments.slice(0, 3).map((enrollment, index) => {
            const course = enrollment.courses;
            const progressVal = enrollment.progress || 0;
            const isComplete = progressVal >= 100;
            return (
              <motion.div key={enrollment.id} className="rounded-2xl border border-border p-4 transition-all hover:shadow-md group" style={{ background: "var(--accent)" }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.4 }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>{course?.title?.[0] || "C"}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground text-sm leading-tight truncate">{course?.title || "Unknown Course"}</h3>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <motion.div className="h-full rounded-full" style={{ width: `${progressVal}%`, background: isComplete ? "#22c55e" : "linear-gradient(to right, #C9A84C, #E8C96A)" }} initial={{ width: 0 }} animate={{ width: `${progressVal}%` }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: isComplete ? "#22c55e" : "var(--gold)" }}>{progressVal}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /><span>4.5</span></div>
                  <button onClick={() => navigate("/student/my-courses")} className="text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all" style={{ borderColor: "var(--gold)", color: "var(--gold)", background: "transparent" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--gold-muted)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>Continue →</button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Learning Summary Chart ───────────────────────────────────────────────────
function LearningSummaryChart({ stats, assignments }: { stats: any; assignments: any[] }) {
  const data = [
    { label: "Courses",     value: stats?.enrolledCourses || 0 },
    { label: "Tests Done",  value: stats?.completedTests  || 0 },
    { label: "AI Sessions", value: stats?.aiSessionCount  || 0 },
    { label: "Assignments", value: assignments.length      || 0 },
  ];
  return (
    <div className="rounded-2xl p-6 shadow-sm border bg-card border-border">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Learning Summary</h2>
          <p className="text-xs mt-0.5 text-muted-foreground">Your activity across all areas</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>All time</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="value" fill="#C9A84C" radius={[6, 6, 0, 0]} name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Badges Row ───────────────────────────────────────────────────────────────
function BadgesRow({ badges }: { badges: any[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2"><Star className="w-5 h-5" style={{ color: "var(--gold)" }} /><h2 className="text-lg font-bold text-foreground">My Badges</h2></div>
        <span className="text-xs text-muted-foreground">{earned}/{badges.length} earned</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {badges.map((badge, index) => (
          <motion.div key={badge.id} className={`relative p-4 rounded-2xl text-center transition-all border ${badge.earned ? "hover:shadow-md" : "opacity-40 grayscale"}`} style={badge.earned ? { borderColor: "var(--gold)", background: "var(--gold-muted)" } : { borderColor: "var(--border)" }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: badge.earned ? 1 : 0.4, y: 0 }} transition={{ delay: index * 0.06, duration: 0.4 }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl" style={badge.earned ? { background: "var(--gold-muted)", boxShadow: "0 0 12px var(--gold-muted)" } : { background: "var(--muted)" }}>{badge.icon}</div>
            <p className="text-xs font-bold text-foreground leading-tight">{badge.title}</p>
            <p className="text-[10px] text-muted-foreground mt-1">+{badge.xp} XP</p>
            {badge.earned ? <p className="text-[10px] font-semibold mt-1" style={{ color: "var(--gold)" }}>✓ Earned</p> : <p className="text-[10px] text-muted-foreground mt-1">🔒 Locked</p>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function StudentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getStudentAnalytics(),
      getAssignments(),
      getTests({ status: "published" }),
    ])
      .then(([analyticsRes, assignmentsRes, testsRes]) => {
        setStats(analyticsRes.data);
        setAssignments((assignmentsRes.data as any[]) || []);
        setTests((testsRes.data as any[]) || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) return <DashboardSkeletons />;

  // Calculate dynamic stats
  const enrolledCoursesCount = stats?.enrolledCourses || 0;
  const completedTestsCount = stats?.completedTests || 0;
  
  const xpCurrent = enrolledCoursesCount * 1000 + completedTestsCount * 200;
  const xpLevel = Math.floor(xpCurrent / 2000) + 1;
  const xpNextLevel = xpLevel * 2000;
  const streak = enrolledCoursesCount > 0 || completedTestsCount > 0 ? 3 : 0;

  // Dynamic Badges Row
  const badges = [
    { id: "1", title: "Early Bird", icon: "🌅", xp: 50, earned: completedTestsCount > 0 || assignments.length > 0 },
    { id: "2", title: "Perfect Score", icon: "💯", xp: 100, earned: completedTestsCount > 0 },
    { id: "3", title: "Active Learner", icon: "🔥", xp: 150, earned: enrolledCoursesCount > 0 },
    { id: "4", title: "Course Explorer", icon: "🚀", xp: 200, earned: enrolledCoursesCount > 1 },
  ];

  return (
    <div className="p-6 md:p-8 space-y-7 min-h-screen">
      <motion.div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">My Learning Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Welcome back, <span className="font-semibold text-foreground">{user?.name || "Student"}</span>! Keep the momentum going 🚀</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border" style={{ borderColor: "var(--gold)", background: "var(--gold-muted)" }}>
            <Flame className="w-4 h-4 text-orange-400" />
            <div><p className="text-[10px] text-muted-foreground leading-none">Streak</p><p className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--gold)" }}>{streak} days</p></div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border" style={{ borderColor: "var(--gold)", background: "var(--gold-muted)" }}>
            <Trophy className="w-4 h-4" style={{ color: "var(--gold)" }} />
            <div><p className="text-[10px] text-muted-foreground leading-none">Level</p><p className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--gold)" }}>{xpLevel}</p></div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Enrolled Courses" value={String(enrolledCoursesCount)} icon={BookOpen} delay={0 * 0.08} trend={{ value: "Active", isPositive: true }} />
        <StatCard title="Avg Attendance" value={`${stats?.attendancePercent || 0}%`} icon={TrendingUp} delay={1 * 0.08} trend={{ value: "Average attendance", isPositive: true }} />
        <StatCard title="Assignments" value={String(assignments.length)} icon={Flame} delay={2 * 0.08} trend={{ value: `${assignments.filter(a => a.due_date && new Date(a.due_date) > new Date()).length} pending`, isPositive: true }} />
        <StatCard title="Tests Completed" value={String(completedTestsCount)} icon={Zap} delay={3 * 0.08} trend={{ value: `${tests.length} available`, isPositive: true }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <ContinueLearning enrollments={stats?.enrollments || []} />
          <DeadlinesPanel assignments={assignments} />
        </div>
        <div className="lg:col-span-2 space-y-5">
          <ActiveLiveClassesWidget />
          <XPLevelCard current={xpCurrent} next={xpNextLevel} level={xpLevel} />
          <StreakWidget streak={streak} />
          <UpcomingTestsWidget tests={tests} />
          <LeaderboardCard currentXP={xpCurrent} level={xpLevel} />
        </div>
      </div>
      <LearningSummaryChart stats={stats} assignments={assignments} />
      <BadgesRow badges={badges} />
    </div>
  );
}
