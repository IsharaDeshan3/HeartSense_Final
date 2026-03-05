"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  BrainCircuit,
  ShieldAlert,
  Timer,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AnalysisResponse,
  PipelineStep,
  RareCaseAlert,
} from "@/services/DiagnosticService";

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_STYLE: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  COMPLETED: {
    color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
    label: "Analysis Complete",
  },
  PARTIAL: {
    color: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    label: "Partial Result",
  },
  FAILED: {
    color: "bg-rose-500/10 border-rose-500/20 text-rose-400",
    icon: <XCircle className="h-5 w-5 text-rose-400" />,
    label: "Analysis Failed",
  },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBanner({
  status,
  durationMs,
}: {
  status: string;
  durationMs?: number;
}) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.FAILED;
  return (
    <div
      className={`flex items-center justify-between rounded-2xl border p-4 ${s.color}`}
    >
      <div className="flex items-center gap-3">
        {s.icon}
        <span className="font-bold text-sm uppercase tracking-wider">
          {s.label}
        </span>
      </div>
      {durationMs != null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          {(durationMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

function RareCaseAlertCard({ alert }: { alert: RareCaseAlert }) {
  if (!alert.triggered) return null;
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-rose-400" />
        <h3 className="font-black text-rose-400 text-sm uppercase tracking-wider">
          Rare Pathology Alert
        </h3>
        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 ml-auto text-[10px]">
          {(alert.similarity_score * 100).toFixed(0)}% match
        </Badge>
      </div>
      <p className="text-lg font-bold text-white">{alert.condition}</p>

      {alert.diseases.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Associated Diseases
          </p>
          <div className="flex flex-wrap gap-1.5">
            {alert.diseases.map((d, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-rose-500/20 text-rose-300 text-[9px]"
              >
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {alert.contradictions.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Contradictions / Cautions
          </p>
          <ul className="list-disc list-inside text-xs text-rose-300/80 space-y-1">
            {alert.contradictions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {alert.missing_data.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Missing Data Points
          </p>
          <ul className="list-disc list-inside text-xs text-amber-300/80 space-y-1">
            {alert.missing_data.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {alert.reasoning && (
        <div className="pt-2 border-t border-rose-500/10">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Reasoning
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {alert.reasoning}
          </p>
        </div>
      )}

      {alert.source_url && (
        <a
          href={alert.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-400 hover:underline uppercase tracking-widest"
        >
          View Source <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function PipelineTimeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const isOk = step.status === "success" || step.status === "ok";
        const isFail = step.status === "failed" || step.status === "error";
        return (
          <div
            key={i}
            className={`flex items-center gap-4 rounded-xl border p-3 ${
              isOk
                ? "border-emerald-500/10 bg-emerald-500/[0.02]"
                : isFail
                  ? "border-rose-500/10 bg-rose-500/[0.02]"
                  : "border-white/5 bg-white/[0.01]"
            }`}
          >
            <div
              className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                isOk
                  ? "bg-emerald-500/10 text-emerald-400"
                  : isFail
                    ? "bg-rose-500/10 text-rose-400"
                    : "bg-white/5 text-muted-foreground"
              }`}
            >
              {isOk ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isFail ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold capitalize">
                {step.step.replace(/_/g, " ")}
              </p>
            </div>
            {step.duration_ms != null && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {step.duration_ms}ms
              </span>
            )}
            <Badge
              className={`text-[8px] font-black uppercase tracking-widest ${
                isOk
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isFail
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : "bg-white/5 text-muted-foreground border-white/10"
              }`}
            >
              {step.status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown-ish renderer — handles headers, bold, lists, line breaks
  const lines = content.split("\n");
  return (
    <div className="prose prose-invert prose-sm max-w-none space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={i} />;
        if (trimmed.startsWith("### "))
          return (
            <h3 key={i} className="text-base font-black text-primary mt-6 mb-2">
              {trimmed.slice(4)}
            </h3>
          );
        if (trimmed.startsWith("## "))
          return (
            <h2 key={i} className="text-lg font-black text-white mt-6 mb-2">
              {trimmed.slice(3)}
            </h2>
          );
        if (trimmed.startsWith("# "))
          return (
            <h1 key={i} className="text-xl font-black text-white mt-6 mb-3">
              {trimmed.slice(2)}
            </h1>
          );
        if (trimmed.startsWith("- ") || trimmed.startsWith("* "))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <ChevronRight className="h-3 w-3 text-primary mt-1 shrink-0" />
              <span className="text-sm text-muted-foreground leading-relaxed">
                {formatBold(trimmed.slice(2))}
              </span>
            </div>
          );
        if (/^\d+\.\s/.test(trimmed))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-primary text-xs font-bold mt-0.5 shrink-0">
                {trimmed.match(/^\d+/)?.[0]}.
              </span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                {formatBold(trimmed.replace(/^\d+\.\s*/, ""))}
              </span>
            </div>
          );
        return (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
            {formatBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function formatBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-white font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface DiagnosticResultProps {
  response: AnalysisResponse;
}

export default function DiagnosticResult({ response }: DiagnosticResultProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <StatusBanner
        status={response.status}
        durationMs={response.total_duration_ms}
      />

      {response.rare_case_alert?.triggered && (
        <RareCaseAlertCard alert={response.rare_case_alert} />
      )}

      {response.error && response.status === "FAILED" && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6">
          <p className="text-sm text-rose-400 font-bold">{response.error}</p>
        </div>
      )}

      <Tabs defaultValue="primary" className="w-full">
        <TabsList className="h-12 bg-white/5 border border-white/5 rounded-xl p-1.5 gap-1.5">
          <TabsTrigger
            value="primary"
            className="flex items-center gap-2 rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <FileText className="h-3.5 w-3.5" /> Clinical Report
          </TabsTrigger>
          <TabsTrigger
            value="kra"
            className="flex items-center gap-2 rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <BrainCircuit className="h-3.5 w-3.5" /> KRA Analysis
          </TabsTrigger>
          <TabsTrigger
            value="pipeline"
            className="flex items-center gap-2 rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Timer className="h-3.5 w-3.5" /> Pipeline Steps
          </TabsTrigger>
        </TabsList>

        {/* ORA Clinical Report */}
        <TabsContent value="primary" className="mt-6">
          <Card className="border-white/5 bg-white/[0.02] rounded-2xl">
            <CardContent className="p-8 space-y-6">
              {response.refined_output ? (
                <MarkdownContent content={response.refined_output} />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No clinical report was generated.
                </p>
              )}

              {response.disclaimer && (
                <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/80 leading-relaxed">
                    {response.disclaimer}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* KRA Raw Analysis */}
        <TabsContent value="kra" className="mt-6">
          <Card className="border-white/5 bg-white/[0.02] rounded-2xl">
            <CardContent className="p-8">
              {response.kra_raw ? (
                <MarkdownContent content={response.kra_raw} />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No KRA raw output available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Steps */}
        <TabsContent value="pipeline" className="mt-6">
          <Card className="border-white/5 bg-white/[0.02] rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Pipeline Execution
                </h3>
                <Badge className="bg-white/5 text-muted-foreground border-white/10 text-[9px]">
                  Session: {response.session_id.slice(0, 8)}…
                </Badge>
              </div>
              <PipelineTimeline steps={response.processing_steps} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
