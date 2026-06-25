import { CheckCircle, Circle, Minus, Search, Trophy } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
export type CodingProblem = {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
  acceptance: number;
  points: number;
  status: "Solved" | "Attempted" | "Unsolved";
};

const CODING_PROBLEMS: CodingProblem[] = [
  { id: "p1", title: "Two Sum", difficulty: "Easy", topic: "Arrays", acceptance: 65, points: 10, status: "Solved" },
  { id: "p2", title: "Valid Parentheses", difficulty: "Easy", topic: "Stacks", acceptance: 58, points: 10, status: "Solved" },
  { id: "p3", title: "LRU Cache", difficulty: "Medium", topic: "Design", acceptance: 34, points: 20, status: "Attempted" },
  { id: "p4", title: "Merge K Sorted Lists", difficulty: "Hard", topic: "Linked Lists", acceptance: 22, points: 30, status: "Unsolved" },
  { id: "p5", title: "Trapping Rain Water", difficulty: "Hard", topic: "Two Pointers", acceptance: 28, points: 30, status: "Attempted" },
  { id: "p6", title: "Maximum Subarray", difficulty: "Easy", topic: "Dynamic Programming", acceptance: 72, points: 10, status: "Unsolved" },
];

const LEADERBOARD = [
  { rank: 1, name: "Alice Hacker", avatar: "AH", xp: 14500, streak: 45, badges: 12, isMe: false },
  { rank: 2, name: "Bob Builder", avatar: "BB", xp: 13200, streak: 28, badges: 9, isMe: false },
  { rank: 3, name: "Charlie Coder", avatar: "CC", xp: 12450, streak: 15, badges: 8, isMe: true },
  { rank: 4, name: "David Debugger", avatar: "DD", xp: 11800, streak: 12, badges: 7, isMe: false },
  { rank: 5, name: "Eve Engineer", avatar: "EE", xp: 10900, streak: 30, badges: 6, isMe: false },
];
import { CodingWorkspace } from "@/shared/components/CodingWorkspace";

const defaultCode = `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        complement = target - n
        if complement in seen:
            return [seen[complement], i]
        seen[n] = i
    return []

print(two_sum([2, 7, 11, 15], 9))
`;

const DIFF_COLORS: Record<CodingProblem["difficulty"], string> = {
  Easy: "bg-[var(--gold-muted)] text-[var(--gold)]",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Hard: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const STATUS_ICON: Record<CodingProblem["status"], React.ReactNode> = {
  Solved: <CheckCircle className="w-4 h-4" style={{ color: "var(--gold)" }} />,
  Attempted: <Minus className="w-4 h-4 text-amber-500" />,
  Unsolved: <Circle className="w-4 h-4 text-muted-foreground/40" />,
};

const MOCK_SUBMISSIONS = [
  { id: 1, status: "Accepted", runtime: "42ms", memory: "14.2MB", lang: "Python", time: "10 minutes ago" },
  { id: 2, status: "Wrong Answer", runtime: "N/A", memory: "N/A", lang: "Python", time: "15 minutes ago" },
  { id: 3, status: "Time Limit Exceeded", runtime: "N/A", memory: "N/A", lang: "Python", time: "1 hour ago" },
];

export function CodeEditorPage() {
  const [selectedProblem, setSelectedProblem] = useState<CodingProblem | null>(null);
  const [mainTab, setMainTab] = useState<"problems" | "leaderboard">("problems");
  
  // Filters for problems list
  const [diffFilter, setDiffFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = CODING_PROBLEMS.filter(p => {
    const matchDiff = diffFilter === "All" || p.difficulty === diffFilter;
    const matchStatus = statusFilter === "All" || p.status === statusFilter;
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.topic.toLowerCase().includes(search.toLowerCase());
    return matchDiff && matchStatus && matchSearch;
  });

  if (selectedProblem) {
    return (
      <CodingWorkspace
        problem={selectedProblem}
        initialCode={defaultCode}
        mode="practice"
        onClose={() => setSelectedProblem(null)}
        onNext={() => {
          const idx = CODING_PROBLEMS.findIndex(p => p.id === selectedProblem.id);
          if (idx < CODING_PROBLEMS.length - 1) setSelectedProblem(CODING_PROBLEMS[idx + 1]);
        }}
      />
    );
  }

  // ─── LIST VIEW (No Problem Selected) ──────────────────────────────────────────
  const solved = CODING_PROBLEMS.filter(p => p.status === "Solved").length;
  const totalPoints = CODING_PROBLEMS.filter(p => p.status === "Solved").reduce((a, p) => a + p.points, 0);

  return (
    <div className="p-8">
      <PageHeader
        title="Coding Practice"
        description="Solve problems, earn XP, and climb the leaderboard."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{solved}</p>
          <p className="text-xs text-muted-foreground">Solved</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{CODING_PROBLEMS.filter(p => p.status === "Attempted").length}</p>
          <p className="text-xs text-muted-foreground">Attempted</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{totalPoints}</p>
          <p className="text-xs text-muted-foreground">Points earned</p>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit mb-6">
        {(["problems", "leaderboard"] as const).map(t => (
          <button key={t} onClick={() => setMainTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${mainTab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "problems" ? "📋 Problems" : "🏆 Leaderboard"}
          </button>
        ))}
      </div>

      {mainTab === "problems" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search problems…" className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-[var(--gold)]" />
            </div>
            <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              {["All", "Easy", "Medium", "Hard"].map(d => <option key={d}>{d}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              {["All", "Solved", "Attempted", "Unsolved"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-border">
              <span className="text-sm text-muted-foreground">{filtered.length} problems</span>
            </div>
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">No problems match your filters.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-8"></th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Topic</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Difficulty</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acceptance</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Points</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4">{STATUS_ICON[p.status]}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{p.title}</td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{p.topic}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_COLORS[p.difficulty]}`}>{p.difficulty}</span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{p.acceptance}%</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-[var(--gold)]">+{p.points}</td>
                      <td className="py-3 px-4 text-right">
                        <Button size="sm" variant={p.status === "Solved" ? "outline" : "default"} onClick={() => setSelectedProblem(p)}>
                          {p.status === "Solved" ? "Review" : "Solve"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {mainTab === "leaderboard" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="font-semibold text-foreground">Coding Leaderboard</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rank</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Student</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">XP</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Streak</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Badges</th>
              </tr>
            </thead>
            <tbody>
              {LEADERBOARD.map(entry => (
                <tr key={entry.rank} className={`border-b border-border last:border-0 transition-colors ${entry.isMe ? "bg-[var(--gold-muted)]" : "hover:bg-accent/30"}`}>
                  <td className="py-3 px-4 font-bold text-center">
                    {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--gold-muted)] flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[var(--gold)]">{entry.avatar}</span>
                      </div>
                      <span className={`font-medium ${entry.isMe ? "text-[var(--gold)]" : "text-foreground"}`}>
                        {entry.name}{entry.isMe && " (You)"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold">{entry.xp.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-[var(--gold)]">🔥 {entry.streak}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{entry.badges}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
