import { useState, useRef, useEffect } from "react";
import { Bell, Search, Menu, BookOpen, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import { getCourses, getUsers, getUnreadNotificationCount } from "../lib/api";

interface SearchCourse {
  id: string;
  title: string;
  status?: string;
}

interface SearchStudent {
  id: string;
  name: string;
  email: string;
}

interface DashboardHeaderProps {
  onMenuClick?: () => void;
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<SearchCourse[]>([]);
  const [students, setStudents] = useState<SearchStudent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch real search data once on mount
  useEffect(() => {
    getCourses().then(({ data }) => {
      if (data) {
        const raw = (data as any[]).map((item: any) => item.courses ?? item);
        setCourses(raw.map((c: any) => ({ id: c.id, title: c.title, status: c.status ?? "active" })));
      }
    });

    // Only admin / faculty / super-admin can search students
    if (user?.role !== "student") {
      getUsers("student").then(({ data }) => {
        if (data) {
          setStudents((data as any[]).map((s: any) => ({ id: s.id, name: s.name, email: s.email })));
        }
      });
    }

    // Fetch real unread notification count (not applicable to super-admin)
    if (user?.role !== "super-admin") {
      getUnreadNotificationCount().then(({ data }) => {
        if (data) setUnreadCount(data.count);
      });
    }
  }, [user?.role]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const trimmed = query.trim().toLowerCase();

  const matchedCourses = trimmed
    ? courses
        .filter((c) => c.title.toLowerCase().includes(trimmed))
        .slice(0, 3)
    : [];

  const matchedStudents = trimmed
    ? students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(trimmed) ||
            s.email.toLowerCase().includes(trimmed)
        )
        .slice(0, 2)
    : [];

  const hasResults = matchedCourses.length > 0 || matchedStudents.length > 0;

  const handleBell = () => {
    if (!user) return;
    if (user.role === "super-admin") return;
    navigate(`/${user.role}/notifications`);
  };

  const handleCourseClick = () => {
    setOpen(false);
    setQuery("");
    navigate(`/${user?.role ?? "admin"}/courses`);
  };

  const handleStudentClick = () => {
    setOpen(false);
    setQuery("");
    navigate(`/${user?.role ?? "admin"}/students`);
  };

  return (
    <motion.header
      className="h-16 border-b border-border bg-background px-4 md:px-8 flex items-center justify-between shrink-0"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3 flex-1 max-w-xl" ref={searchRef}>
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            placeholder="Search courses, students, or activities..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-input-background border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />

          {/* Results dropdown */}
          <AnimatePresence>
            {open && trimmed && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-2 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
              >
                {!hasResults ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No results for "{query}"
                  </div>
                ) : (
                  <>
                    {matchedCourses.length > 0 && (
                      <div>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Courses
                          </p>
                        </div>
                        {matchedCourses.map((c) => (
                          <button
                            key={c.id}
                            onClick={handleCourseClick}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60 transition-colors text-left"
                          >
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: "var(--gold-muted)" }}
                            >
                              <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                            </div>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize"
                              style={{ background: "var(--gold-muted)", color: "var(--gold)" }}
                            >
                              {c.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {matchedStudents.length > 0 && (
                      <div className={matchedCourses.length > 0 ? "border-t border-border" : ""}>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Students
                          </p>
                        </div>
                        {matchedStudents.map((s) => (
                          <button
                            key={s.id}
                            onClick={handleStudentClick}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60 transition-colors text-left"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                              style={{ background: "var(--gold-muted)", color: "var(--gold)" }}
                            >
                              {s.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="px-4 py-2.5 border-t border-border bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        {matchedCourses.length + matchedStudents.length} result{matchedCourses.length + matchedStudents.length !== 1 ? "s" : ""} for "{query}"
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <ThemeToggle />
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <button
            onClick={handleBell}
            className="p-2 rounded-lg hover:bg-accent transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: "var(--gold)" }} />
            )}
          </button>
        </motion.div>
      </div>
    </motion.header>
  );
}
