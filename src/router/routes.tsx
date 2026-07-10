import { createBrowserRouter, Navigate } from "react-router";

import { DashboardLayout } from "@/shared/layouts/DashboardLayout";
import { ProtectedRoute } from "./ProtectedRoute";

// Auth
import { LoginPage } from "@/features/auth/LoginPage";

// Dashboards (role-specific)
import { SuperAdminDashboard } from "@/features/super-admin/SuperAdminDashboard";
import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { FacultyDashboard } from "@/features/faculty/FacultyDashboard";
import { StudentDashboard } from "@/features/student/StudentDashboard";

// Common pages (shared across multiple roles)
import { SettingsPage } from "@/features/common/SettingsPage";
import { NotificationsPage } from "@/features/common/NotificationsPage";
import { MessagesPage } from "@/features/common/MessagesPage";
import { CalendarPage } from "@/features/common/CalendarPage";
import { CourseContentPage } from "@/features/common/CourseContentPage";
import { AssignmentsPage } from "@/features/common/AssignmentsPage";
import { TestManagementPage } from "@/features/common/TestManagementPage";
import { CertificatesPage } from "@/features/common/CertificatesPage";
import { AiInterviewerPage } from "@/features/common/AiInterviewerPage";
import { SupportTicketsPage } from "@/features/common/SupportTicketsPage";
import { NotFoundPage } from "@/features/common/NotFoundPage";
import { CertificateView } from "@/features/common/CertificateView";

// Admin pages (company employee managing a single institute)
import { StudentsPage } from "@/features/admin/StudentsPage";
import { FacultyAdminPage } from "@/features/admin/FacultyAdminPage";
import { CoursesPage } from "@/features/admin/CoursesPage";
import { BatchesPage } from "@/features/admin/BatchesPage";
import { AnalyticsPage } from "@/features/admin/AnalyticsPage";
import { AttendancePage } from "@/features/admin/AttendancePage";
import { LiveClassesPage } from "@/features/admin/LiveClassesPage";
import { BillingPage } from "@/features/admin/BillingPage";
import { AuditLogsPage } from "@/features/admin/AuditLogsPage";

// Faculty pages (trainer)
import { FacultyMyCoursesPage } from "@/features/faculty/FacultyMyCoursesPage";
import { StudentPerformancePage } from "@/features/faculty/StudentPerformancePage";
import { AssignmentReviewPage } from "@/features/faculty/AssignmentReviewPage";
import { FacultyAnalyticsPage } from "@/features/faculty/FacultyAnalyticsPage";

// Student pages (learner)
import { MyCoursesPage } from "@/features/student/MyCoursesPage";
import { CourseCatalogPage } from "@/features/student/CourseCatalogPage";
import { ProgressPage } from "@/features/student/ProgressPage";
import { CodeEditorPage } from "@/features/student/CodeEditorPage";
import { CodingTestPage } from "@/features/student/CodingTestPage";
import { AptitudeTestPage } from "@/features/student/AptitudeTestPage";
import { TakeTestPage } from "@/features/student/TakeTestPage";

// Super-admin pages (company HQ — oversees all institutes)
import { ClientsPage } from "@/features/super-admin/ClientsPage";
import { ServerHealthPage } from "@/features/super-admin/ServerHealthPage";
import { SubscriptionsPage } from "@/features/super-admin/SubscriptionsPage";
import { RevenueAnalyticsPage } from "@/features/super-admin/RevenueAnalyticsPage";
import { GlobalUsersPage } from "@/features/super-admin/GlobalUsersPage";

export const router = createBrowserRouter([
  // ── Public ──────────────────────────────────────────────────────────────────
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/certificates/:code/view",
    element: <CertificateView />,
  },

  // ── Root redirect ────────────────────────────────────────────────────────────
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },

  // ── Super Admin ──────────────────────────────────────────────────────────────
  // Company HQ: oversees ALL institutes, revenue, global users, system health
  {
    path: "/super-admin",
    element: <ProtectedRoute allowedRoles={["super-admin"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true,              element: <Navigate to="dashboard" replace /> },
          { path: "dashboard",        element: <SuperAdminDashboard /> },
          { path: "tenants",          element: <ClientsPage /> },
          { path: "subscriptions",    element: <SubscriptionsPage /> },
          { path: "billing",          element: <BillingPage /> },
          { path: "revenue",          element: <RevenueAnalyticsPage /> },
          { path: "server",           element: <ServerHealthPage /> },
          { path: "audit",            element: <AuditLogsPage /> },
          { path: "support",          element: <SupportTicketsPage /> },
          { path: "global-users",     element: <GlobalUsersPage /> },
          { path: "settings",         element: <SettingsPage userType="super-admin" /> },
        ],
      },
    ],
  },

  // ── Admin ────────────────────────────────────────────────────────────────────
  // Company employee on-site at a single institute: manages students, attendance, live classes
  {
    path: "/admin",
    element: <ProtectedRoute allowedRoles={["admin"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true,              element: <Navigate to="dashboard" replace /> },
          { path: "dashboard",        element: <AdminDashboard /> },
          { path: "students",         element: <StudentsPage userType="admin" /> },
          { path: "faculty",          element: <FacultyAdminPage /> },
          { path: "courses",          element: <CoursesPage userType="admin" /> },
          { path: "course-content",   element: <CourseContentPage /> },
          { path: "batches",          element: <BatchesPage /> },
          { path: "attendance",       element: <AttendancePage /> },
          { path: "live-classes",     element: <LiveClassesPage /> },
          { path: "assignments",      element: <AssignmentsPage userType="admin" /> },
          { path: "tests",            element: <TestManagementPage userType="admin" /> },
          { path: "analytics",        element: <AnalyticsPage userType="admin" /> },
          { path: "certificates",     element: <CertificatesPage userType="admin" /> },
          { path: "messages",         element: <MessagesPage userType="admin" /> },
          { path: "notifications",    element: <NotificationsPage /> },
          { path: "ai-interviewer",   element: <AiInterviewerPage userType="admin" /> },
          { path: "support",          element: <SupportTicketsPage /> },
          { path: "settings",         element: <SettingsPage userType="admin" /> },
        ],
      },
    ],
  },

  // ── Faculty ──────────────────────────────────────────────────────────────────
  // Trainer at the institute
  {
    path: "/faculty",
    element: <ProtectedRoute allowedRoles={["faculty"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true,                  element: <Navigate to="dashboard" replace /> },
          { path: "dashboard",            element: <FacultyDashboard /> },
          { path: "my-courses",           element: <FacultyMyCoursesPage /> },
          { path: "students",             element: <StudentsPage userType="faculty" /> },
          { path: "student-performance",  element: <StudentPerformancePage /> },
          { path: "assignment-review",    element: <AssignmentReviewPage /> },
          { path: "course-content",       element: <CourseContentPage /> },
          { path: "tests",                element: <TestManagementPage userType="faculty" /> },
          { path: "live-classes",         element: <LiveClassesPage /> },
          { path: "analytics",            element: <FacultyAnalyticsPage /> },
          { path: "calendar",             element: <CalendarPage /> },
          { path: "messages",             element: <MessagesPage userType="faculty" /> },
          { path: "notifications",        element: <NotificationsPage /> },
          { path: "settings",             element: <SettingsPage userType="faculty" /> },
        ],
      },
    ],
  },

  // ── Student ──────────────────────────────────────────────────────────────────
  // Learner at the institute
  {
    path: "/student",
    element: <ProtectedRoute allowedRoles={["student"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true,                element: <Navigate to="dashboard" replace /> },
          { path: "dashboard",          element: <StudentDashboard /> },
          { path: "courses",            element: <CourseCatalogPage /> },
          { path: "my-courses",         element: <MyCoursesPage /> },
          { path: "progress",           element: <ProgressPage /> },
          { path: "assignments",        element: <AssignmentsPage userType="student" /> },
          { path: "code-editor",        element: <CodeEditorPage /> },
          { path: "coding-test",        element: <CodingTestPage userType="student" /> },
          { path: "aptitude-test",      element: <AptitudeTestPage userType="student" /> },
          { path: "take-test/:testId",  element: <TakeTestPage /> },
          { path: "ai-interviewer",     element: <AiInterviewerPage userType="student" /> },
          { path: "certificates",       element: <CertificatesPage userType="student" /> },
          { path: "calendar",           element: <CalendarPage /> },
          { path: "messages",           element: <MessagesPage userType="student" /> },
          { path: "notifications",      element: <NotificationsPage /> },
          { path: "settings",           element: <SettingsPage userType="student" /> },
        ],
      },
    ],
  },

  // ── 404 ──────────────────────────────────────────────────────────────────────
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
