import { useState, useEffect } from "react";
import { Users, TrendingUp, AlertTriangle, Search, X, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getFacultyAnalytics, getUsers } from "@/shared/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export type StudentPerformance = {
  id: string;
  name: string;
  avatar: string;
  course: string;
  assignments: number;
  avgScore: number;
  attendance: number;
  lastActive: string;
  status: "Excellent" | "On track" | "At risk";
  scores: number[];
};

const STATUS_COLORS: Record<StudentPerformance["status"], string> = {
  Excellent: "bg-[var(--gold-muted)] text-[var(--gold)]",
  "On track": "bg-[var(--gold-muted)] text-[var(--gold)]",
  "At risk": "bg-red-500/15 text-red-700 dark:text-red-400",
};

const tooltipStyle = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" };

function StudentDetailModal({ student, onClose }: { student: StudentPerformance; onClose: () => void }) {
  const scoreData = student.scores.map((s, i) => ({ assignment: `A${i + 1}`, score: s }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--gold-muted)] flex items-center justify-center">
              <span className="font-bold text-[var(--gold)]">{student.avatar}</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{student.name}</h2>
              <p className="text-sm text-muted-foreground">{student.course}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Avg Score", value: `${student.avgScore}%` },
              { label: "Attendance", value: `${student.attendance}%` },
              { label: "Assignments", value: `${student.assignments}/8` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Assignment Score Trend</h3>
            {scoreData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={scoreData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="assignment" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke="var(--gold)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No assignments graded yet.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Status</h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[student.status]}`}>{student.status}</span>
            {student.status === "At risk" && (
              <p className="mt-2 text-sm text-muted-foreground">Attendance below 75% threshold. Consider reaching out directly.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentPerformancePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState<StudentPerformance | null>(null);
  const [apiStats, setApiStats] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [statsRes, studentsRes] = await Promise.all([
          getFacultyAnalytics(),
          getUsers("student"),
        ]);
        if (statsRes.data) setApiStats(statsRes.data);
        setStudents(studentsRes.data || []);
      } catch (err) {
        console.error("Failed to load student performance analytics", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const mappedStudents: StudentPerformance[] = students.map(s => {
    const initials = s.name ? s.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "S";
    return {
      id: s.id,
      name: s.name || "Unknown Student",
      avatar: initials,
      course: "Enrolled Course",
      assignments: 0,
      avgScore: 0,
      attendance: 100,
      lastActive: "Active now",
      status: "On track",
      scores: [],
    };
  });

  const filtered = mappedStudents.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const excellent = filtered.filter(s => s.status === "Excellent").length;
  const atRisk    = filtered.filter(s => s.status === "At risk").length;
  const avgScore  = filtered.length ? Math.round(filtered.reduce((a, s) => a + s.avgScore, 0) / filtered.length) : 0;

  const scoreDistData = [
    { range: "90–100", count: filtered.filter(s => s.avgScore >= 90).length },
    { range: "80–89",  count: filtered.filter(s => s.avgScore >= 80 && s.avgScore < 90).length },
    { range: "70–79",  count: filtered.filter(s => s.avgScore >= 70 && s.avgScore < 80).length },
    { range: "<70",    count: filtered.filter(s => s.avgScore < 70).length },
  ];

  return (
    <div className="p-8">
      {selected && <StudentDetailModal student={selected} onClose={() => setSelected(null)} />}

      <PageHeader title="Student Performance" description="Track progress, scores, and attendance across your courses." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard
          title="Total students"
          value={loading ? "—" : String(apiStats?.totalStudents ?? filtered.length)}
          icon={Users}
          trend={{ value: `${excellent} excellent`, isPositive: true }}
        />
        <StatCard
          title="Class avg score"
          value={loading ? "—" : `${avgScore}%`}
          icon={TrendingUp}
          trend={{ value: "Based on DB records", isPositive: true }}
        />
        <StatCard
          title="At risk"
          value={loading ? "—" : String(atRisk)}
          icon={AlertTriangle}
          trend={{ value: "Needs attention", isPositive: false }}
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-4">Score Distribution</h2>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={scoreDistData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="range" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Students" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "Excellent", "On track", "At risk"].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("All"); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{loading ? "Loading…" : `${filtered.length} student${filtered.length !== 1 ? "s" : ""}`}</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading student list…</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Student</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Course</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Assignments</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Avg Score</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground w-36">Score Bar</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Attendance</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Active</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-muted-foreground"><Users className="w-10 h-10 mx-auto mb-2 opacity-30" />No students found.</td></tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[var(--gold-muted)] flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-[var(--gold)]">{s.avatar}</span>
                          </div>
                          <span className="font-medium text-foreground">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{s.course}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{s.assignments}/8</td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">{s.avgScore}%</td>
                      <td className="py-3 px-4">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden w-24">
                          <div className={`h-full rounded-full ${s.avgScore >= 85 ? "bg-primary" : s.avgScore >= 70 ? "bg-primary" : "bg-red-500"}`} style={{ width: `${s.avgScore}%` }} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{s.attendance}%</td>
                      <td className="py-3 px-4 text-muted-foreground">{s.lastActive}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>View</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
