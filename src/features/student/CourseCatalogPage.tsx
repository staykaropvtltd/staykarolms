import { useState, useEffect } from "react";
import { BookOpen, Users, Search, X, Loader2, CheckCircle, Clock, GraduationCap } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getAvailableCourses, enrollCourse } from "@/shared/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router";

interface AvailableCourse {
  id: string;
  title: string;
  description?: string;
  status?: string;
  profiles?: { name: string; email: string };
  enrollments?: [{ count: number }];
}

export function CourseCatalogPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<AvailableCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    const { data } = await getAvailableCourses();
    setCourses((data as AvailableCourse[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCourses(); }, []);

  const handleEnroll = async (courseId: string, title: string) => {
    setEnrolling(courseId);
    const { error } = await enrollCourse(courseId);
    setEnrolling(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Enrolled in "${title}"!`);
    // Remove from list and navigate to My Learning
    setCourses(prev => prev.filter(c => c.id !== courseId));
    setTimeout(() => navigate("/student/my-courses"), 800);
  };

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <PageHeader
        title="Explore Courses"
        description="Browse all courses available in your institution and enroll to start learning."
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or description…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 bg-card border border-border rounded-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border border-border rounded-2xl">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">
            {courses.length === 0 ? "No new courses available right now." : "No courses match your search."}
          </p>
          {courses.length === 0 && (
            <p className="text-sm mt-1">Check back later or contact your admin.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(course => {
            const enrollCount = (course.enrollments?.[0] as any)?.count ?? 0;
            return (
              <div key={course.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
                {/* Icon + status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gold-muted)" }}>
                    <BookOpen className="w-6 h-6" style={{ color: "var(--gold)" }} />
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ background: "var(--gold-muted)", color: "var(--gold)" }}
                  >
                    {course.status ?? "active"}
                  </span>
                </div>

                {/* Title + description */}
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-base leading-snug">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {course.profiles?.name && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5" />
                      {course.profiles.name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {enrollCount} enrolled
                  </span>
                </div>

                {/* Enroll button */}
                <Button
                  className="w-full gap-2"
                  onClick={() => handleEnroll(course.id, course.title)}
                  disabled={enrolling === course.id}
                >
                  {enrolling === course.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle className="w-4 h-4" />}
                  {enrolling === course.id ? "Enrolling…" : "Enroll Now"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
