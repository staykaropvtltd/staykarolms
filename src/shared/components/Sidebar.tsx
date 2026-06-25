import { NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard, BookOpen, Users, FileText, BarChart3, Settings,
  Code2, Award, Calendar, MessageSquare, Mic, Building2, DollarSign,
  Server, Layers, TrendingUp, Bell, Video, Upload, ClipboardCheck,
  UserCheck, Shield, LifeBuoy, CreditCard, Globe, LogOut, Brain, ClipboardList
} from "lucide-react";
import type { UserType } from "../userTypes";
import { useAuth } from "../context/AuthContext";
import { motion } from "motion/react";

interface SidebarProps {
  userType: UserType;
  onClose?: () => void;
}

interface MenuItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const superAdminMenu: MenuItem[] = [
  { path: "dashboard",     label: "Overview",          icon: LayoutDashboard },
  { path: "tenants",       label: "Tenants",           icon: Building2 },
  { path: "subscriptions", label: "Subscriptions",     icon: CreditCard },
  { path: "billing",       label: "Billing",           icon: DollarSign },
  { path: "revenue",       label: "Revenue Analytics", icon: TrendingUp },
  { path: "server",        label: "Server Health",     icon: Server },
  { path: "audit",         label: "Audit Logs",        icon: Shield },
  { path: "support",       label: "Support Tickets",   icon: LifeBuoy },
  { path: "global-users",  label: "Global Users",      icon: Globe },
  { path: "settings",      label: "Global Settings",   icon: Settings },
];

const adminMenu: MenuItem[] = [
  { path: "dashboard",      label: "Dashboard",     icon: LayoutDashboard },
  { path: "students",       label: "Students",      icon: Users },
  { path: "faculty",        label: "Faculty",       icon: Users },
  { path: "courses",        label: "Courses",       icon: BookOpen },
  { path: "batches",        label: "Batches",       icon: Layers },
  { path: "attendance",     label: "Attendance",    icon: UserCheck },
  { path: "live-classes",   label: "Live Classes",  icon: Video },
  { path: "assignments",    label: "Assignments",   icon: FileText },
  { path: "tests",          label: "Tests",         icon: ClipboardList },
  { path: "analytics",      label: "Analytics",     icon: BarChart3 },
  { path: "certificates",   label: "Certificates",  icon: Award },
  { path: "notifications",  label: "Notifications", icon: Bell },
  { path: "ai-interviewer", label: "AI Interviewer",icon: Mic },
  { path: "support",        label: "Support",       icon: LifeBuoy },
  { path: "settings",       label: "Settings",      icon: Settings },
];

const facultyMenu: MenuItem[] = [
  { path: "dashboard",           label: "Dashboard",           icon: LayoutDashboard },
  { path: "my-courses",          label: "My Courses",          icon: BookOpen },
  { path: "students",            label: "Students",            icon: Users },
  { path: "student-performance", label: "Student Performance", icon: TrendingUp },
  { path: "assignment-review",   label: "Assignment Reviews",  icon: ClipboardCheck },
  { path: "course-content",      label: "Course Content",      icon: Upload },
  { path: "tests",               label: "Tests",               icon: ClipboardList },
  { path: "live-classes",        label: "Live Classes",        icon: Video },
  { path: "analytics",           label: "Analytics",           icon: BarChart3 },
  { path: "calendar",            label: "Schedule",            icon: Calendar },
  { path: "messages",            label: "Messages",            icon: MessageSquare },
  { path: "notifications",       label: "Notifications",       icon: Bell },
  { path: "settings",            label: "Settings",            icon: Settings },
];

const studentMenu: MenuItem[] = [
  { path: "dashboard",      label: "Dashboard",       icon: LayoutDashboard },
  { path: "courses",        label: "Explore Courses", icon: Globe },
  { path: "my-courses",     label: "My Learning",     icon: BookOpen },
  { path: "progress",       label: "My Progress",     icon: TrendingUp },
  { path: "assignments",    label: "Assignments",     icon: FileText },
  { path: "code-editor",    label: "Coding Practice", icon: Code2 },
  { path: "coding-test",    label: "Coding Test",     icon: Code2 },
  { path: "aptitude-test",  label: "Aptitude Test",   icon: Brain },
  { path: "ai-interviewer", label: "AI Interview Prep",icon: Mic },
  { path: "certificates",   label: "Certificates",    icon: Award },
  { path: "calendar",       label: "Calendar",        icon: Calendar },
  { path: "messages",       label: "Messages",        icon: MessageSquare },
  { path: "notifications",  label: "Notifications",   icon: Bell },
  { path: "settings",       label: "Settings",        icon: Settings },
];

const MENUS: Record<UserType, MenuItem[]> = {
  "super-admin": superAdminMenu,
  admin:         adminMenu,
  faculty:       facultyMenu,
  student:       studentMenu,
};

const SUBTITLES: Record<UserType, string> = {
  "super-admin": "StayKaro Team",
  admin:         "Institution Admin",
  faculty:       "Faculty Member",
  student:       "🔥 12-day streak · Lvl 12",
};

export function Sidebar({ userType, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menuItems = MENUS[userType];
  const base = `/${userType}`;

  const handleNavigate = () => {
    onClose?.();
  };

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate("/login", { replace: true });
  };

  return (
    <motion.aside
      className="w-80 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--gold)" }}
          >
            <span className="text-[#1A1A1A] font-bold text-lg">SK</span>
          </div>
          <div>
            <h1 className="font-bold text-sidebar-foreground">
              StayKaro{" "}
              <span style={{ color: "var(--gold)" }}>LMS</span>
            </h1>
            <p className="text-xs text-muted-foreground">{SUBTITLES[userType]}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-0.5">
          {menuItems.map(({ path, label, icon: Icon }) => (
            <motion.div
              key={path}
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <NavLink
                to={`${base}/${path}`}
                onClick={handleNavigate}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                    isActive
                      ? "text-[#1A1A1A] dark:text-[#0F0F0F]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: "var(--gold)", color: "#1A1A1A" }
                    : undefined
                }
              >
                <Icon className="w-4.5 h-4.5 shrink-0" style={{ width: "1.1rem", height: "1.1rem" }} />
                <span className="truncate">{label}</span>
              </NavLink>
            </motion.div>
          ))}
        </div>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-accent">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--gold)" }}
          >
            <span className="text-[#1A1A1A] text-sm font-bold">
              {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </motion.aside>
  );
}
