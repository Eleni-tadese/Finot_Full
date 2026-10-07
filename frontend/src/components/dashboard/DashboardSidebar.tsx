import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { AuthUser } from "../../types";
import { hasRole } from "../../features/auth/roles";
import { FiGrid, FiUser, FiCalendar, FiCheckCircle, FiUsers, FiBriefcase, FiHeart, FiMessageCircle, FiLogOut, FiChevronLeft, FiChevronRight, FiChevronDown, FiSettings, FiFile, FiShield, FiSmartphone, FiDownload, FiUpload, FiExternalLink, FiBookOpen, FiTrendingUp, FiLayers } from "react-icons/fi";
import { ChatBubbleLeftRightIcon, RectangleGroupIcon, ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: number;
  /** Heading shown above this item (admin menu only). */
  heading?: string;
};

type DashboardSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  notifCount: number;
  user: AuthUser;
  className?: string;
  onNavClick?: () => void;
  /** Tablet: the menu stays icon-only and cannot be widened. */
  lockCollapsed?: boolean;
};

const OPEN_KEY = "finot_sidebar_student_pages_open";

const readOpen = () => {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
};

const DashboardSidebar = ({
  collapsed,
  onToggle,
  onLogout,
  notifCount,
  user,
  className = "",
  onNavClick,
  lockCollapsed = false,
}: DashboardSidebarProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [studentOpen, setStudentOpen] = useState(readOpen);

  const navItems: NavItem[] = [
    { to: "/dashboard", label: t("tab_overview"), icon: FiGrid, end: true },
    { to: "/dashboard/profile", label: t("profile"), icon: FiUser },
    { to: "/dashboard/events", label: t("tab_events"), icon: FiCalendar },
    { to: "/dashboard/attendance", label: t("tab_attendance"), icon: FiCheckCircle },
    { to: "/dashboard/my-courses", label: t("mc_title", "My courses"), icon: FiBookOpen },
    { to: "/dashboard/family", label: t("tab_family"), icon: FiUsers },
    { to: "/dashboard/questions", label: t("qa"), icon: FiMessageCircle },
    { to: "/dashboard/service", label: t("tab_groups"), icon: FiBriefcase },
    { to: "/dashboard/donations", label: t("donation"), icon: FiHeart },
    { to: "/dashboard/resources", label: t("resources"), icon: FiFile },
  ];

  // Add admin routes
  if (hasRole(user, "service_admin")) {
    navItems.push({ to: "/dashboard/manage-ageglot", label: t("manage_ageglot"), icon: FiSettings });
  }
  if (hasRole(user, "QA_counselor")) {
    navItems.push({ to: "/dashboard/counselor/queue", label: t("counselor_queue"), icon: ChatBubbleLeftRightIcon });
  }
  if (hasRole(user, "Course_coordinator")) {
    navItems.push({ to: "/dashboard/courses/coordinator", label: t("course_coordinator"), icon: RectangleGroupIcon });
  }
  if (hasRole(user, "QA_moderator")) {
    navItems.push({ to: "/dashboard/counselor/approve", label: t("moderator_queue"), icon: ShieldCheckIcon });
  }
  if (hasRole(user, "family_admin") && !hasRole(user, "Super_admin")) {
    navItems.push({ to: "/dashboard/admin/families", label: t("adm_nav_families", "Families"), icon: UserGroupIcon });
  }
  if (hasRole(user, "Event_manager")) {
    navItems.push({ to: "/dashboard/event-management", label: t("event_management"), icon: FiCalendar });
  }

  // Super Admin: the admin menu comes first; the student pages live in a drop-down so the list stays short.
  const isSuperAdmin = hasRole(user, "Super_admin");
  let studentPages: NavItem[] = [];
  if (isSuperAdmin) {
    studentPages = navItems.slice(1, 10);
    navItems.splice(0, navItems.length,
      { to: "/dashboard/admin", label: t("adm_nav_overview", "Overview"), icon: FiGrid, end: true },
      { to: "/dashboard/admin/users", label: t("adm_nav_users", "Users & roles"), icon: FiUsers, heading: t("adm_nav_h_people", "People") },
      { to: "/dashboard/admin/import", label: t("adm_nav_import", "Register students"), icon: FiUpload },
      { to: "/dashboard/admin/sub-admins", label: t("adm_nav_sub_admins", "Sub-admins"), icon: FiShield },
      { to: "/dashboard/admin/families", label: t("adm_nav_families", "Families"), icon: UserGroupIcon },
      { to: "/dashboard/admin/groups", label: t("adm_nav_groups", "Service groups"), icon: FiBriefcase, heading: t("adm_nav_h_fellowship", "Fellowship") },
      { to: "/dashboard/admin/courses", label: t("adm_nav_courses", "Courses"), icon: FiBookOpen },
      { to: "/dashboard/admin/events", label: t("adm_nav_events", "Events"), icon: FiCalendar },
      { to: "/dashboard/admin/qa", label: t("adm_nav_qa", "Private Q&A"), icon: FiMessageCircle },
      { to: "/dashboard/admin/year", label: t("adm_nav_year", "Academic year"), icon: FiTrendingUp, heading: t("adm_nav_h_setup", "Yearly setup") },
      { to: "/dashboard/admin/departments", label: t("adm_nav_departments", "Departments"), icon: FiLayers },
      { to: "/dashboard/admin/donations", label: t("adm_nav_donations", "Donations"), icon: FiHeart, heading: t("adm_nav_h_reports", "Reports and messages") },
      { to: "/dashboard/admin/sms", label: t("adm_nav_sms", "SMS"), icon: FiSmartphone },
      { to: "/dashboard/admin/exports", label: t("adm_nav_exports", "Export to Excel"), icon: FiDownload },
    );
  }
  const advancedAdminUrl = `${import.meta.env.VITE_API_URL ?? ""}/admin/`;

  // Open the drop-down by itself when the Super Admin is on one of the student pages.
  const onStudentPage = studentPages.some((p) => pathname === p.to || pathname.startsWith(p.to + "/"));
  useEffect(() => {
    if (onStudentPage) setStudentOpen(true);
  }, [onStudentPage]);
  const toggleStudent = () => {
    setStudentOpen((open) => {
      try { localStorage.setItem(OPEN_KEY, open ? "0" : "1"); } catch { /* storage may be blocked */ }
      return !open;
    });
  };

  const renderLink = (item: NavItem, nested = false) => (
    <Fragment key={item.to}>
    {item.heading && (collapsed
      ? <div className="mx-3 my-2 border-t border-white/10" />
      : <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{item.heading}</p>)}
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-normal transition-all duration-200 ${
          collapsed ? "justify-center" : ""
        } ${nested && !collapsed ? "ml-3 py-2" : ""} ${
          isActive
            ? "bg-white/20 text-white shadow-soft"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        }`
      }
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="h-5 w-5 flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {(item.badge ?? 0) > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-white">
              {item.badge}
            </span>
          )}
        </>
      )}
      {collapsed && (item.badge ?? 0) > 0 && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
      )}
    </NavLink>
    </Fragment>
  );

  return (
    <aside
      className={`${className} ${
        collapsed ? "w-20" : "w-64"
      } flex flex-col border-r border-white/10 bg-primary shadow-soft transition-all duration-300`}
    >
      {/* Logo Header */}
      <div
        className={`flex items-center border-b border-white/10 p-4 ${
          collapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <img src="/images/logo.png" alt="finot" className="h-8 w-8" />
            <span className="text-base font-semibold text-white">Finot</span>
          </div>
        )}
        {lockCollapsed && <img src="/images/logo.png" alt="finot" className="h-8 w-8" />}
        <button
          onClick={onToggle}
          hidden={lockCollapsed}
          className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          title={collapsed ? t("ui_expand_sidebar") : t("ui_collapse_sidebar")}
        >
          {collapsed ? (
            <FiChevronRight className="h-5 w-5" />
          ) : (
            <FiChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => renderLink(item))}

        {isSuperAdmin && studentPages.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={toggleStudent}
              aria-expanded={studentOpen}
              title={collapsed ? t("adm_nav_my_pages", "My student pages") : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : ""}`}
            >
              <FiUser className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{t("adm_nav_my_pages", "My student pages")}</span>
                  <FiChevronDown className={`h-4 w-4 transition-transform duration-200 ${studentOpen ? "rotate-180" : ""}`} />
                </>
              )}
            </button>
            {studentOpen && <div className="mt-1 space-y-1">{studentPages.map((item) => renderLink(item, true))}</div>}
          </div>
        )}

        {isSuperAdmin && (
          <a
            href={advancedAdminUrl}
            target="_blank"
            rel="noreferrer"
            title={collapsed ? t("adm_nav_advanced", "Advanced (Django admin)") : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-normal text-white/50 transition hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : ""}`}
          >
            <FiExternalLink className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{t("adm_nav_advanced", "Advanced (Django admin)")}</span>}
          </a>
        )}
      </nav>

      {/* Logout Button */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={onLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-normal text-white/70 transition hover:bg-destructive/20 hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? t("logout") : undefined}
        >
           <FiLogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{t("logout")}</span>}
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
