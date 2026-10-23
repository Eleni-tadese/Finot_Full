import { useState, useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardTopNav from "../components/dashboard/DashboardTopNav";
import QaWorkNotice from "../components/dashboard/QaWorkNotice";

// Tablets (from 768px up to about 1100px) get the narrow, icon-only menu; phones keep the hamburger drawer.
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1099px)";

const useIsTablet = () => {
  const [tablet, setTablet] = useState(() => (typeof window !== "undefined" ? window.matchMedia(TABLET_QUERY).matches : false));
  useEffect(() => {
    const query = window.matchMedia(TABLET_QUERY);
    const update = () => setTablet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return tablet;
};

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const isTablet = useIsTablet();

  useEffect(() => {
    // Fetch notifications count
    // TODO: Implement notification fetching
    setNotifCount(0);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen(!mobileSidebarOpen);
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
      </div>
    );
  }

  // A student whose login slip has expired can only open the account page until the email and password are done.
  if (user.setup?.required) {
    if (pathname !== "/dashboard/account") return <Navigate to="/dashboard/account" replace />;
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
          <span className="font-semibold">Finot</span>
          <button onClick={handleLogout} className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">{t("logout")}</button>
        </div>
        <div className="p-4 md:p-8"><Outlet /></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <DashboardSidebar
        collapsed={isTablet || sidebarCollapsed}
        lockCollapsed={isTablet}
        onToggle={toggleSidebar}
        onLogout={handleLogout}
        notifCount={notifCount}
        user={user}
        className="hidden md:flex"
      />

      {/* Sidebar - Mobile Drawer */}
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity"
            onClick={toggleMobileSidebar}
          />
          {/* Mobile Sidebar - 75% width max */}
          <div className="fixed inset-y-0 left-0 z-50 w-[75vw] max-w-[280px] md:hidden">
            <DashboardSidebar
              collapsed={false}
              onToggle={toggleMobileSidebar}
              onLogout={handleLogout}
              notifCount={notifCount}
              user={user}
              onNavClick={toggleMobileSidebar}
            />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <QaWorkNotice userId={user.id} />
        {/* Top Navigation */}
        <DashboardTopNav
          user={user}
          onMenuClick={toggleMobileSidebar}
          notifCount={notifCount}
          onLogout={handleLogout}
        />

        {/* Page Content - Scrollable */}
        <main id="dashboard-main-scroll" className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {user.setup?.pending && pathname !== "/dashboard/account" && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="flex-1">{t("acc_banner", "Your login slip works for {{n}} more day(s). Add your own email and a new password before it ends.", { n: user.setup.days_left })}</span>
                <Link to="/dashboard/account" className="btn-primary px-3 py-1.5 text-xs">{t("acc_banner_btn", "Finish my account")}</Link>
              </div>
            )}
            {user.profile?.department_is_stage && (user.profile.batch_year ?? 0) >= 2 && pathname !== "/dashboard/profile/edit" && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-primary/5 px-4 py-3 text-sm text-foreground">
                <span className="flex-1">{t("prof_stage_banner", "You are in {{stage}}. Once your next stage or department is known, choose it on your profile.", { stage: user.profile.department })}</span>
                <Link to="/dashboard/profile/edit" className="btn-outline px-3 py-1.5 text-xs">{t("prof_stage_banner_btn", "Choose now")}</Link>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
