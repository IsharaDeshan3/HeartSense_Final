"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  Menu,
  X,
  Syringe,
} from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  {
    href: "/dashboard/doctor",
    label: "Workspace",
    icon: Syringe,
    exact: true,
  },
  {
    href: "/dashboard/doctor/diagnostics",
    label: "ECG Analysis",
    icon: Activity,
  },
  {
    href: "/dashboard/doctor/lab-analysis",
    label: "Lab Analysis",
    icon: FlaskConical,
  },
];

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith("/dashboard/doctor/workspace");
  const [isCollapsed, setIsCollapsed] = useState(isWorkspaceRoute);

  useEffect(() => {
    setIsCollapsed(isWorkspaceRoute);
  }, [isWorkspaceRoute]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const toggleNavbar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden font-sans">
      {isCollapsed && (
        <button
          onClick={toggleNavbar}
          className="hidden lg:flex fixed top-4 left-4 z-50 h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-background/80 text-primary shadow-lg backdrop-blur-xl hover:bg-background"
          aria-label="Show navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`border-r border-border/40 glass hidden lg:flex flex-col relative z-20 shrink-0 overflow-hidden transition-all duration-300 ${
          isCollapsed
            ? "w-0 opacity-0 pointer-events-none border-r-0"
            : "w-72 opacity-100"
        }`}
      >
        <div className="p-6 flex items-center justify-between gap-4">
          <span className="font-black tracking-tighter text-xl text-gradient">
            HEARTSENSE AI
          </span>
          <button
            onClick={toggleNavbar}
            className="h-8 w-8 rounded-full bg-primary/10 flex-center text-primary"
            aria-label="Hide navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-6 space-y-2 mt-2">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-6 py-3 rounded-2xl font-bold transition-all ${
                  active
                    ? "bg-primary/10 text-primary font-black shadow-sm"
                    : "hover:bg-primary/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                  {item.label}
              </Link>
            );
          })}
        </nav>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
