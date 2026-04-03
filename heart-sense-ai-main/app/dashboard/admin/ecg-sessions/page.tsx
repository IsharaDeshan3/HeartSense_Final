"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Search, ShieldCheck } from "lucide-react";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SessionRow = {
  record_id: string;
  session_id?: string;
  patient_id?: string;
  created_at?: string;
  finding_summary?: {
    rhythm_type?: string;
    heart_rate?: number;
    severity?: string;
  };
  quality?: string;
  status?: string;
};

export default function AdminEcgSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/ecg/sessions?projection=admin&limit=200");
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.message || data.error || "Failed to fetch sessions",
          );
        setSessions(data.sessions || []);
      } catch (error: any) {
        toast.error("Could not load ECG sessions", {
          description: error.message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;

    return sessions.filter((s) => {
      const patient = (s.patient_id || "").toLowerCase();
      const session = (s.session_id || "").toLowerCase();
      const rhythm = (s.finding_summary?.rhythm_type || "").toLowerCase();
      return patient.includes(q) || session.includes(q) || rhythm.includes(q);
    });
  }, [sessions, query]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        title="ECG Technical Sessions"
        badge="Admin Research View"
        badgeVariant="accent"
        stats={{ label: "TRACE READY", value: `${sessions.length} SESSIONS` }}
        icon={<Activity className="h-8 w-8" />}
      />

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="relative max-w-xl">
          <Search className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 h-12 rounded-2xl"
            placeholder="Search by patient, session, or rhythm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading ECG sessions...
          </div>
        ) : filtered.length === 0 ? (
          <Card className="rounded-3xl border-white/10">
            <CardContent className="p-10 text-center text-muted-foreground">
              No ECG sessions found for current filters.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((session) => (
              <Card
                key={session.record_id}
                className="rounded-3xl border-white/10 bg-card/70"
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                        Session
                      </p>
                      <p className="text-sm font-black text-foreground break-all">
                        {session.session_id || "unspecified-session"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-widest border-primary/30 text-primary"
                    >
                      {session.quality || "n/a"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground uppercase tracking-widest">
                        Patient
                      </p>
                      <p className="font-semibold">
                        {session.patient_id || "Unknown"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground uppercase tracking-widest">
                        Rhythm
                      </p>
                      <p className="font-semibold">
                        {session.finding_summary?.rhythm_type || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground uppercase tracking-widest">
                        Heart Rate
                      </p>
                      <p className="font-semibold">
                        {session.finding_summary?.heart_rate ?? "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground uppercase tracking-widest">
                        Severity
                      </p>
                      <p className="font-semibold">
                        {session.finding_summary?.severity || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-[11px] text-muted-foreground">
                      {session.created_at
                        ? new Date(session.created_at).toLocaleString()
                        : "No timestamp"}
                    </div>
                    <Button asChild size="sm" className="rounded-xl">
                      <Link
                        href={`/dashboard/admin/ecg-sessions/${encodeURIComponent(session.session_id || "unknown")}`}
                      >
                        Technical Detail{" "}
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
