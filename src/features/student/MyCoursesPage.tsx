import { useEffect, useState } from "react";
import { Play, CheckCircle, Lock, BookOpen, Star, Zap, ChevronDown, ChevronRight, FileQuestion, Code2, FileText, Video, Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
export type CourseLesson = {
  id: string;
  title: string;
  type: "video" | "reading" | "quiz" | "code" | "pdf";
  duration: string;
  locked: boolean;
  completed: boolean;
  url?: string;
};

export type CourseModule = {
  id: string;
  title: string;
  lessons: CourseLesson[];
};

export type EnrolledCourse = {
  id: string;
  title: string;
  instructor: string;
  rating: number;
  thumbnail: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  xpReward: number;
  dueDate: string;
  category: string;
  modules: CourseModule[];
};
import { getCourses, getCourseContent, getCourseModules, getLessonCompletions, markLessonComplete } from "@/shared/lib/api";
import { toast } from "sonner";

const LESSON_ICONS = {
  video: <Video className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />,
  quiz: <FileQuestion className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />,
  code: <Code2 className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />,
  reading: <FileText className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />,
};

function CourseCard({ course, onSelect, selected }: { course: EnrolledCourse; onSelect: () => void; selected: boolean }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-accent/20"}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "var(--gold-muted)" }}>
          {course.thumbnail}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{course.title}</p>
          <p className="text-xs text-muted-foreground">{course.completedLessons}/{course.totalLessons} lessons</p>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color: "var(--gold)" }}>{course.progress}%</span>
      </div>
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${course.progress}%` }}
        />
      </div>
    </button>
  );
}

function VideoPlayer({ lesson }: { lesson: CourseLesson | null }) {
  if (!lesson) {
    return (
      <div className="aspect-video bg-muted/30 rounded-xl flex flex-col items-center justify-center border border-border">
        <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Select a lesson to start learning</p>
      </div>
    );
  }
  if (lesson.locked) {
    return (
      <div className="aspect-video bg-muted/30 rounded-xl flex flex-col items-center justify-center border border-border">
        <Lock className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-foreground font-medium">Lesson Locked</p>
        <p className="text-sm text-muted-foreground mt-1">Complete previous lessons to unlock</p>
      </div>
    );
  }

  // PDF / notes / code / reading — show open & download panel
  const isPdfOrDoc = lesson.type === "pdf" || lesson.type === "reading";
  const isCode = lesson.type === "code";
  if (isPdfOrDoc || isCode) {
    const Icon = isPdfOrDoc ? FileText : Code2;
    return (
      <div className="aspect-video bg-muted/20 rounded-xl flex flex-col items-center justify-center border border-border gap-4 p-6">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
          <Icon className="w-10 h-10" style={isPdfOrDoc ? { color: "#ef4444" } : { color: "var(--gold)" }} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground text-lg">{lesson.title}</p>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{lesson.type} · {lesson.duration}</p>
        </div>
        {lesson.url ? (
          <div className="flex gap-3">
            <a
              href={lesson.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: "var(--gold)", color: "#1A1A1A" }}
            >
              <ExternalLink className="w-4 h-4" />
              {isPdfOrDoc ? "Open PDF" : "Open File"}
            </a>
            <a
              href={lesson.url}
              download
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-accent/30 transition-colors"
            >
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No file attached to this lesson.</p>
        )}
        {lesson.completed && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--gold)" }}>
            <CheckCircle className="w-3.5 h-3.5" /> Completed
          </span>
        )}
      </div>
    );
  }

  // Video / default
  return (
    <div
      className="aspect-video bg-[#0d1117] rounded-xl flex flex-col items-center justify-center border border-border relative overflow-hidden group cursor-pointer"
      onClick={() => {
        if (lesson.url) {
          window.open(lesson.url, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <div className="absolute inset-0 opacity-20" style={{ background: "var(--gold)" }} />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-colors">
          <Play className="w-7 h-7 text-white ml-1" />
        </div>
        <p className="text-white font-semibold">{lesson.title}</p>
        <p className="text-white/60 text-sm">{lesson.duration}</p>
        {lesson.url && <p className="text-white/40 text-xs">Click to open video</p>}
      </div>
      {lesson.completed && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>
          <CheckCircle className="w-3 h-3" /> Completed
        </div>
      )}
    </div>
  );
}

function ModuleTree({ course, activeLesson, onSelectLesson }: { course: EnrolledCourse; activeLesson: CourseLesson | null; onSelectLesson: (l: CourseLesson) => void }) {
  const [expanded, setExpanded] = useState<string[]>([course.modules[0]?.id]);

  const toggle = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-2">
      {course.modules.map((mod, idx) => {
        const completedCount = mod.lessons.filter(l => l.completed).length;
        const isOpen = expanded.includes(mod.id);
        return (
          <div key={mod.id} className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(mod.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-accent/30 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                <p className="text-xs text-muted-foreground">{completedCount}/{mod.lessons.length} completed</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(completedCount / mod.lessons.length) * 100}%` }} />
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-border">
                {mod.lessons.map(lesson => (
                  <button
                    key={lesson.id}
                    onClick={() => !lesson.locked && onSelectLesson(lesson)}
                    disabled={lesson.locked}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${activeLesson?.id === lesson.id ? "bg-primary/10" : "hover:bg-accent/20"} ${lesson.locked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {lesson.locked ? <Lock className="w-3.5 h-3.5 text-muted-foreground" /> : lesson.completed ? <CheckCircle className="w-4 h-4" style={{ color: "var(--gold)" }} /> : LESSON_ICONS[lesson.type]}
                    </div>
                    <span className={`text-sm flex-1 truncate ${activeLesson?.id === lesson.id ? "font-medium text-primary" : "text-foreground"}`}>{lesson.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MyCoursesPage() {
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<EnrolledCourse | null>(null);
  const [activeLesson, setActiveLesson] = useState<CourseLesson | null>(null);
  const [tab, setTab] = useState<"player" | "overview">("player");
  const [notes, setNotes] = useState("");

  const handleMarkComplete = async () => {
    if (!selectedCourse || !activeLesson) return;
    
    try {
      const { data, error } = await markLessonComplete(selectedCourse.id, activeLesson.id);
      if (error) {
        toast.error(error);
        return;
      }
      
      // Update local state to reflect completion
      setCourses(prev => prev.map(c => {
        if (c.id === selectedCourse.id) {
          const newModules = c.modules.map(m => ({
            ...m,
            lessons: m.lessons.map(l => l.id === activeLesson.id ? { ...l, completed: true } : l)
          }));
          return {
            ...c,
            modules: newModules,
            progress: data?.progress ?? 100,
            completedLessons: c.completedLessons + 1
          };
        }
        return c;
      }));
      
      // Update active lesson state
      setActiveLesson(prev => prev ? { ...prev, completed: true } : null);
      
      toast.success("Lesson marked as complete!");
      
      // Handle certificate generation
      if (data?.certificateGenerated && data?.certificate) {
        toast.success("🎉 Course 100% Complete! Certificate Earned!", {
          duration: 10000,
          action: {
            label: "View Certificate",
            onClick: () => window.open(`/certificates/${data.certificate.verification_code}/view`, "_blank")
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to mark complete");
    }
  };

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      try {
        const { data: coursesData } = await getCourses();
        if (!coursesData) return;
        
        // Transform backend data to expected UI format
        const transformed: EnrolledCourse[] = await Promise.all(
          coursesData.map(async (item: any) => {
            const course = item.courses || item;
            const [{ data: modsData }, { data: contentData }, { data: completionsData }] = await Promise.all([
              getCourseModules(course.id),
              getCourseContent(course.id),
              getLessonCompletions(course.id)
            ]);
            
            let rawModules = modsData || [];
            const content = contentData || [];
            const completedContentIds = completionsData || [];
            
            if (rawModules.length === 0) {
              rawModules = [{ id: "general", title: "General Module", order_index: 0 }];
            }
            
            const structuredModules = rawModules.map((m: any) => ({
              id: m.id,
              title: m.title,
              lessons: content
                .filter((c: any) => c.module_id === m.id || (m.id === "general" && !c.module_id))
                .map((c: any) => {
                  return {
                    id: c.id,
                    title: c.title,
                    type: c.type,
                    duration: `${c.duration_mins || 10}m`,
                    locked: false,
                    completed: completedContentIds.includes(c.id),
                    url: c.url
                  };
                })
            }));
            
            const totalLessons = content.length;
            const completedLessons = completedContentIds.length;
            const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

            return {
              id: course.id,
              title: course.title,
              instructor: course.profiles?.name || "StayKaro Faculty",
              rating: 4.8,
              thumbnail: "📚", // Placeholder
              progress,
              totalLessons,
              completedLessons,
              xpReward: 500,
              dueDate: "Flexible",
              category: "Technology",
              modules: structuredModules
            };
          })
        );
        
        setCourses(transformed);
        if (transformed.length > 0) {
          setSelectedCourse(transformed[0]);
          setActiveLesson(transformed[0].modules[0]?.lessons[0] || null);
        }
      } catch (error) {
        console.error(error);
      }
      setLoading(false);
    }
    fetchCourses();
  }, []);

  const allLessons = selectedCourse?.modules.flatMap(m => m.lessons) || [];
  const nextLesson = allLessons.find(l => !l.completed && !l.locked);

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="p-8">
        <PageHeader title="My Courses" description="Everything you are enrolled in, with progress and next steps." />
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl mt-6">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
          You are not enrolled in any courses yet.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader title="My Courses" description="Everything you are enrolled in, with progress and next steps." />

      {/* Course selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {courses.map(c => (
          <CourseCard
            key={c.id}
            course={c}
            selected={selectedCourse!.id === c.id}
            onSelect={() => {
              setSelectedCourse(c);
              setActiveLesson(c.modules.flatMap(m => m.lessons).find(l => !l.completed && !l.locked) ?? null);
            }}
          />
        ))}
      </div>

      {/* Course detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player + tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Course header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">{selectedCourse!.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{selectedCourse!.instructor}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{selectedCourse!.rating}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />+{selectedCourse!.xpReward} XP on completion</span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-sm font-semibold tabular-nums" style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>
                {selectedCourse!.progress}%
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 bg-primary" style={{ width: `${selectedCourse!.progress}%` }} />
              </div>
              <span className="text-sm text-muted-foreground tabular-nums">{selectedCourse!.completedLessons}/{selectedCourse!.totalLessons} lessons</span>
            </div>
            {selectedCourse!.progress >= 90 && (
              <div className="mt-3 flex items-center gap-2 p-3 border rounded-lg" style={{ background: "var(--gold-muted)", borderColor: "color-mix(in srgb, var(--gold) 30%, transparent)" }}>
                <CheckCircle className="w-4 h-4 shrink-0" style={{ color: "var(--gold)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--gold)" }}>Almost there! Complete the final lesson to earn your certificate 🎓</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["player", "overview"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t === "player" ? "▶ Course Player" : "📋 Overview"}
              </button>
            ))}
          </div>

          {tab === "player" && (
            <div className="space-y-4">
              <VideoPlayer lesson={activeLesson} />
              {activeLesson && !activeLesson.locked && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{activeLesson.title}</p>
                    <p className="text-sm text-muted-foreground">{activeLesson.duration} · {activeLesson.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">← Prev</Button>
                    <Button size="sm" className="gap-1.5" onClick={handleMarkComplete} disabled={activeLesson.completed}>
                      <CheckCircle className="w-3.5 h-3.5" /> {activeLesson.completed ? "Completed" : "Mark Complete"}
                    </Button>
                    <Button variant="outline" size="sm">Next →</Button>
                  </div>
                </div>
              )}
              {/* Notes */}
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-2">📝 My Notes</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Take notes while watching…"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                />
                <Button size="sm" variant="outline" className="mt-2">Save Notes</Button>
              </div>
            </div>
          )}

          {tab === "overview" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Modules", value: selectedCourse!.modules.length },
                { label: "Total Lessons", value: selectedCourse!.totalLessons },
                { label: "Completed", value: selectedCourse!.completedLessons },
                { label: "XP Reward", value: `+${selectedCourse!.xpReward}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Module tree */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Course Content</h3>
              {nextLesson && (
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => setActiveLesson(nextLesson)}>
                  <Play className="w-3 h-3" /> Resume
                </Button>
              )}
            </div>
            <ModuleTree course={selectedCourse!} activeLesson={activeLesson} onSelectLesson={setActiveLesson} />
          </div>

          {/* Course info */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 divide-y divide-border">
            {[
              { label: "Category", value: selectedCourse!.category },
              { label: "Duration", value: "12 weeks" },
              { label: "Due date", value: selectedCourse!.dueDate },
              { label: "Certificate", value: selectedCourse!.progress >= 100 ? "✅ Earned" : "On completion" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between pt-2.5 first:pt-0">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
