"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  LogOut,
  Menu,
  Pin,
  PinOff,
  Plus,
  X,
  Syringe,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  DEFAULT_SEVERITY_FILTERS,
  getPatientSeverity,
  getSeverityClasses,
  MONITOR_FILTERS_STORAGE_KEY,
  MONITOR_PINS_STORAGE_KEY,
  type SeverityFilterState,
  sortPatientsBySeverity,
  type DoctorPatientRecord,
} from "@/components/doctor/patientSeverity";

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
  {
    href: "/dashboard/doctor/monitoring",
    label: "Monitoring",
    icon: Activity,
  },
];

const MAX_SIDEBAR_MONITORED_PATIENTS = 6;

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isWorkspaceRoute = pathname.startsWith("/dashboard/doctor/workspace");
  const [isCollapsed, setIsCollapsed] = useState(isWorkspaceRoute);
  const [mounted, setMounted] = useState(false);
  const [allPatients, setAllPatients] = useState<DoctorPatientRecord[]>([]);
  const [pinnedPatientIds, setPinnedPatientIds] = useState<string[]>([]);
  const [severityFilters, setSeverityFilters] = useState<SeverityFilterState>(
    DEFAULT_SEVERITY_FILTERS,
  );

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out successfully");
      router.push("/");
    } catch {
      toast.error("Logout failed");
    }
  };

  useEffect(() => {
    setIsCollapsed(isWorkspaceRoute);
  }, [isWorkspaceRoute]);

  useEffect(() => {
    setMounted(true);

    try {
      const rawFilters = window.localStorage.getItem(
        MONITOR_FILTERS_STORAGE_KEY,
      );
      if (rawFilters) {
        const parsed = JSON.parse(rawFilters) as Partial<SeverityFilterState>;
        setSeverityFilters({
          critical: !!parsed.critical,
          high: !!parsed.high,
          moderate: !!parsed.moderate,
          stable: !!parsed.stable,
        } satisfies SeverityFilterState);
      }

      const rawPins = window.localStorage.getItem(MONITOR_PINS_STORAGE_KEY);
      if (rawPins) {
        const parsedPins = JSON.parse(rawPins) as string[];
        if (Array.isArray(parsedPins)) {
          setPinnedPatientIds(
            parsedPins.filter((item) => typeof item === "string"),
          );
        }
      }
    } catch {
      // Ignore malformed persisted preferences.
    }
  }, []);

  useEffect(() => {
    const fetchPriorityPatients = async () => {
      try {
        const response = await fetch("/api/doctor/patients");
        if (!response.ok) return;

        const data: DoctorPatientRecord[] = await response.json();
        setAllPatients(sortPatientsBySeverity(data));
      } catch {
        // Keep navigation usable even if patient feed is unavailable.
      }
    };

    fetchPriorityPatients();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(
      MONITOR_FILTERS_STORAGE_KEY,
      JSON.stringify(severityFilters),
    );
  }, [severityFilters, mounted]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(
      MONITOR_PINS_STORAGE_KEY,
      JSON.stringify(pinnedPatientIds),
    );
  }, [pinnedPatientIds, mounted]);

  const filteredPatients = useMemo(() => {
    return allPatients.filter((patient) => {
      const severity = getPatientSeverity(patient);
      return severityFilters[severity];
    });
  }, [allPatients, severityFilters]);

  const pinnedPatients = useMemo(() => {
    const patientMap = new Map(
      allPatients.map((patient) => [patient._id, patient]),
    );
    return pinnedPatientIds
      .map((id) => patientMap.get(id))
      .filter(Boolean) as DoctorPatientRecord[];
  }, [allPatients, pinnedPatientIds]);

  const priorityPatients = useMemo(() => {
    return filteredPatients
      .filter((patient) => !pinnedPatientIds.includes(patient._id))
      .slice(0, MAX_SIDEBAR_MONITORED_PATIENTS);
  }, [filteredPatients, pinnedPatientIds]);

  const hiddenPriorityCount = useMemo(() => {
    const remaining = filteredPatients.filter(
      (patient) => !pinnedPatientIds.includes(patient._id),
    );
    return Math.max(0, remaining.length - MAX_SIDEBAR_MONITORED_PATIENTS);
  }, [filteredPatients, pinnedPatientIds]);

  const toggleSeverityFilter = (
    severity: "critical" | "high" | "moderate" | "stable",
  ) => {
    setSeverityFilters((prev) => ({
      ...prev,
      [severity]: !prev[severity],
    }));
  };

  const togglePinPatient = (patientId: string) => {
    setPinnedPatientIds((prev) =>
      prev.includes(patientId)
        ? prev.filter((id) => id !== patientId)
        : [patientId, ...prev].slice(0, 8),
    );
  };

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

        <nav className="flex-1 px-6 space-y-2 mt-2 overflow-y-auto">
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

          <div className="pt-5 mt-4 border-t border-border/30 space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-foreground/70 px-2">
              Priority Monitoring
            </p>

            <div className="rounded-xl border border-border/30 p-2.5 space-y-2 bg-background/40">
              <label className="flex items-center gap-2 text-xs font-semibold text-rose-600">
                <input
                  type="checkbox"
                  checked={severityFilters.critical}
                  onChange={() => toggleSeverityFilter("critical")}
                  className="h-3.5 w-3.5"
                />
                Critical
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                <input
                  type="checkbox"
                  checked={severityFilters.high}
                  onChange={() => toggleSeverityFilter("high")}
                  className="h-3.5 w-3.5"
                />
                High
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                <input
                  type="checkbox"
                  checked={severityFilters.moderate}
                  onChange={() => toggleSeverityFilter("moderate")}
                  className="h-3.5 w-3.5"
                />
                Moderate
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <input
                  type="checkbox"
                  checked={severityFilters.stable}
                  onChange={() => toggleSeverityFilter("stable")}
                  className="h-3.5 w-3.5"
                />
                Stable
              </label>
            </div>

            {pinnedPatients.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-xs font-black uppercase tracking-wide text-foreground/70 px-2">
                  Pinned Patients
                </p>

                {pinnedPatients.map((patient) => {
                  const severityStyles = getSeverityClasses(
                    getPatientSeverity(patient),
                  );
                  const href = `/dashboard/doctor/patients/${patient._id}/history`;
                  const active = pathname === href;

                  return (
                    <div
                      key={`pinned-${patient._id}`}
                      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-primary/5"
                      }`}
                    >
                      <Link
                        href={href}
                        className="flex items-center gap-2 min-w-0 flex-1"
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${severityStyles.dot}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {patient.fullName}
                          </span>
                          <span className="block truncate text-xs text-foreground/65 uppercase tracking-wide">
                            {severityStyles.label}
                          </span>
                        </span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => togglePinPatient(patient._id)}
                        className="h-7 w-7 rounded-lg flex-center text-primary hover:bg-primary/10"
                        title="Unpin patient"
                      >
                        <PinOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {priorityPatients.length > 0 ? (
              <div className="space-y-1 pt-2">
                {priorityPatients.map((patient) => {
                  const severityStyles = getSeverityClasses(
                    getPatientSeverity(patient),
                  );
                  const href = `/dashboard/doctor/patients/${patient._id}/history`;
                  const active = pathname === href;

                  return (
                    <div
                      key={patient._id}
                      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-primary/5"
                      }`}
                    >
                      <Link
                        href={href}
                        className="flex items-center gap-2 min-w-0 flex-1"
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${severityStyles.dot}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {patient.fullName}
                          </span>
                          <span className="block truncate text-xs text-foreground/65 uppercase tracking-wide">
                            {severityStyles.label}
                          </span>
                        </span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => togglePinPatient(patient._id)}
                        className="h-7 w-7 rounded-lg flex-center text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        title="Pin patient"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-2">
                No patients match the selected severity filters.
              </p>
            )}

            {(hiddenPriorityCount > 0 || filteredPatients.length > 0) && (
              <Link
                href="/dashboard/doctor/monitoring"
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-border/40 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-colors"
              >
                {hiddenPriorityCount > 0
                  ? `View ${hiddenPriorityCount} More`
                  : "View All Monitored"}
              </Link>
            )}
          </div>
        </nav>

        <div className="px-6 pb-6 pt-4 border-t border-border/40 space-y-3">
          <Link
            href="/dashboard/doctor/new-case"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            New Case
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTheme("light")}
              className={`h-11 rounded-xl border text-sm font-bold transition-colors ${
                mounted && theme !== "dark"
                  ? "bg-amber-100/70 border-amber-300 text-amber-900 hover:bg-amber-100"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title="Switch to light mode"
            >
              Light
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => setTheme("dark")}
              className={`h-11 rounded-xl border text-sm font-bold transition-colors ${
                mounted && theme === "dark"
                  ? "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title="Switch to dark mode"
            >
              Dark
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="h-11 col-span-2 rounded-xl text-muted-foreground border-border/60 bg-background hover:bg-accent hover:text-accent-foreground transition-colors font-semibold"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
