import { useState, useEffect } from "react";
import { Video, Plus, X, Users, Clock, ExternalLink, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { getLiveClasses, createLiveClass, startAttendance, getCourses, getBatches, endLiveClass, getLiveClassAttendance, updateLiveClassAttendance, deleteLiveClass } from "@/shared/lib/api";

interface LiveClass {
  id: string;
  title: string;
  course_id: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  platform: string;
  meeting_link: string;
  courses?: { title: string };
  // Mocked for now since attendance count isn't returned in getLiveClasses by default
  attendees?: number;
  totalStudents?: number;
  recording_url?: string;
}

const STATUS_COLORS: Record<string, string> = {
  upcoming:  "bg-[var(--gold-muted)] text-[var(--gold)]",
  live:      "bg-red-500/15 text-red-700 dark:text-red-400",
  completed: "bg-[var(--gold-muted)] text-[var(--gold)]",
};

const PLATFORM_COLORS: Record<string, string> = {
  "zoom":        "bg-[var(--gold-muted)] text-[var(--gold)]",
  "google_meet": "bg-[var(--gold-muted)] text-[var(--gold)]",
  "ms_teams":    "bg-[var(--gold-muted)] text-[var(--gold)]",
  "platform":    "bg-[var(--gold-muted)] text-[var(--gold)]",
};

function ScheduleModal({ onClose, onScheduled }: { onClose: () => void, onScheduled: () => void }) {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: "",
    course_id: "",
    batch_id: "",
    date: "",
    time: "",
    duration_mins: 60,
    platform: "google_meet",
    meeting_link: "",
    description: "",
  });

  useEffect(() => {
    getCourses().then(({ data }) => setCourses(data || []));
    getBatches().then(({ data }) => setBatches(data || []));
  }, []);

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.time) return toast.error("Title, date, and time are required.");
    if (form.platform !== "platform" && !form.meeting_link.trim()) {
      return toast.error("Paste the meeting link before scheduling.");
    }
    setLoading(true);
    const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
    try {
      const { error } = await createLiveClass({
        ...form,
        scheduled_at,
      });
      if (error) throw new Error(error);
      toast.success("Live class scheduled successfully");
      onScheduled();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule live class");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Schedule Live Class</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
              placeholder="e.g. Python Live Lab — File I/O"
              value={form.title}
              onChange={e => setForm({...form, title: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Course</label>
              <select 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.course_id}
                onChange={e => setForm({...form, course_id: e.target.value})}
              >
                <option value="">Select Course (optional)</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Batch</label>
              <select 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.batch_id}
                onChange={e => setForm({...form, batch_id: e.target.value})}
              >
                <option value="">Select Batch (optional)</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <input 
                type="date" 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
                value={form.date}
                onChange={e => setForm({...form, date: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <input 
                type="time" 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
                value={form.time}
                onChange={e => setForm({...form, time: e.target.value})}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Duration (mins)</label>
              <select 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.duration_mins}
                onChange={e => setForm({...form, duration_mins: Number(e.target.value)})}
              >
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <select 
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.platform}
                onChange={e => setForm({...form, platform: e.target.value})}
              >
                <option value="zoom">Zoom</option>
                <option value="google_meet">Google Meet</option>
                <option value="ms_teams">MS Teams</option>
                <option value="platform">Platform</option>
              </select>
            </div>
          </div>
          {form.platform !== "platform" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Meeting link <span className="text-red-500">*</span>
              </label>
              <input
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder={
                  form.platform === "google_meet"
                    ? "Paste your Google Meet link (meet.google.com/…)"
                    : form.platform === "zoom"
                    ? "Paste your Zoom link (zoom.us/j/…)"
                    : "Paste your Teams link (teams.microsoft.com/…)"
                }
                value={form.meeting_link}
                onChange={e => setForm({ ...form, meeting_link: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Create the meeting in {form.platform === "google_meet" ? "Google Meet" : form.platform === "zoom" ? "Zoom" : "MS Teams"} first, then paste the link here.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <textarea 
              rows={2} 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" 
              placeholder="Topics to cover…" 
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
            />
          </div>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule Class"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function AttendanceReviewModal({ classId, onClose }: { classId: string, onClose: () => void }) {
  const [attendances, setAttendances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAttendance();
  }, [classId]);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const { data } = await getLiveClassAttendance(classId);
      if (data) setAttendances(data);
    } catch (err) {
      toast.error("Failed to load attendance list");
    }
    setLoading(false);
  };

  const handleToggle = async (studentId: string, currentStatus: string) => {
    const newStatus = currentStatus === "present" ? "absent" : "present";
    // Optimistic update
    setAttendances(prev => prev.map(a => a.student_id === studentId ? { ...a, status: newStatus } : a));
    try {
      await updateLiveClassAttendance(classId, studentId, newStatus);
      toast.success(`Marked as ${newStatus}`);
    } catch (err) {
      // Revert on error
      toast.error("Failed to update attendance");
      loadAttendance();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">Attendance Review</h2>
            <p className="text-sm text-muted-foreground mt-1">Review and modify student attendance for this class.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : attendances.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No attendance records found.</p>
              <p className="text-xs mt-1">This class may have no enrolled students.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attendances.map((record) => (
                <div key={record.student_id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                  <div>
                    <p className="font-semibold text-sm">{record.profiles?.full_name || "Unknown Student"}</p>
                    <p className="text-xs text-muted-foreground">{record.profiles?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${record.status === 'present' ? 'text-green-600' : 'text-red-500'}`}>
                      {record.status}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleToggle(record.student_id, record.status)}
                    >
                      Toggle
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-6 pt-0 mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

export function LiveClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");
  const [showModal, setShowModal] = useState(false);
  const [attendanceClassId, setAttendanceClassId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const { data } = await getLiveClasses();
      if (data) setClasses(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const { error } = await deleteLiveClass(id);
    setDeleting(false);
    if (error) { toast.error(error); return; }
    toast.success("Class deleted");
    setDeleteConfirmId(null);
    loadClasses();
  };

  const handleStartAttendance = async (id: string, title: string) => {
    try {
      const { error } = await startAttendance(id);
      if (error) throw new Error(error);
      toast.success(`Started attendance for ${title}. Status is now Live.`);
      loadClasses();
    } catch (err: any) {
      toast.error(err.message || "Failed to start attendance");
    }
  };

  const filtered = classes.filter(c => c.status === tab || (tab === "upcoming" && c.status === "live"));
  const upcomingCount  = classes.filter(c => c.status === "upcoming" || c.status === "live").length;
  const completedCount = classes.filter(c => c.status === "completed").length;
  return (
    <div className="p-8">
      {showModal && <ScheduleModal onClose={() => setShowModal(false)} onScheduled={() => { setShowModal(false); loadClasses(); }} />}

      <PageHeader
        title="Live Classes"
        description="Schedule, manage, and review your live teaching sessions."
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
            <Plus className="size-4" /> Schedule class
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <StatCard title="Upcoming sessions" value={loading ? "—" : String(upcomingCount)} icon={Video} trend={{ value: "Next 7 days", isPositive: true }} />
        <StatCard title="Sessions completed" value={loading ? "—" : String(completedCount)} icon={CheckCircle} trend={{ value: "This month", isPositive: true }} />
      </div>

      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-lg w-fit">
        {(["upcoming", "completed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            <span className="ml-1.5 text-xs opacity-60">
              {t === "upcoming" ? upcomingCount : completedCount}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border border-border rounded-xl">
          <Video className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No {tab} sessions.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(cls => {
            const dateObj = new Date(cls.scheduled_at);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const platformColor = PLATFORM_COLORS[cls.platform] || PLATFORM_COLORS["Zoom"];
            
            return (
              <div key={cls.id} className="bg-card border border-border rounded-xl p-5 hover:bg-accent/10 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{cls.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{cls.courses?.title || "General"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[cls.status] || STATUS_COLORS["upcoming"]}`}>{cls.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${platformColor}`}>{cls.platform}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dateStr} · {timeStr}</span>
                  <span>{cls.duration_mins} mins</span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {/* Delete toggle */}
                  {deleteConfirmId === cls.id ? (
                    <div className="flex items-center gap-1.5 mr-auto">
                      <span className="text-xs text-red-500 font-medium">Delete?</span>
                      <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white h-7 px-2 text-xs" onClick={() => handleDelete(cls.id)} disabled={deleting}>
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>No</Button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(cls.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors mr-auto">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {(cls.status === "upcoming" || cls.status === "live") && (
                    <>
                      {cls.status === "upcoming" && (
                        <Button size="sm" className="gap-1.5 flex-1" onClick={() => handleStartAttendance(cls.id, cls.title)}>
                          <Video className="w-3.5 h-3.5" /> Go Live / Attendance
                        </Button>
                      )}
                      {cls.status === "live" && (
                        <Button 
                          size="sm" 
                          className="gap-1.5 flex-1" 
                          variant="destructive" 
                          onClick={async () => { 
                            try {
                              await endLiveClass(cls.id);
                              toast.success("Class ended successfully.");
                              loadClasses();
                              setAttendanceClassId(cls.id);
                            } catch (err) {
                              toast.error("Failed to end class");
                            }
                          }}
                        >
                          End Class
                        </Button>
                      )}
                      {cls.meeting_link && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(cls.meeting_link); toast.success("Meeting link copied!"); }}>
                          <ExternalLink className="w-3.5 h-3.5" /> Link
                        </Button>
                      )}
                    </>
                  )}
                  {cls.status === "completed" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1"
                        onClick={() => cls.recording_url ? window.open(cls.recording_url, "_blank") : toast.info("No recording available for this class")}>
                        View Recording
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAttendanceClassId(cls.id)}>Attendance</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attendanceClassId && (
        <AttendanceReviewModal classId={attendanceClassId} onClose={() => setAttendanceClassId(null)} />
      )}
    </div>
  );
}
