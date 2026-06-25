import { useState, useEffect } from "react";
import {
  BookOpen, Plus, Star, Users, FileText, Video, FileQuestion, Code2,
  ChevronDown, ChevronRight, Edit, Trash2, Loader2, X, Check, Link,
  GripVertical, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import {
  getCourses, getCourseContent, getCourseStudents, getCourseModules,
  createCourseModule, updateCourseModule, deleteCourseModule,
  addCourseContent, deleteCourseContent,
} from "@/shared/lib/api";

// ── types ─────────────────────────────────────────────────────────────────────

interface CourseModule { id: string; title: string; order_index: number; course_id: string }
interface ContentItem {
  id: string; title: string; type: string; url?: string;
  duration_mins?: number; module_id?: string | null; order_index?: number;
}
interface Course { id: string; title: string; description?: string; enrollments?: [{ count: number }] }
interface EnrolledStudent { id: string; profiles?: { name: string; email: string }; enrolled_at: string }

const CONTENT_TYPES = [
  { value: "video",   label: "Video",   icon: Video },
  { value: "pdf",     label: "PDF",     icon: FileText },
  { value: "quiz",    label: "Quiz",    icon: FileQuestion },
  { value: "code",    label: "Code",    icon: Code2 },
  { value: "reading", label: "Reading", icon: BookOpen },
];

const typeIcon = (type: string) => {
  const t = CONTENT_TYPES.find(c => c.value === type);
  if (!t) return <FileText className="w-4 h-4 text-muted-foreground" />;
  const Icon = t.icon;
  return <Icon className="w-4 h-4 text-[var(--gold)]" />;
};

// ── Add Module Modal ──────────────────────────────────────────────────────────

function AddModuleModal({
  courseId, onClose, onCreated,
}: { courseId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Module title is required"); return; }
    setSaving(true);
    const { error } = await createCourseModule(courseId, { title: title.trim() });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Module created!");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Add Module</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Module title *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Python"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Add Module
            </Button>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Resource Modal ────────────────────────────────────────────────────────

function AddResourceModal({
  courseId, moduleId, onClose, onAdded,
}: { courseId: string; moduleId: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ title: "", type: "video", url: "", duration_mins: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.url.trim()) { toast.error("URL is required"); return; }
    setSaving(true);
    const { error } = await addCourseContent(courseId, {
      title: form.title.trim(),
      type: form.type,
      url: form.url.trim(),
      duration_mins: form.duration_mins ? Number(form.duration_mins) : undefined,
      module_id: moduleId,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Resource added!");
    onAdded();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Add Resource</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
              placeholder="e.g. Intro to Variables" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type *</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {CONTENT_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${form.type === t.value ? "border-[var(--gold)] bg-[var(--gold-muted)] text-[var(--gold)]" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">URL *</label>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <Link className="w-4 h-4 text-muted-foreground shrink-0" />
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required
                placeholder="https://youtube.com/... or drive.google.com/..." className="flex-1 bg-transparent text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Duration (minutes)</label>
            <input type="number" min="0" value={form.duration_mins} onChange={e => setForm(f => ({ ...f, duration_mins: e.target.value }))}
              placeholder="e.g. 15" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Add Resource
            </Button>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Module Row ────────────────────────────────────────────────────────────────

function ModuleRow({
  mod, content, courseId, onRefresh,
}: {
  mod: CourseModule;
  content: ContentItem[];
  courseId: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mod.title);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteMod, setConfirmDeleteMod] = useState(false);

  const handleRename = async () => {
    if (!title.trim() || title === mod.title) { setEditing(false); return; }
    setSaving(true);
    const { error } = await updateCourseModule(courseId, mod.id, title.trim());
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Module renamed");
    setEditing(false);
    onRefresh();
  };

  const handleDeleteContent = async (item: ContentItem) => {
    setDeletingId(item.id);
    const { error } = await deleteCourseContent(courseId, item.id);
    setDeletingId(null);
    if (error) { toast.error(error); return; }
    toast.success(`"${item.title}" deleted`);
    onRefresh();
  };

  const handleDeleteModule = async () => {
    const { error } = await deleteCourseModule(courseId, mod.id);
    if (error) { toast.error(error); return; }
    toast.success("Module deleted");
    onRefresh();
  };

  return (
    <>
      {showAdd && (
        <AddResourceModal courseId={courseId} moduleId={mod.id} onClose={() => setShowAdd(false)} onAdded={onRefresh} />
      )}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Module header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 hover:bg-accent/20 transition-colors">
          <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-2 text-left min-w-0">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            {editing ? (
              <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setEditing(false); setTitle(mod.title); } }}
                  className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm font-medium" />
                <button onClick={handleRename} disabled={saving} className="text-[var(--gold)] hover:opacity-80">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => { setEditing(false); setTitle(mod.title); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{mod.title}</p>
                <p className="text-xs text-muted-foreground">{content.length} resource{content.length !== 1 ? "s" : ""}</p>
              </div>
            )}
          </button>
          {!editing && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Edit className="w-3.5 h-3.5" />
              </button>
              {confirmDeleteMod ? (
                <div className="flex items-center gap-1">
                  <button onClick={handleDeleteModule} className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600">Delete</button>
                  <button onClick={() => setConfirmDeleteMod(false)} className="px-2 py-1 text-xs rounded border border-border text-muted-foreground">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteMod(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content list */}
        {open && (
          <div className="divide-y divide-border">
            {content.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground italic">No resources yet — add one below.</p>
            ) : (
              content.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-6 py-3 hover:bg-accent/20 transition-colors group">
                  {typeIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      {item.duration_mins ? ` · ${item.duration_mins} min` : ""}
                    </p>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 text-xs text-[var(--gold)] hover:underline mr-1">Open</a>
                  )}
                  <button
                    onClick={() => handleDeleteContent(item)}
                    disabled={deletingId === item.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                  >
                    {deletingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))
            )}
            <div className="px-6 py-3">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdd(true)}>
                <Plus className="w-3.5 h-3.5" /> Add resource
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function FacultyMyCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "modules" | "students">("overview");

  const [modules, setModules] = useState<CourseModule[]>([]);
  const [allContent, setAllContent] = useState<ContentItem[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);

  useEffect(() => {
    getCourses().then(({ data }) => {
      setCourses((data as Course[]) || []);
      if (data && data.length > 0) setSelectedCourseId(data[0].id);
      setLoading(false);
    });
  }, []);

  const loadModulesAndContent = async (courseId: string) => {
    setContentLoading(true);
    const [modsRes, contentRes] = await Promise.all([
      getCourseModules(courseId),
      getCourseContent(courseId),
    ]);
    setModules((modsRes.data as CourseModule[]) || []);
    setAllContent((contentRes.data as ContentItem[]) || []);
    setContentLoading(false);
  };

  useEffect(() => {
    if (!selectedCourseId) return;
    if (tab === "modules") {
      loadModulesAndContent(selectedCourseId);
    } else if (tab === "students") {
      setContentLoading(true);
      getCourseStudents(selectedCourseId).then(({ data }) => {
        setStudents((data as EnrolledStudent[]) || []);
        setContentLoading(false);
      });
    }
  }, [selectedCourseId, tab]);

  const course = courses.find(c => c.id === selectedCourseId);
  const totalEnrolled = courses.reduce((a, c) => a + (c.enrollments?.[0]?.count || 0), 0);

  if (loading) return (
    <div className="p-8 flex justify-center items-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-8">
      {showAddModule && selectedCourseId && (
        <AddModuleModal
          courseId={selectedCourseId}
          onClose={() => setShowAddModule(false)}
          onCreated={() => { setShowAddModule(false); if (tab === "modules" && selectedCourseId) loadModulesAndContent(selectedCourseId); }}
        />
      )}

      <PageHeader
        title="My Courses"
        description="Manage content, rosters, and grading for the courses you teach."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Active courses" value={String(courses.length)} icon={BookOpen}
          trend={{ value: "Assigned to you", isPositive: true }} />
        <StatCard title="Total enrollments" value={String(totalEnrolled)} icon={Users}
          trend={{ value: "Across all courses", isPositive: true }} />
        <StatCard title="Avg. rating" value="4.8" icon={Star}
          trend={{ value: "+0.2 vs last term", isPositive: true }} />
      </div>

      {courses.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium">No courses assigned yet</p>
          <p className="text-sm mt-1">Ask your admin to assign you to a course.</p>
        </div>
      ) : (
        <>
          {/* Course selector */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {courses.map(c => (
              <button key={c.id} onClick={() => setSelectedCourseId(c.id)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedCourseId === c.id ? "text-[#1A1A1A] border-transparent" : "border-border bg-card text-foreground hover:bg-accent/50"}`}
                style={selectedCourseId === c.id ? { background: "var(--gold)", borderColor: "var(--gold)" } : undefined}>
                {c.title}
              </button>
            ))}
          </div>

          {course && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Course header */}
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">{course.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{course.enrollments?.[0]?.count || 0} students enrolled</span>
                  {course.description && <><span>·</span><span className="truncate">{course.description}</span></>}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border px-6 gap-1">
                {(["overview", "modules", "students"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-[var(--gold)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {t === "modules" ? `Modules${modules.length > 0 ? ` (${modules.length})` : ""}` : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* Overview */}
                {tab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[
                        { label: "Students enrolled", value: course.enrollments?.[0]?.count || 0 },
                        { label: "Modules", value: modules.length || "—" },
                        { label: "Resources", value: allContent.length || "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-foreground">{value}</p>
                          <p className="text-xs text-muted-foreground mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <Button onClick={() => setTab("modules")} variant="outline" size="sm" className="gap-2">
                        <BookOpen className="w-4 h-4" /> Manage Modules
                      </Button>
                      <Button onClick={() => setTab("students")} variant="outline" size="sm" className="gap-2">
                        <Users className="w-4 h-4" /> View Students
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modules */}
                {tab === "modules" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-muted-foreground">{modules.length} module{modules.length !== 1 ? "s" : ""}</p>
                      <Button size="sm" className="gap-1.5" onClick={() => setShowAddModule(true)}>
                        <Plus className="w-3.5 h-3.5" /> Add module
                      </Button>
                    </div>

                    {contentLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : modules.length === 0 ? (
                      <div className="border border-dashed border-border rounded-xl py-12 text-center">
                        <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-foreground">No modules yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Create your first module to start adding resources.</p>
                        <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowAddModule(true)}>
                          <Plus className="w-3.5 h-3.5" /> Add first module
                        </Button>
                      </div>
                    ) : (
                      modules.map(mod => (
                        <ModuleRow
                          key={mod.id}
                          mod={mod}
                          content={allContent.filter(c => c.module_id === mod.id)}
                          courseId={selectedCourseId!}
                          onRefresh={() => loadModulesAndContent(selectedCourseId!)}
                        />
                      ))
                    )}

                    {/* Unassigned content (module_id is null) */}
                    {allContent.filter(c => !c.module_id).length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Resources not assigned to a module
                        </p>
                        <div className="border border-dashed border-border rounded-xl overflow-hidden divide-y divide-border">
                          {allContent.filter(c => !c.module_id).map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 group">
                              {typeIcon(item.type)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                                <p className="text-xs text-muted-foreground">{item.type}</p>
                              </div>
                              <button
                                onClick={async () => {
                                  const { error } = await deleteCourseContent(selectedCourseId!, item.id);
                                  if (error) { toast.error(error); return; }
                                  toast.success("Deleted");
                                  loadModulesAndContent(selectedCourseId!);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Students */}
                {tab === "students" && (
                  <div className="overflow-x-auto">
                    {contentLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Student</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Email</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Enrolled On</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-10 text-center text-muted-foreground">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                No students enrolled yet.
                              </td>
                            </tr>
                          ) : (
                            students.map(s => (
                              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                                <td className="py-2.5 px-4 font-medium text-foreground">{s.profiles?.name ?? "—"}</td>
                                <td className="py-2.5 px-4 text-muted-foreground">{s.profiles?.email ?? "—"}</td>
                                <td className="py-2.5 px-4 text-muted-foreground text-xs">
                                  {s.enrolled_at ? new Date(s.enrolled_at).toLocaleDateString() : "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
