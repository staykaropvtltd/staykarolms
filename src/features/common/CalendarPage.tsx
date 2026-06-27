import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, Plus, X, Video, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getCalendarEvents, createCalendarEvent, getCourses } from "@/shared/lib/api";
import { toast } from "sonner";

type CalendarEventType = "live" | "doubt" | "workshop" | "exam" | "holiday" | string;

interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  scheduled_at: string;
  end_at?: string;
  duration_mins?: number;
  courses?: { title: string };
  day?: number; // computed
  time?: string; // computed
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const startPad = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay();
const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

const TYPE_COLORS: Record<string, string> = {
  live: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900",
  doubt: "bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30",
  workshop: "bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30",
  exam: "bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30",
  holiday: "bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30",
};

const TYPE_DOT: Record<string, string> = {
  live: "bg-red-500",
  doubt: "bg-primary",
  workshop: "bg-primary",
  exam: "bg-primary",
  holiday: "bg-primary",
};

function ScheduleModal({ onClose, onScheduled }: { onClose: () => void, onScheduled: () => void }) {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: "",
    course_id: "",
    type: "live",
    date: "",
    time: "",
    duration_mins: 60,
    description: "",
  });

  useEffect(() => {
    getCourses().then(({ data }) => setCourses(data || []));
  }, []);

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.time) return toast.error("Title, date, and time are required.");
    setLoading(true);
    const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
    try {
      const { error } = await createCalendarEvent({
        title: form.title,
        type: form.type,
        course_id: form.course_id || undefined,
        scheduled_at,
        duration_mins: form.duration_mins,
        description: form.description || undefined,
      });
      if (error) throw new Error(error);
      toast.success("Event scheduled successfully");
      onScheduled();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule event");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Schedule Event</h2>
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
          <div>
            <label className="text-xs font-medium text-muted-foreground">Course</label>
            <select 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={e => setForm({...form, course_id: e.target.value})}
            >
              <option value="">None (General)</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <select 
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.type}
              onChange={e => setForm({...form, type: e.target.value})}
            >
              <option value="live">Live Class</option>
              <option value="doubt">Doubt Session</option>
              <option value="workshop">Workshop</option>
              <option value="exam">Exam</option>
              <option value="holiday">Holiday</option>
            </select>
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
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayDate, setDisplayDate] = useState(new Date());

  const startPad = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0).getDate();
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...currentMonthDays];
  
  const monthName = displayDate.toLocaleString('default', { month: 'long' });
  const year = displayDate.getFullYear();
  const currentDate = new Date();

  const loadEvents = async (monthDate: Date = displayDate) => {
    setLoading(true);
    try {
      const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
      const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data, error } = await getCalendarEvents(from, to);
      if (error) {
        console.error("Failed to load calendar events:", error);
      } else if (data) {
        const processed = data.map((e: any) => {
          const d = new Date(e.scheduled_at);
          return {
            ...e,
            day: d.getDate(),
            time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        });
        setEvents(processed);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handlePrevMonth = () => {
    const newDate = new Date(displayDate.getFullYear(), displayDate.getMonth() - 1);
    setDisplayDate(newDate);
    loadEvents(newDate);
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    const newDate = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1);
    setDisplayDate(newDate);
    loadEvents(newDate);
    setSelectedDay(null);
  };

  const dayEvents = (day: number) => events.filter(e => e.day === day);
  const selectedEvents = selectedDay ? dayEvents(selectedDay) : [];

  return (
    <div className="p-8">
      {showModal && <ScheduleModal onClose={() => setShowModal(false)} onScheduled={() => { setShowModal(false); loadEvents(); }} />}

      <PageHeader
        title="Schedule"
        description="Classes, deadlines, and sessions synced to your LMS calendar."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2">
              <CalendarIcon className="size-4" /> Subscribe (ICS)
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
              <Plus className="size-4" /> Schedule event
            </Button>
          </div>
        }
      />

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap text-xs">
        {Object.entries(TYPE_DOT).map(([t, color]) => (
          <span key={t} className="flex items-center gap-1.5 text-muted-foreground capitalize">
            <span className={`w-2 h-2 rounded-full ${color}`} />{t}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-[1px] rounded-xl">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-foreground">{monthName} {year}</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevMonth}>Prev</Button>
              <Button variant="outline" size="sm" onClick={handleNextMonth}>Next</Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
            {weekDays.map(d => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              const evs = day ? dayEvents(day) : [];
              const isSelected = day === selectedDay;
              const isToday = day === currentDate.getDate();
              return (
                <div
                  key={idx}
                  onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                  className={`min-h-16 rounded-lg border text-sm flex flex-col p-1.5 transition-colors ${
                    day ? "border-border bg-background hover:bg-accent/50 cursor-pointer" : "border-transparent"
                  } ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""} ${isToday ? "border-primary/40" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-semibold self-end ${isToday ? "text-primary" : "text-foreground"}`}>{day}</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {evs.slice(0, 2).map(e => (
                          <span key={e.id} className={`w-full text-[9px] px-1 py-0.5 rounded truncate font-medium capitalize ${TYPE_COLORS[e.type] || TYPE_COLORS['doubt']}`}>{e.title}</span>
                        ))}
                        {evs.length > 2 && <span className="text-[9px] text-muted-foreground px-1">+{evs.length - 2} more</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected day events */}
          {selectedDay && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-base font-semibold text-foreground mb-3">{monthName} {selectedDay}</h3>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events on this day.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(e => (
                    <div key={e.id} className={`p-3 rounded-lg border capitalize ${TYPE_COLORS[e.type] || TYPE_COLORS['doubt']}`}>
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs mt-0.5 opacity-80">{e.time}</p>
                      {e.courses?.title && <p className="text-xs mt-0.5 opacity-70">{e.courses.title}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="size-4 text-[var(--gold)]" /> Upcoming
            </h2>
            <ul className="space-y-3">
              {events.filter(e => e.day! >= currentDate.getDate()).slice(0, 5).map(e => (
                <li key={e.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground text-sm leading-tight">{e.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 capitalize ${TYPE_COLORS[e.type] || TYPE_COLORS['doubt']}`}>{e.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{monthName} {e.day} · {e.time}</p>
                  {e.courses?.title && <p className="text-xs text-muted-foreground">{e.courses.title}</p>}
                </li>
              ))}
              {events.filter(e => e.day! >= currentDate.getDate()).length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming events this month.</p>
              )}
            </ul>
          </div>

          {/* Quick schedule */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Video className="w-4 h-4 text-[var(--gold)]" />
              <h3 className="text-base font-semibold text-foreground">Quick Schedule</h3>
            </div>
            <Button className="w-full gap-2" onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4" /> New event
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
