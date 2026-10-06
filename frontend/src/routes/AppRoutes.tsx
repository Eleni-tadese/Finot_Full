import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "../layouts/MainLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import TeacherQaDashboard from "../pages/admin/CounselorQueue";
import HomePage from "../pages/home/HomePage";
import AboutPage from "../pages/about/AboutPage";
import ContactPage from "../pages/contact/ContactPage";
import RegisterPage from "../pages/auth/RegisterPage";
import LoginPage from "../pages/auth/LoginPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import ResetPasswordConfirmPage from "../pages/auth/ResetPasswordConfirmPage";
import DashboardIndex from "../features/admin-console/components/DashboardIndex";
import AdminOverviewPage from "../features/admin-console/components/OverviewPage";
import AdminSubAdminsPage from "../features/admin-console/components/SubAdminsPage";
import AdminGroupsPage from "../features/admin-console/components/ServiceGroupsAdminPage";
import AdminCoursesPage from "../features/admin-console/components/CoursesAdminPage";
import AdminYearPage from "../features/admin-console/components/AcademicYearPage";
import AdminDepartmentsPage from "../features/admin-console/components/DepartmentsPage";
import AdminUsersPage from "../features/admin-console/components/UsersPage";
import AdminQaPage from "../features/admin-console/components/QaAdminPage";
import AdminFamiliesPage from "../features/admin-console/components/FamiliesAdminPage";
import AdminSmsPage from "../features/admin-console/components/SmsAdminPage";
import AdminDonationsPage from "../features/admin-console/components/DonationsAdminPage";
import AdminEventsPage from "../features/admin-console/components/EventsAdminPage";
import AdminExportsPage from "../features/admin-console/components/ExportsPage";
import DashboardProfile from "../pages/dashboard/DashboardProfile";
import DashboardEvents from "../pages/dashboard/DashboardEvents";
import DashboardAttendance from "../pages/dashboard/DashboardAttendance";
import DashboardFamily from "../pages/dashboard/DashboardFamily";
import DashboardService from "../pages/dashboard/DashboardService";
import DashboardDonations from "../pages/dashboard/DashboardDonations";
import DashboardQuestions from "../pages/dashboard/DashboardQuestions";
import DashboardNotifications from "../pages/dashboard/DashboardNotifications";
import EditProfile from "../pages/profile/EditProfile";
import AnonymousIntro from "../pages/qa/AnonymousIntro";
import QuestionList from "../pages/qa/QuestionList";
import AskQuestion from "../pages/qa/AskQuestion";
import ResourcesList from "../pages/resources/ResourcesList";

import {
  DonationOutside,
  DonationInside,
  DonationHistory,
  DonationProfile,
  DonationSuccess,
} from "../pages/donation";
import ServiceGroupDetail from "../pages/service/ServiceGroupDetail";
import PreferenceForm from "../pages/service/PreferenceForm";
import ManageAgeglotDashboard from "../pages/admin/ManageAgeglotDashboard";
import ProtectedRoute from "../features/auth/components/ProtectedRoute";
import CourseManagement from "@/pages/course/CoordinatorCourses";
import TakeAttendance from "@/pages/course/TakeAttendance";
import EventManagement from "@/pages/admin/EventManagement";
import CounselorQueue from "../pages/admin/CounselorQueue";
import ModeratorQueue from "@/pages/admin/ModeratorQueue";
import CoordinatorCourses from "@/pages/course/CoordinatorCourses";
import CourseMaterialsPage from "@/pages/course/CourseMaterialsPage";
import MyCoursesPage from "@/pages/course/MyCoursesPage";
import AttendanceReportPage from "@/features/course-attendance/components/AttendanceReportPage";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* public */}
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="password-reset/confirm/:uid/:token"
            element={<ResetPasswordConfirmPage />}
          />
          <Route path="anonymous" element={<AnonymousIntro />} />
          <Route path="anonymous/questions" element={<QuestionList />} />
          <Route path="anonymous/ask" element={<AskQuestion />} />
          <Route path="donate" element={<DonationOutside />} />
          <Route path="donate/success" element={<DonationSuccess />} />
          <Route path="donation/success" element={<DonationSuccess />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Dashboard routes with persistent layout */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={["student", "service_admin", "QA_counselor", "family_admin", "Course_coordinator", "QA_moderator", "Event_manager", "Super_admin"]}
              />
            }
          >
            <Route path="dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardIndex />} />
              <Route path="profile" element={<DashboardProfile />} />
              <Route path="profile/edit" element={<EditProfile />} />
              <Route path="events" element={<DashboardEvents />} />
              <Route path="attendance" element={<DashboardAttendance />} />
              <Route path="my-courses" element={<MyCoursesPage />} />
              <Route path="family" element={<DashboardFamily />} />
              <Route path="service" element={<DashboardService />} />
              <Route path="service/:id" element={<ServiceGroupDetail />} />
              <Route path="service/select" element={<PreferenceForm />} />
              <Route path="donations" element={<DashboardDonations />} />
              <Route path="donations/give" element={<DonationInside />} />
              <Route path="donations/history" element={<DonationHistory />} />
              <Route path="donations/profile" element={<DonationProfile />} />
              <Route path="questions" element={<DashboardQuestions />} />
              <Route path="questions/ask" element={<AskQuestion />} />
              <Route path="notifications" element={<DashboardNotifications />}/>
              <Route path="resources" element={<ResourcesList />} />
              {/* Role-specific admin routes: each page is reachable only by the role that uses it */}
              <Route element={<ProtectedRoute allowedRoles={["Super_admin"]} />}>
                <Route path="admin" element={<AdminOverviewPage />} />
                <Route path="admin/groups" element={<AdminGroupsPage />} />
                <Route path="admin/courses" element={<AdminCoursesPage />} />
                <Route path="admin/events" element={<AdminEventsPage />} />
                <Route path="admin/year" element={<AdminYearPage />} />
                <Route path="admin/departments" element={<AdminDepartmentsPage />} />
                <Route path="admin/sub-admins" element={<AdminSubAdminsPage />} />
                <Route path="admin/users" element={<AdminUsersPage />} />
                <Route path="admin/qa" element={<AdminQaPage />} />
                <Route path="admin/donations" element={<AdminDonationsPage />} />
                <Route path="admin/sms" element={<AdminSmsPage />} />
                <Route path="admin/exports" element={<AdminExportsPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["Super_admin", "family_admin"]} />}>
                <Route path="admin/families" element={<AdminFamiliesPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["service_admin"]} />}>
                <Route path="manage-ageglot" element={<ManageAgeglotDashboard />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["Course_coordinator"]} />}>
                <Route path="courses" element={<CourseManagement />} />
                <Route path="take-attendance" element={<TakeAttendance />} />
                <Route path="courses/coordinator" element={<CoordinatorCourses />} />
                <Route path="courses/:id/attendance" element={<TakeAttendance />} />
                <Route path="courses/:id/report" element={<AttendanceReportPage />} />
                <Route path="courses/:id/materials" element={<CourseMaterialsPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["Event_manager"]} />}>
                <Route path="event-management" element={<EventManagement />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["QA_moderator"]} />}>
                <Route path="counselor/approve" element={<ModeratorQueue />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={["QA_counselor"]} />}>
                <Route path="counselor/queue" element={<CounselorQueue />} />
              </Route>
            </Route>
          </Route>

        </Route>
      </Routes>
    </BrowserRouter>
  );
}
