"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  function MarkdownContent({ content }: { content: string }) {
    const blocks = parseContentBlocks(content);
    return (
      <div className="space-y-5">
        {blocks.map((block, i) => renderBlock(block, i))}
      </div>
    );
  }

  // ...existing code...
  // (The rest of the file remains as in the latest pulled version)
          </div>
        );
      })}
=======
function MarkdownContent({ content }: { content: string }) {
  const blocks = parseContentBlocks(content);
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => renderBlock(block, i))}
>>>>>>> 7b9dfe06a63751569b4850da87840c66b6ed0fca
    </div>
  );
}

<<<<<<< HEAD
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
=======
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
>>>>>>> 7b9dfe06a63751569b4850da87840c66b6ed0fca
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
