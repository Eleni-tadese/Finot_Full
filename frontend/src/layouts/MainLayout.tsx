import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/navigation/Navbar";
import Footer from "../components/navigation/Footer";

// Short pages (forms, receipts): the page fits the screen exactly, with no footer and no page scroll.
const COMPACT_PREFIXES = ["/login", "/register", "/forgot-password", "/password-reset", "/donate", "/donation"];

export default function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // The dashboard has its own layout (sidebar + top bar); every other page gets the site header.
  const isDashboard = pathname.startsWith("/dashboard");
  const isCompact = COMPACT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isDashboard) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-grow">
          <Outlet />
        </main>
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
        <div className="print:hidden">
          <Navbar solid />
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="print:hidden">
        <Navbar solid={!isHome} />
      </div>
      <main className="flex-grow">
        <Outlet />
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
