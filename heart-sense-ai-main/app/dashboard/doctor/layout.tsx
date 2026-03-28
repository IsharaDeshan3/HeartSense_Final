"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  Menu,
  Syringe,
} from "lucide-react";
import { useState } from "react";

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const toggleNavbar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden font-sans">
      {/* Sidebar */}
      <aside
        className={`border-r border-border/40 glass hidden lg:flex flex-col relative z-20 shrink-0 ${
          isCollapsed ? "w-20" : "w-72"
        }`}
      >
        <div className="p-6 flex items-center gap-4">
          <button
            onClick={toggleNavbar}
            className="h-8 w-8 rounded-full bg-primary/10 flex-center text-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!isCollapsed && (
            <span className="font-black tracking-tighter text-xl text-gradient">
              HEARTSENSE AI
            </span>
          )}
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
                {!isCollapsed && item.label}
              </Link>
            );
          })}
        </nav>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-y-auto bg-background">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-primary/10 rounded-full blur-[180px] -z-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] -z-10" />
        {children}
      </main>
    </div>
  );
}
