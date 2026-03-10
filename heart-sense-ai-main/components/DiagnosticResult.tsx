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
import { cn } from "@/lib/utils";
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

function formatBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-white font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="text-slate-200 italic">
        {part.slice(1, -1)}
      </em>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

type ReportBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

type ReportSection = {
  id: string;
  title: string;
  level: number;
  blocks: ReportBlock[];
};

type ParsedReport = {
  lead: ReportBlock[];
  sections: ReportSection[];
};

type SectionTone = {
  accent: string;
  iconWrap: string;
  icon: React.ReactNode;
  badge: string;
  card: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function normalizeHeading(value: string) {
  return value.replace(/^[^A-Za-z0-9]+/, "").trim();
}

function isDividerLine(value: string) {
  return /^[-*_]{3,}$/.test(value.trim());
}

function isMarkdownTableDivider(value: string) {
  return /^\|?\s*:?[-]+:?(\s*\|\s*:?[-]+:?)+\s*\|?$/.test(value.trim());
}

function isTableLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes("|")) return false;
  return trimmed.split("|").filter((cell) => cell.trim().length > 0).length >= 2;
}

function splitTableRow(value: string) {
  return value
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseTable(lines: string[]): ReportBlock {
  const headerLine = lines[0] ?? "";
  const hasDivider = lines[1] ? isMarkdownTableDivider(lines[1]) : false;
  const headers = splitTableRow(headerLine);
  const bodyLines = hasDivider ? lines.slice(2) : lines.slice(1);

  return {
    type: "table",
    headers,
    rows: bodyLines
      .map(splitTableRow)
      .filter((row) => row.some((cell) => cell.length > 0)),
  };
}

function parseReport(content: string): ParsedReport {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const lead: ReportBlock[] = [];
  const sections: ReportSection[] = [];
  let currentSection: ReportSection | null = null;
  let paragraphBuffer: string[] = [];

  const pushBlock = (block: ReportBlock) => {
    if (currentSection) {
      currentSection.blocks.push(block);
      return;
    }
    lead.push(block);
  };

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    pushBlock({
      type: "paragraph",
      text: paragraphBuffer.join(" ").replace(/\s+/g, " ").trim(),
    });
    paragraphBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (isDividerLine(line)) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const title = normalizeHeading(headingMatch[2]);
      currentSection = {
        id: `${slugify(title)}-${sections.length + 1}`,
        title,
        level: headingMatch[1].length,
        blocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (isTableLine(line) && lines[index + 1] && isMarkdownTableDivider(lines[index + 1])) {
      flushParagraph();
      const tableLines = [line, lines[index + 1].trim()];
      let nextIndex = index + 2;
      while (nextIndex < lines.length && isTableLine(lines[nextIndex] ?? "")) {
        tableLines.push(lines[nextIndex].trim());
        nextIndex += 1;
      }
      pushBlock(parseTable(tableLines));
      index = nextIndex - 1;
      continue;
    }

    const unorderedMatch = rawLine.match(/^\s*[*-]\s+(.+)$/);
    const orderedMatch = rawLine.match(/^\s*(\d+)\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      let nextIndex = index;

      while (nextIndex < lines.length) {
        const candidate = lines[nextIndex] ?? "";
        const unorderedCandidate = candidate.match(/^\s*[*-]\s+(.+)$/);
        const orderedCandidate = candidate.match(/^\s*(\d+)\.\s+(.+)$/);
        if (ordered && orderedCandidate) {
          items.push(orderedCandidate[2].trim());
          nextIndex += 1;
          continue;
        }
        if (!ordered && unorderedCandidate) {
          items.push(unorderedCandidate[1].trim());
          nextIndex += 1;
          continue;
        }
        break;
      }

      pushBlock({ type: "list", ordered, items });
      index = nextIndex - 1;
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return { lead, sections };
}

function getSectionTone(title: string): SectionTone {
  const normalized = title.toLowerCase();

  if (
    normalized.includes("urgent") ||
    normalized.includes("red flag") ||
    normalized.includes("concern")
  ) {
    return {
      accent: "text-rose-300",
      iconWrap: "bg-rose-500/10 text-rose-300 border border-rose-400/20",
      icon: <ShieldAlert className="h-4 w-4" />,
      badge: "bg-rose-500/10 text-rose-300 border-rose-400/20",
      card: "border-rose-500/20 bg-[linear-gradient(180deg,rgba(244,63,94,0.10),rgba(15,23,42,0.38))]",
    };
  }

  if (
    normalized.includes("workup") ||
    normalized.includes("investigation") ||
    normalized.includes("test")
  ) {
    return {
      accent: "text-sky-200",
      iconWrap: "bg-sky-500/10 text-sky-200 border border-sky-400/20",
      icon: <Timer className="h-4 w-4" />,
      badge: "bg-sky-500/10 text-sky-200 border-sky-400/20",
      card: "border-sky-500/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.10),rgba(15,23,42,0.38))]",
    };
  }

  if (normalized.includes("gap") || normalized.includes("limitation")) {
    return {
      accent: "text-amber-200",
      iconWrap: "bg-amber-500/10 text-amber-200 border border-amber-400/20",
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: "bg-amber-500/10 text-amber-200 border-amber-400/20",
      card: "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.10),rgba(15,23,42,0.38))]",
    };
  }

  if (
    normalized.includes("diagnostic") ||
    normalized.includes("summary") ||
    normalized.includes("differential") ||
    normalized.includes("findings")
  ) {
    return {
      accent: "text-emerald-200",
      iconWrap: "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20",
      icon: <BrainCircuit className="h-4 w-4" />,
      badge: "bg-emerald-500/10 text-emerald-200 border-emerald-400/20",
      card: "border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.10),rgba(15,23,42,0.38))]",
    };
  }

  return {
    accent: "text-slate-200",
    iconWrap: "bg-white/5 text-slate-200 border border-white/10",
    icon: <FileText className="h-4 w-4" />,
    badge: "bg-white/5 text-slate-300 border-white/10",
    card: "border-white/10 bg-[linear-gradient(180deg,rgba(148,163,184,0.08),rgba(15,23,42,0.36))]",
  };
}

function KeyValueLine({ text, tone }: { text: string; tone: SectionTone }) {
  const keyValueMatch = text.match(/^\*\*(.+?)\*\*:\s*(.+)$/);

  if (!keyValueMatch) {
    return (
      <p className="text-sm leading-7 text-slate-300/90">{formatBold(text)}</p>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3">
      <div className={cn("text-[10px] font-black uppercase tracking-[0.24em]", tone.accent)}>
        {keyValueMatch[1]}
      </div>
      <div className="mt-2 text-sm leading-7 text-slate-300/90">
        {formatBold(keyValueMatch[2])}
      </div>
    </div>
  );
}

function ReportList({ ordered, items, tone }: { ordered: boolean; items: string[]; tone: SectionTone }) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const keyValueMatch = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
        return (
          <div
            key={`${item}-${index}`}
            className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/25 px-4 py-3"
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                tone.iconWrap,
              )}
            >
              {ordered ? index + 1 : <ChevronRight className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              {keyValueMatch ? (
                <>
                  <div className={cn("text-[10px] font-black uppercase tracking-[0.24em]", tone.accent)}>
                    {keyValueMatch[1]}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-300/90">
                    {formatBold(keyValueMatch[2])}
                  </div>
                </>
              ) : (
                <div className="text-sm leading-7 text-slate-300/90">{formatBold(item)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportTable({ headers, rows, tone }: { headers: string[]; rows: string[][]; tone: SectionTone }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.04]">
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className={cn(
                  "px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] whitespace-nowrap",
                  tone.accent,
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/5 last:border-b-0">
              {headers.map((_, columnIndex) => (
                <td
                  key={columnIndex}
                  className="px-4 py-3 align-top text-sm leading-6 text-slate-300/90"
                >
                  {formatBold(row[columnIndex] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportBlockRenderer({ block, tone }: { block: ReportBlock; tone: SectionTone }) {
  if (block.type === "paragraph") {
    return <KeyValueLine text={block.text} tone={tone} />;
  }

  if (block.type === "list") {
    return <ReportList ordered={block.ordered} items={block.items} tone={tone} />;
  }

  return <ReportTable headers={block.headers} rows={block.rows} tone={tone} />;
}

function SectionFlow({ sections }: { sections: ReportSection[] }) {
  if (!sections.length) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.92))] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-200/80">
            Clinical Flow
          </p>
          <p className="mt-1 text-sm text-slate-300/80">
            ORA sections mapped into a quick-reading diagnostic sequence.
          </p>
        </div>
        <Badge className="border-sky-400/20 bg-sky-500/10 text-sky-200 text-[10px]">
          {sections.length} sections
        </Badge>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-3">
          {sections.map((section, index) => {
            const tone = getSectionTone(section.title);
            return (
              <div key={section.id} className="contents">
                <div className={cn("min-w-[200px] rounded-2xl border px-4 py-3", tone.card)}>
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone.iconWrap)}>
                      {tone.icon}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                        Step {index + 1}
                      </p>
                      <p className="mt-1 text-sm font-bold text-white">{section.title}</p>
                    </div>
                  </div>
                </div>
                {index < sections.length - 1 && (
                  <div className="flex items-center justify-center text-slate-500">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OraReportContent({
  content,
  experienceLevel,
}: {
  content: string;
  experienceLevel?: string;
}) {
  const parsed = parseReport(content);
  const normalizedSections = parsed.sections.length
    ? parsed.sections
    : [
        {
          id: "clinical-report",
          title: "Clinical Report",
          level: 1,
          blocks: parsed.lead,
        },
      ].filter((section) => section.blocks.length > 0);

  const leadTone = getSectionTone("Diagnostic Summary");
  const tableCount = normalizedSections.reduce(
    (count, section) => count + section.blocks.filter((block) => block.type === "table").length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-200/80">
              ORA Clinical Report
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
              Structured diagnostic review
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-300/80">
              The report is rendered from ORA&apos;s markdown-style output into section cards, clinical tables,
              and quick-scan flow blocks for easier bedside review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200 text-[10px] uppercase tracking-[0.22em]">
              {String(experienceLevel || "seasoned").toUpperCase()}
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-slate-200 text-[10px] uppercase tracking-[0.22em]">
              {normalizedSections.length} sections
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-slate-200 text-[10px] uppercase tracking-[0.22em]">
              {tableCount} tables
            </Badge>
          </div>
        </div>

        {parsed.lead.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {parsed.lead.map((block, index) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <ReportBlockRenderer block={block} tone={leadTone} />
              </div>
            ))}
          </div>
        )}
      </div>

      <SectionFlow sections={normalizedSections} />

      <div className="grid gap-4 xl:grid-cols-2">
        {normalizedSections.map((section) => {
          const tone = getSectionTone(section.title);
          return (
            <section key={section.id} className={cn("rounded-3xl border p-5", tone.card)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tone.iconWrap)}>
                    {tone.icon}
                  </div>
                  <div>
                    <p className={cn("text-[10px] font-black uppercase tracking-[0.3em]", tone.accent)}>
                      Section
                    </p>
                    <h4 className="mt-1 text-lg font-black text-white">{section.title}</h4>
                  </div>
                </div>
                <Badge className={cn("text-[10px] uppercase tracking-[0.22em]", tone.badge)}>
                  {section.blocks.length} blocks
                </Badge>
              </div>

              <div className="mt-5 space-y-4">
                {section.blocks.map((block, index) => (
                  <ReportBlockRenderer key={index} block={block} tone={tone} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function RawTextContent({ content }: { content: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
      <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-300/85">
        {content}
      </pre>
    </div>
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
                <OraReportContent
                  content={response.refined_output}
                  experienceLevel={response.experience_level}
                />
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
                <RawTextContent content={response.kra_raw} />
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
