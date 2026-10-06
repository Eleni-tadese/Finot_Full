import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AuthUser } from "../../types";
import { FiMenu, FiSettings } from "react-icons/fi";
import { NotificationBell } from "../notifications/NotificationBell";
import LanguageSelector from "../ui/LanguageSelector";
import ProfilePicture from "../ui/ProfilePicture";

type DashboardTopNavProps = {
  user: AuthUser;
  onMenuClick: () => void;
  notifCount: number;
  onLogout?: () => void;
};

const DashboardTopNav = ({ user, onMenuClick, notifCount, onLogout }: DashboardTopNavProps) => {
  const { t } = useTranslation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const mainEl = document.getElementById("dashboard-main-scroll");
    if (!mainEl) return;
    const handleScroll = () => {
      setScrolled(mainEl.scrollTop > 10);
    };
    mainEl.addEventListener("scroll", handleScroll);
    return () => mainEl.removeEventListener("scroll", handleScroll);
  }, []);

  const fullName = user?.full_name || "";
  const profile = user?.profile || {} as any;
  const profileImage = profile?.profile_image || "";
  const department = profile?.department || "";
  const batch = profile?.batch || "";

  // Dynamic classes
  const headerBgClass = scrolled
    ? "bg-white/80 backdrop-blur-md border-slate-200"
    : "bg-white border-transparent";
  
  const textPrimaryClass = "text-slate-900";
  const textSecondaryClass = "text-slate-500";
  const iconButtonClass = "rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 relative";
  const menuIconButtonClass = "rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 md:hidden";

  return (
    <header className={`sticky top-0 z-30 border-b transition-all duration-300 ${headerBgClass}`}>
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <button onClick={onMenuClick} className={menuIconButtonClass} aria-label={t("ui_open_menu")}>
            <FiMenu className="h-5 w-5" />
          </button>
          <div className="hidden md:block">
            <h1 className={`text-sm font-medium transition-colors ${textPrimaryClass}`}>{t("welcome_back", { name: fullName.split(" ")[0] })}</h1>
            <p className={`text-[10px] transition-colors ${textSecondaryClass}`}>{department} {batch && `• ${batch}`}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          <NotificationBell iconClassName={iconButtonClass} />
          <Link to="/dashboard/profile" className={`hidden sm:block ${iconButtonClass}`} aria-label={t("ui_settings")}>
            <FiSettings className="h-5 w-5" />
          </Link>
          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-slate-50">
              <ProfilePicture src={profileImage} name={fullName} className="h-8 w-8 rounded-lg text-sm" />
              <span className={`hidden text-sm font-medium transition-colors md:block ${textPrimaryClass}`}>{fullName.split(" ")[0]}</span>
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                  <Link to="/dashboard/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50" onClick={() => setShowUserMenu(false)}>{t("ui_view_profile")}</Link>
                  <Link to="/dashboard/profile/edit" className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50" onClick={() => setShowUserMenu(false)}>{t("edit_profile")}</Link>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onLogout(); }}
                      className="mt-1 block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                    >
                      {t("logout")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardTopNav;
