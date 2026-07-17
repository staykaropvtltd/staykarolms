import { BookOpen, Trophy } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/shared/components/PageHeader";

export type CodingProblem = {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
  acceptance: number;
  points: number;
  status: "Solved" | "Attempted" | "Unsolved";
};

export function CodeEditorPage() {
  const [mainTab, setMainTab] = useState<"problems" | "leaderboard">("problems");

  return (
    <div className="p-8">
      <PageHeader
        title="Coding Practice"
        description="Solve problems, earn XP, and climb the leaderboard."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">0</p>
          <p className="text-xs text-muted-foreground">Solved</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">0</p>
          <p className="text-xs text-muted-foreground">Attempted</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">0</p>
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
        <div className="bg-card border border-border rounded-xl">
          <div className="px-6 py-3 border-b border-border">
            <span className="text-sm text-muted-foreground">0 problems</span>
          </div>
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <BookOpen className="w-12 h-12 opacity-30" />
            <p className="font-medium text-foreground">No problems available</p>
            <p className="text-sm text-center max-w-sm">Your institution hasn't added any coding problems yet. Check back later.</p>
          </div>
        </div>
      )}

      {mainTab === "leaderboard" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="font-semibold text-foreground">Coding Leaderboard</h2>
          </div>
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <Trophy className="w-12 h-12 opacity-30" />
            <p className="font-medium text-foreground">No leaderboard data yet</p>
            <p className="text-sm">Solve problems to appear on the leaderboard.</p>
          </div>
        </div>
      )}
    </div>
  );
}
