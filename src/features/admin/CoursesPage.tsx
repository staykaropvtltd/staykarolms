import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { BookOpen, Plus, Search, Users, X, Loader2, AlertCircle, Trash2 } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/shared/components/ui/button";
import { getCourses, createCourse, deleteCourse } from "@/shared/lib/api";
import { toast } from "sonner";

interface CoursesPageProps {
  userType: Extract<UserType, "admin" | "faculty">;
}

interface ApiCourse {
  id: string;
  title: string;
  description?: string;
  status?: string;
  thumbnail_url?: string;
  profiles?: { name: string; email: string };
  enrollments?: { count: number }[];
  created_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-[var(--gold-muted)] text-[var(--gold)]",
  draft:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  archived:  "bg-muted text-muted-foreground",
};

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 bg-muted rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function AddCourseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    const { error } = await createCourse({ title, description });
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Course created successfully!");
      onCreated();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">New Course</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Course title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Advanced Python Programming"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="Course description..."
            />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <Button className="flex-1" onClick={handleCreate} disabled={loading || !title.trim()}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Course
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function CoursesPage({ userType }: CoursesPageProps) {
  const isAdmin = userType === "admin";
  const navigate = useNavigate();
  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getCourses();
    if (err) {
      setError(err);
    } else {
      // Handle both enrolled-course shape and direct course shape
      const raw = (data as any[]) || [];
      const normalized: ApiCourse[] = raw.map((item: any) =>
        item.courses ? item.courses : item
      );
      setCourses(normalized);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This will remove all course content and enrollments.`)) return;
    setDeletingId(id);
    const { error } = await deleteCourse(id);
    setDeletingId(null);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Course deleted");
      fetchCourses();
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  const filtered = courses.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || (c.status ?? "active") === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const active   = courses.filter(c => (c.status ?? "active") === "active").length;
  const drafts   = courses.filter(c => c.status === "draft").length;
  const totalEnroll = courses.reduce((sum, c) => sum + (c.enrollments?.[0]?.count ?? 0), 0);

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-red-500 opacity-60" />
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchCourses}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      {showModal && <AddCourseModal onClose={() => setShowModal(false)} onCreated={fetchCourses} />}

      <PageHeader
        title={isAdmin ? "Courses" : "My Courses"}
        description={isAdmin
          ? "Create, publish, and assign faculty across your institution catalog."
          : "Manage content, rosters, and grading for the courses you teach."}
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
            <Plus className="size-4" /> {isAdmin ? "New course" : "New module"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Active courses" value={loading ? "—" : String(active)} icon={BookOpen} trend={{ value: `${drafts} draft${drafts !== 1 ? "s" : ""}`, isPositive: true }} />
        <StatCard title="Total enrollments" value={loading ? "—" : totalEnroll.toLocaleString()} icon={Users} trend={{ value: "Live from Supabase", isPositive: true }} />
        <StatCard title="Total courses" value={loading ? "—" : String(courses.length)} icon={BookOpen} trend={{ value: "All statuses", isPositive: true }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by course name…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm rounded-md border border-border bg-background">
          {["All", "Active", "Draft", "Archived"].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== "All") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("All"); }}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{isAdmin ? "Institution catalog" : "Your teaching load"}</span>
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} course${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-6 font-medium text-muted-foreground">Course</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Faculty</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Students</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-3 px-6 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {courses.length === 0 ? "No courses yet. Create your first one!" : "No courses match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="py-3 px-6 font-medium text-foreground max-w-[220px]">
                      <p className="truncate">{c.title}</p>
                      {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{c.profiles?.name ?? "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{c.enrollments?.[0]?.count ?? 0}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status ?? "active"] ?? "bg-muted text-muted-foreground"}`}>
                        {c.status ?? "active"}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/${isAdmin ? 'admin' : 'faculty'}/course-content?courseId=${c.id}`)}>
                          {isAdmin ? "Manage" : "Open"}
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingId === c.id}
                            onClick={() => handleDelete(c.id, c.title)}
                          >
                            {deletingId === c.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                              : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
