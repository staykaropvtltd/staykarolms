import { useState, useEffect, useRef } from "react";
import { CheckCircle, Clock, XCircle, Loader2, UserCheck, AlertCircle } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/StatCard";
import { toast } from "sonner";
import { useAuth } from "@/shared/context/AuthContext";
import { getActiveAttendanceSession, selfMarkAttendance, getStudentAttendance } from "@/shared/lib/api";

export function StudentAttendancePage() {
  const { user } = useAuth();

  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkActiveSession = async () => {
    const { data } = await getActiveAttendanceSession();
    setActiveSession(data);
    setSessionLoading(false);
    if (data?.already_marked) setMarked(true);
  };

  useEffect(() => {
    checkActiveSession();
    // Poll every 15s to catch new sessions
    pollRef.current = setInterval(checkActiveSession, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    getStudentAttendance(user.id).then(({ data }) => {
      setHistory((data as any[]) || []);
      setHistoryLoading(false);
    });
  }, [user?.id]);

  const handleMarkPresent = async () => {
    if (!activeSession) return;
    setMarking(true);
    const { error } = await selfMarkAttendance(activeSession.id);
    setMarking(false);
    if (error) {
      if (error.includes("Already marked")) {
        setMarked(true);
        toast.info("You already marked your attendance.");
      } else {
        toast.error(error);
      }
      return;
    }
    setMarked(true);
    toast.success("Attendance marked! You're marked as Present.");
  };

  const timeRemaining = activeSession
    ? Math.max(0, Math.floor((new Date(activeSession.expires_at).getTime() - Date.now()) / 1000))
    : 0;

  const presentCount = history.filter((r: any) => r.status === "present").length;
  const absentCount = history.filter((r: any) => r.status === "absent").length;
  const lateCount = history.filter((r: any) => r.status === "late").length;
  const rate = history.length > 0 ? Math.round(((presentCount + lateCount) / history.length) * 100) : 0;

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="My Attendance"
        description="Mark your attendance during live sessions and view your history."
      />

      {/* Live Session Banner */}
      <div>
        {sessionLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking for active sessions…
          </div>
        ) : activeSession ? (
          <div className="bg-card border-2 border-[var(--gold)]/50 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Live
                </span>
                <span className="text-sm font-semibold text-foreground">{activeSession.courses?.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Batch: <span className="font-medium text-foreground">{activeSession.batches?.name}</span>
                {timeRemaining > 0 && (
                  <span className="ml-3 text-amber-600">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Closes in {Math.floor(timeRemaining / 60)}m {timeRemaining % 60}s
                  </span>
                )}
              </p>
            </div>
            {marked ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--gold-muted)] text-[var(--gold)] font-semibold text-sm border border-[var(--gold)]/30">
                <CheckCircle className="w-4 h-4" /> You're Marked Present
              </span>
            ) : timeRemaining <= 0 ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground font-semibold text-sm">
                <XCircle className="w-4 h-4" /> Session Closed
              </span>
            ) : (
              <Button onClick={handleMarkPresent} disabled={marking} className="shrink-0">
                {marking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
                Mark Present
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0 opacity-50" />
            <p className="text-sm">No active attendance session right now. Your teacher will open one during class.</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Attendance Rate" value={`${rate}%`} icon={UserCheck} trend={{ value: "Overall", isPositive: rate >= 75 }} />
        <StatCard title="Present" value={String(presentCount)} icon={CheckCircle} trend={{ value: "Sessions", isPositive: true }} />
        <StatCard title="Absent" value={String(absentCount)} icon={XCircle} trend={{ value: "Missed", isPositive: false }} />
        <StatCard title="Late" value={String(lateCount)} icon={Clock} trend={{ value: "Marked late", isPositive: false }} />
      </div>

      {/* History */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Attendance History</h3>
        </div>
        {historyLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : history.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
            No attendance records yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((r: any) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.courses?.title}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                {r.status === "present" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--gold-muted)] text-[var(--gold)] border border-[var(--gold)]/30">
                    <CheckCircle className="w-3.5 h-3.5" /> Present
                  </span>
                )}
                {r.status === "absent" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 border border-red-200">
                    <XCircle className="w-3.5 h-3.5" /> Absent
                  </span>
                )}
                {r.status === "late" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-200">
                    <Clock className="w-3.5 h-3.5" /> Late
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
