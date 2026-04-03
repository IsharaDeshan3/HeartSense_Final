"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Database,
  GitCompare,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type TechnicalStep = {
  id: string;
  label: string;
  status: string;
  timestamp_utc?: string;
  output?: Record<string, unknown>;
};

type SessionPayload = {
  _id: string;
  patient_id?: string;
  session_id?: string;
  created_at?: string;
  analysis?: Record<string, unknown>;
  quality_control?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  session_technical_trace?: TechnicalStep[];
  finding_summary?: Record<string, unknown>;
};

export default function AdminEcgSessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [compareSessionId, setCompareSessionId] = useState("");
  const [compareData, setCompareData] = useState<SessionPayload | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/ecg/sessions/${encodeURIComponent(sessionId)}?projection=admin`,
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.message || data.error || "Failed to fetch session detail",
          );
        setSession(data.session || null);
      } catch (error: any) {
        toast.error("Could not load session detail", {
          description: error.message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [sessionId]);

  const steps = session?.session_technical_trace || [];
  const quality = session?.quality_control || {};
  const provenance = session?.provenance || {};
  const deterministic = ((session?.analysis as any)?.deterministic_metrics ||
    []) as Array<any>;
  const qcSegments = ((quality as any)?.segments || []) as Array<any>;

  const loadComparison = async () => {
    const targetId = compareSessionId.trim();
    if (!targetId) {
      toast.error("Enter a session id to compare");
      return;
    }

    setIsComparing(true);
    try {
      const res = await fetch(
        `/api/ecg/sessions/${encodeURIComponent(targetId)}?projection=admin`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || "Failed to load comparison session",
        );
      }
      setCompareData(data.session || null);
    } catch (error: any) {
      toast.error("Could not load comparison session", {
        description: error.message,
      });
    } finally {
      setIsComparing(false);
    }
  };

  const compareQuality = (compareData?.quality_control || {}) as any;
  const compareFinding = (compareData?.finding_summary || {}) as any;
  const currentFinding = (session?.finding_summary || {}) as any;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        title="ECG Session Technical Detail"
        badge="Admin Trace"
        badgeVariant="accent"
        stats={{ label: "SESSION", value: sessionId || "N/A" }}
        icon={<Workflow className="h-8 w-8" />}
      >
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/dashboard/admin/ecg-sessions">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sessions
          </Link>
        </Button>
      </DashboardHeader>

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading session trace...
          </div>
        ) : !session ? (
          <Card className="rounded-3xl border-white/10">
            <CardContent className="p-10 text-center text-muted-foreground">
              Session not found.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card className="rounded-3xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p>
                    <span className="text-muted-foreground">Patient:</span>{" "}
                    {session.patient_id || "N/A"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Session:</span>{" "}
                    {session.session_id || "N/A"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    {session.created_at
                      ? new Date(session.created_at).toLocaleString()
                      : "N/A"}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Quality
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p>
                    <span className="text-muted-foreground">Grade:</span>{" "}
                    {String((quality as any).overall_grade || "N/A")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Score:</span>{" "}
                    {String((quality as any).overall_score ?? "N/A")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    {String((quality as any).status || "N/A")}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4" /> Provenance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p>
                    <span className="text-muted-foreground">Pipeline:</span>{" "}
                    {String((provenance as any).pipeline_version || "N/A")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Model:</span>{" "}
                    {String((provenance as any).model_name || "N/A")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Prompt:</span>{" "}
                    {String((provenance as any).prompt_version || "N/A")}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl border-white/10">
              <CardHeader>
                <CardTitle className="text-sm">Session Step Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No technical trace found.
                  </p>
                ) : (
                  steps.map((step, idx) => (
                    <div
                      key={`${step.id}-${idx}`}
                      className="border border-white/10 rounded-2xl p-4 bg-card/60"
                    >
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-muted-foreground">
                            {step.id}
                          </p>
                          <p className="text-sm font-bold">{step.label}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="uppercase text-[10px]"
                        >
                          {step.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {step.timestamp_utc
                          ? new Date(step.timestamp_utc).toLocaleString()
                          : "No timestamp"}
                      </p>
                      <pre className="text-[11px] bg-black/20 rounded-xl p-3 overflow-auto border border-white/5">
                        {JSON.stringify(step.output || {}, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card className="rounded-3xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> QC Segment Scores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qcSegments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No per-segment QC metrics available.
                    </p>
                  ) : (
                    qcSegments.map((seg: any) => {
                      const score = Number(seg?.quality_score || 0);
                      const widthPct = Math.max(0, Math.min(100, score * 100));
                      return (
                        <div key={String(seg.segment_id)} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold">
                              Segment {seg.segment_id}
                            </span>
                            <span className="text-muted-foreground">
                              {score.toFixed(2)} ({seg.quality_grade || "n/a"})
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Deterministic Segment
                    Heart Rate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deterministic.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Deterministic metrics unavailable for this session.
                    </p>
                  ) : (
                    deterministic.map((item: any) => {
                      const hr = Number(item?.heart_rate_avg || 0);
                      const norm = Math.max(0, Math.min(100, (hr / 180) * 100));
                      return (
                        <div
                          key={String(item.segment_id)}
                          className="space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold">
                              Segment {item.segment_id}
                            </span>
                            <span className="text-muted-foreground">
                              {hr ? `${hr.toFixed(1)} bpm` : "N/A"}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${norm}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl border-white/10">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitCompare className="h-4 w-4" /> Session Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Enter another session id"
                    value={compareSessionId}
                    onChange={(e) => setCompareSessionId(e.target.value)}
                    className="rounded-xl"
                  />
                  <Button
                    onClick={loadComparison}
                    disabled={isComparing}
                    className="rounded-xl"
                  >
                    {isComparing ? "Loading..." : "Compare"}
                  </Button>
                </div>

                {!compareData ? (
                  <p className="text-sm text-muted-foreground">
                    Load another session to view key differences in diagnosis,
                    quality, and provenance.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="rounded-2xl border border-white/10 p-4 bg-card/60">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                        Current Session
                      </p>
                      <p>
                        <span className="text-muted-foreground">Session:</span>{" "}
                        {session?.session_id || "N/A"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">
                          Diagnosis:
                        </span>{" "}
                        {String(currentFinding?.primary_diagnosis || "N/A")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Quality:</span>{" "}
                        {String((quality as any).overall_score ?? "N/A")} (
                        {String((quality as any).overall_grade || "N/A")})
                      </p>
                      <p>
                        <span className="text-muted-foreground">Model:</span>{" "}
                        {String((provenance as any).model_name || "N/A")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 p-4 bg-card/60">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                        Compared Session
                      </p>
                      <p>
                        <span className="text-muted-foreground">Session:</span>{" "}
                        {compareData.session_id || "N/A"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">
                          Diagnosis:
                        </span>{" "}
                        {String(compareFinding?.primary_diagnosis || "N/A")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Quality:</span>{" "}
                        {String(compareQuality?.overall_score ?? "N/A")} (
                        {String(compareQuality?.overall_grade || "N/A")})
                      </p>
                      <p>
                        <span className="text-muted-foreground">Model:</span>{" "}
                        {String(
                          (compareData.provenance as any)?.model_name || "N/A",
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
