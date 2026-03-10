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
  FlaskConical,
  Stethoscope,
  Lightbulb,
  TriangleAlert,
  ShieldCheck,
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
  const blocks = parseContentBlocks(content);
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

// ─── Block parser ────────────────────────────────────────────────────────────

type Block =
  | { type: "BLANK" }
  | { type: "HEADING"; level: number; text: string }
  | { type: "EMOJI_SECTION"; emoji: string; title: string }
  | { type: "TABLE"; rows: string[][] }
  | { type: "LABEL_VALUE"; label: string; value: string }
  | { type: "LIST"; ordered: boolean; items: string[] }
  | { type: "PARAGRAPH"; text: string }
  | { type: "DISCLAIMER"; text: string };

const SECTION_EMOJI_RE =
  /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}⚠️⚡🔍🩺])/u;

function isTableRow(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}
function isSeparatorRow(row: string[]) {
  return row.every((c) => /^:?-+:?$/.test(c.trim()));
}
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function parseContentBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank
    if (!trimmed) {
      blocks.push({ type: "BLANK" });
      i++;
      continue;
    }

    // Markdown table — collect all consecutive table rows
    if (isTableRow(trimmed)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = tableLines.map(splitTableRow);
      // Remove separator rows
      const clean = parsed.filter((r) => !isSeparatorRow(r));
      if (clean.length > 0) blocks.push({ type: "TABLE", rows: clean });
      continue;
    }

    // Disclaimer line
    if (
      trimmed.toLowerCase().startsWith("⚠️ disclaimer") ||
      trimmed.toLowerCase().startsWith("disclaimer:")
    ) {
      const text = trimmed
        .replace(/^⚠️\s*/i, "")
        .replace(/^disclaimer:?\s*/i, "")
        .replace(/\*+/g, "")
        .trim();
      blocks.push({ type: "DISCLAIMER", text });
      i++;
      continue;
    }

    // Emoji section header (e.g. "🩺 DIFFERENTIAL DIAGNOSIS")
    const emojiMatch = trimmed.match(SECTION_EMOJI_RE);
    if (emojiMatch && trimmed.length < 100) {
      const emoji = emojiMatch[1];
      const title = trimmed.replace(emoji, "").trim();
      blocks.push({ type: "EMOJI_SECTION", emoji, title });
      i++;
      continue;
    }

    // ATX headings
    if (/^#{1,4}\s/.test(trimmed)) {
      const m = trimmed.match(/^(#+)\s+(.*)/)!;
      blocks.push({ type: "HEADING", level: m[1].length, text: m[2] });
      i++;
      continue;
    }

    // Label: Value  (e.g. "Missing Data Point: ...")
    if (
      trimmed.includes(":") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*")
    ) {
      const colonIdx = trimmed.indexOf(":");
      const label = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (label.length <= 40 && value.length > 0) {
        blocks.push({ type: "LABEL_VALUE", label, value });
        i++;
        continue;
      }
    }

    // List items — collect consecutive bullets/numbers
    if (
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      /^\d+\.\s/.test(trimmed)
    ) {
      const ordered = /^\d+\./.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith("- ") || t.startsWith("* ") || /^\d+\.\s/.test(t)) {
          items.push(t.replace(/^[-*]\s|^\d+\.\s/, ""));
          i++;
        } else break;
      }
      blocks.push({ type: "LIST", ordered, items });
      continue;
    }

    // Fallback paragraph
    blocks.push({ type: "PARAGRAPH", text: trimmed });
    i++;
  }

  return blocks;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function SeverityBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const cls =
    v === "CRITICAL" || v === "HIGH" || v === "SEVERE"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : v === "MODERATE"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : v === "LOW" || v === "MILD" || v === "NORMAL"
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-white/5 text-muted-foreground border-white/10";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${cls}`}
    >
      {value}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: string }) {
  const num = parseFloat(value);
  let cls = "bg-white/5 text-muted-foreground border-white/10";
  let display = value;
  if (!isNaN(num)) {
    const pct = num <= 1 ? num : num / 100;
    display = `${Math.round(pct * 100)}%`;
    cls =
      pct >= 0.7
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        : pct >= 0.4
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-rose-500/15 text-rose-400 border-rose-500/30";
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-black ${cls}`}
    >
      {display}
    </span>
  );
}

function PriorityBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const cls =
    v === "STAT"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : v === "URGENT"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${cls}`}
    >
      {value}
    </span>
  );
}

function smartCell(header: string, value: string) {
  const h = header.toLowerCase();
  if (h === "severity") return <SeverityBadge value={value} />;
  if (h === "confidence") return <ConfidenceBadge value={value} />;
  if (h === "priority") return <PriorityBadge value={value} />;
  if (h === "rank")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">
        {value}
      </span>
    );
  return (
    <span className="text-xs text-foreground/90">{formatBold(value)}</span>
  );
}

// ─── Section icon map ─────────────────────────────────────────────────────────

function sectionIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("differential")) return <Stethoscope className="h-4 w-4" />;
  if (t.includes("workup") || t.includes("investigation"))
    return <FlaskConical className="h-4 w-4" />;
  if (t.includes("gap") || t.includes("limit"))
    return <TriangleAlert className="h-4 w-4" />;
  if (t.includes("clinical") || t.includes("evidence"))
    return <Lightbulb className="h-4 w-4" />;
  if (t.includes("disclaimer")) return <ShieldCheck className="h-4 w-4" />;
  return <ChevronRight className="h-4 w-4" />;
}

function sectionColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("differential"))
    return "border-primary/20 bg-primary/5 text-primary";
  if (t.includes("workup") || t.includes("investigation"))
    return "border-blue-500/20 bg-blue-500/5 text-blue-400";
  if (t.includes("gap") || t.includes("limit"))
    return "border-amber-500/20 bg-amber-500/5 text-amber-400";
  if (t.includes("disclaimer"))
    return "border-amber-500/20 bg-amber-500/5 text-amber-400";
  return "border-white/10 bg-white/[0.02] text-muted-foreground";
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case "BLANK":
      return null;

    case "EMOJI_SECTION": {
      const colorCls = sectionColor(block.title);
      const icon = sectionIcon(block.title);
      return (
        <div
          key={key}
          className={`flex items-center gap-3 rounded-xl border px-5 py-3 mt-6 mb-1 ${colorCls}`}
        >
          {icon}
          <span className="text-sm font-black uppercase tracking-wider">
            {block.title}
          </span>
        </div>
      );
    }

    case "HEADING": {
      const sizes = ["", "text-xl", "text-lg", "text-base", "text-sm"];
      return (
        <p
          key={key}
          className={`${sizes[block.level] ?? "text-sm"} font-black text-white mt-4 mb-1`}
        >
          {block.text}
        </p>
      );
    }

    case "TABLE": {
      if (block.rows.length < 2) return null;
      const headers = block.rows[0];
      const dataRows = block.rows.slice(1);
      return (
        <div
          key={key}
          className="overflow-x-auto rounded-2xl border border-white/5 mt-2"
        >
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {headers.map((h, ci) => (
                  <th
                    key={ci}
                    className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.015] transition-colors"
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-3 align-top">
                      {smartCell(headers[ci] ?? "", cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "LABEL_VALUE":
      return (
        <div key={key} className="flex flex-wrap gap-2 items-baseline">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            {block.label}
          </span>
          <span className="text-sm text-muted-foreground leading-relaxed">
            {formatBold(block.value)}
          </span>
        </div>
      );

    case "LIST":
      return (
        <ul key={key} className="space-y-1.5 pl-1">
          {block.items.map((item, ii) => (
            <li key={ii} className="flex gap-2.5">
              {block.ordered ? (
                <span className="shrink-0 h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-black flex items-center justify-center mt-0.5">
                  {ii + 1}
                </span>
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />
              )}
              <span className="text-sm text-muted-foreground leading-relaxed">
                {formatBold(item)}
              </span>
            </li>
          ))}
        </ul>
      );

    case "PARAGRAPH":
      return (
        <p key={key} className="text-sm text-muted-foreground leading-relaxed">
          {formatBold(block.text)}
        </p>
      );

    case "DISCLAIMER":
      return (
        <div
          key={key}
          className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4"
        >
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            {block.text}
          </p>
        </div>
      );

    default:
      return null;
  }
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
