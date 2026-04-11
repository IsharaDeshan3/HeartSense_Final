"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pin, PinOff, Search, ShieldAlert } from "lucide-react";

import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_SEVERITY_FILTERS,
  getPatientSeverity,
  getSeverityClasses,
  MONITOR_FILTERS_STORAGE_KEY,
  MONITOR_PINS_STORAGE_KEY,
  sortPatientsBySeverity,
  type DoctorPatientRecord,
  type SeverityFilterState,
} from "@/components/doctor/patientSeverity";

const PAGE_SIZE = 12;

export default function DoctorMonitoringPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [patients, setPatients] = useState<DoctorPatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pinnedPatientIds, setPinnedPatientIds] = useState<string[]>([]);
  const [severityFilters, setSeverityFilters] = useState<SeverityFilterState>(
    DEFAULT_SEVERITY_FILTERS,
  );

  useEffect(() => {
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
        });
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
      // Keep default filters if local data is malformed.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      MONITOR_FILTERS_STORAGE_KEY,
      JSON.stringify(severityFilters),
    );
  }, [severityFilters]);

  useEffect(() => {
    window.localStorage.setItem(
      MONITOR_PINS_STORAGE_KEY,
      JSON.stringify(pinnedPatientIds),
    );
  }, [pinnedPatientIds]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [profRes, patientRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/doctor/patients"),
        ]);

        if (profRes.ok) {
          setCurrentUser(await profRes.json());
        }

        if (patientRes.ok) {
          const data: DoctorPatientRecord[] = await patientRes.json();
          setPatients(sortPatientsBySeverity(data));
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredPatients = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    const base = patients.filter((patient) => {
      const severity = getPatientSeverity(patient);
      if (!severityFilters[severity]) return false;

      if (!lowered) return true;
      return (
        patient.fullName?.toLowerCase().includes(lowered) ||
        patient.patientId?.toLowerCase().includes(lowered)
      );
    });

    const pinned = base.filter((patient) =>
      pinnedPatientIds.includes(patient._id),
    );
    const unpinned = base.filter(
      (patient) => !pinnedPatientIds.includes(patient._id),
    );
    return [...pinned, ...unpinned];
  }, [patients, pinnedPatientIds, query, severityFilters]);

  const pagedPatients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredPatients.slice(start, start + PAGE_SIZE);
  }, [filteredPatients, page]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPatients.length / PAGE_SIZE),
  );

  useEffect(() => {
    setPage(1);
  }, [query, severityFilters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleSeverityFilter = (severity: keyof SeverityFilterState) => {
    setSeverityFilters((prev) => ({ ...prev, [severity]: !prev[severity] }));
  };

  const togglePinPatient = (patientId: string) => {
    setPinnedPatientIds((prev) =>
      prev.includes(patientId)
        ? prev.filter((id) => id !== patientId)
        : [patientId, ...prev].slice(0, 20),
    );
  };

  return (
    <>
      <DashboardHeader
        title="Priority Monitoring"
        doctorName={currentUser?.fullName ?? ""}
        showSessionControls={false}
      />

      <div className="p-8 md:p-12 flex-1 overflow-y-auto space-y-6">
        <Card className="glass border-border/40 rounded-4xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              Monitoring Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search monitored patients by name or ID"
                className="pl-11 h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-rose-600">
                <input
                  type="checkbox"
                  checked={severityFilters.critical}
                  onChange={() => toggleSeverityFilter("critical")}
                  className="h-4 w-4"
                />
                Critical
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                <input
                  type="checkbox"
                  checked={severityFilters.high}
                  onChange={() => toggleSeverityFilter("high")}
                  className="h-4 w-4"
                />
                High
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                <input
                  type="checkbox"
                  checked={severityFilters.moderate}
                  onChange={() => toggleSeverityFilter("moderate")}
                  className="h-4 w-4"
                />
                Moderate
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <input
                  type="checkbox"
                  checked={severityFilters.stable}
                  onChange={() => toggleSeverityFilter("stable")}
                  className="h-4 w-4"
                />
                Stable
              </label>
            </div>

            <p className="text-sm text-foreground/75">
              Showing {filteredPatients.length} monitored patient
              {filteredPatients.length === 1 ? "" : "s"}.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="h-72 flex-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
          </div>
        ) : pagedPatients.length > 0 ? (
          <div className="space-y-3">
            {pagedPatients.map((patient) => {
              const severity = getPatientSeverity(patient);
              const styles = getSeverityClasses(severity);
              const isPinned = pinnedPatientIds.includes(patient._id);

              return (
                <div
                  key={patient._id}
                  className="glass border border-border/40 rounded-2xl p-4 flex items-center gap-3"
                >
                  <span className={`h-3 w-3 rounded-full ${styles.dot}`} />

                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      router.push(
                        `/dashboard/doctor/patients/${patient._id}/history`,
                      )
                    }
                  >
                    <p className="text-sm font-bold truncate">
                      {patient.fullName}
                    </p>
                    <p className="text-xs text-foreground/70 uppercase tracking-wide truncate">
                      {patient.patientId} • {styles.label}
                    </p>
                  </button>

                  <Button
                    type="button"
                    variant={isPinned ? "default" : "outline"}
                    className="h-9 rounded-xl"
                    onClick={() => togglePinPatient(patient._id)}
                  >
                    {isPinned ? (
                      <>
                        <PinOff className="h-4 w-4 mr-2" /> Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="h-4 w-4 mr-2" /> Pin
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass border border-border/30 rounded-4xl p-12 text-center">
            <ShieldAlert className="h-10 w-10 mx-auto text-primary/40 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">
              No patients match the selected filters.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground/70">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
