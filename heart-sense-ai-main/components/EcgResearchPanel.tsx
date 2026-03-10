"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import type { SignalData, SignalSegment } from "@/lib/ecg-types";

// ─── Poincaré HRV Plot ────────────────────────────────────────────────────────

function PoincarePlot({ rrIntervals }: { rrIntervals: number[] }) {
  if (rrIntervals.length < 3) {
    return (
      <p className="text-muted-foreground text-xs text-center py-8">
        Need ≥ 3 RR intervals for a Poincaré plot (currently{" "}
        {rrIntervals.length}).
      </p>
    );
  }

  const W = 220;
  const H = 220;
  const PAD = 24;
  const MIN_RR = Math.max(200, Math.min(...rrIntervals) - 50);
  const MAX_RR = Math.min(1600, Math.max(...rrIntervals) + 50);
  const range = MAX_RR - MIN_RR || 1;

  const toX = (v: number) => PAD + ((v - MIN_RR) / range) * (W - PAD * 2);
  const toY = (v: number) => H - PAD - ((v - MIN_RR) / range) * (H - PAD * 2);

  const points = rrIntervals.slice(0, -1).map((rr, i) => ({
    x: toX(rr),
    y: toY(rrIntervals[i + 1]),
  }));

  // SD1/SD2 approximate from scatter
  const sd1 =
    Math.sqrt(
      points.reduce((s, p, i) => {
        const d = (rrIntervals[i + 1] - rrIntervals[i]) / Math.sqrt(2);
        return s + d * d;
      }, 0) / points.length,
    ) || 0;

  const identityY1 = toY(MIN_RR + (MIN_RR - MIN_RR));
  const identityY2 = toY(MAX_RR);

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <div className="bg-black/30 rounded-2xl border border-white/5 p-3">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
            {/* Grid */}
            {[0.25, 0.5, 0.75].map((t) => (
              <g key={t}>
                <line
                  x1={PAD}
                  y1={PAD + t * (H - PAD * 2)}
                  x2={W - PAD}
                  y2={PAD + t * (H - PAD * 2)}
                  stroke="#1f2937"
                  strokeWidth="0.75"
                />
                <line
                  x1={PAD + t * (W - PAD * 2)}
                  y1={PAD}
                  x2={PAD + t * (W - PAD * 2)}
                  y2={H - PAD}
                  stroke="#1f2937"
                  strokeWidth="0.75"
                />
              </g>
            ))}

            {/* Identity line (y = x) */}
            <line
              x1={PAD}
              y1={H - PAD}
              x2={W - PAD}
              y2={PAD}
              stroke="#374151"
              strokeWidth="1"
              strokeDasharray="3,3"
            />

            {/* RR scatter points */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="3"
                fill="hsl(230 80% 65%)"
                opacity="0.7"
              />
            ))}

            {/* Axis labels */}
            <text
              x={W / 2}
              y={H - 4}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="8"
            >
              RR[n] (ms)
            </text>
            <text
              x={8}
              y={H / 2}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="8"
              transform={`rotate(-90, 8, ${H / 2})`}
            >
              RR[n+1] (ms)
            </text>

            {/* Min/max axis tick labels */}
            <text
              x={PAD}
              y={H - PAD + 12}
              fill="#4b5563"
              fontSize="7"
              textAnchor="middle"
            >
              {Math.round(MIN_RR)}
            </text>
            <text
              x={W - PAD}
              y={H - PAD + 12}
              fill="#4b5563"
              fontSize="7"
              textAnchor="middle"
            >
              {Math.round(MAX_RR)}
            </text>
          </svg>
        </div>
      </div>

      <div className="flex gap-4 justify-center text-[8px] text-muted-foreground">
        <span>
          <span className="text-primary font-bold">{points.length}</span> points
        </span>
        <span>
          SD1 ≈{" "}
          <span className="text-primary font-bold">{sd1.toFixed(1)} ms</span>
        </span>
        <span>
          Mean RR:{" "}
          <span className="text-primary font-bold">
            {Math.round(
              rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length,
            )}{" "}
            ms
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── Beat Morphology Overlay ──────────────────────────────────────────────────

function BeatMorphologyOverlay({ segment }: { segment: SignalSegment }) {
  const HALF = 100; // ±100 samples around each R-peak (200ms at 500Hz)
  const W = 280;
  const H = 100;

  const { beats, avgBeat } = useMemo(() => {
    const validPeaks = segment.r_peaks.filter(
      (r) => r >= HALF && r + HALF < segment.signal.length,
    );
    const extracted = validPeaks.map((r) =>
      segment.signal.slice(r - HALF, r + HALF),
    );

    if (!extracted.length) return { beats: [], avgBeat: [] };

    const avg = extracted[0].map(
      (_, i) => extracted.reduce((s, b) => s + b[i], 0) / extracted.length,
    );
    return { beats: extracted, avgBeat: avg };
  }, [segment]);

  if (!beats.length) {
    return (
      <p className="text-muted-foreground text-xs text-center py-8">
        No valid beats found — need R-peaks with ≥{HALF} samples clearance on
        both sides.
      </p>
    );
  }

  const allVals = beats.flat();
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const toSVGPath = (beat: number[], opacity: number, color: string) => {
    const d = beat
      .map((v, i) => {
        const x = ((i / (beat.length - 1)) * W).toFixed(1);
        const y = (H - ((v - min) / range) * H * 0.9 - H * 0.05).toFixed(1);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    return (
      <path
        key={opacity + color}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="0.8"
        opacity={opacity}
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="bg-black/30 rounded-2xl border border-white/5 p-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
        >
          {/* Individual beats (grey, faint) */}
          {beats.map((beat, i) => toSVGPath(beat, 0.15, "#6b7280"))}
          {/* Average beat (bright) */}
          {toSVGPath(avgBeat, 1, "hsl(230 80% 65%)")}

          {/* Centre alignment line */}
          <line
            x1={W / 2}
            y1="0"
            x2={W / 2}
            y2={H}
            stroke="#1f2937"
            strokeWidth="1"
            strokeDasharray="2,4"
          />
        </svg>
      </div>
      <div className="flex items-center gap-4 text-[8px] text-muted-foreground px-1">
        <span>
          <span className="text-[#6b7280] font-bold">—</span> Individual beats (
          {beats.length})
        </span>
        <span>
          <span className="text-primary font-bold">—</span> Average QRS
        </span>
        <span className="ml-auto">
          Window: ±{HALF} samples (±
          {Math.round((HALF / segment.sampling_rate) * 1000)} ms)
        </span>
      </div>
    </div>
  );
}

// ─── Segment Comparison ───────────────────────────────────────────────────────

function SegmentComparison({ segments }: { segments: SignalSegment[] }) {
  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(Math.min(1, segments.length - 1));

  const segA = segments[idxA];
  const segB = segments[idxB];

  if (segments.length < 2) {
    return (
      <p className="text-muted-foreground text-xs text-center py-8">
        Upload at least 2 segments to compare.
      </p>
    );
  }

  const W = 360;
  const H = 90;

  const toPath = (seg: SignalSegment, color: string) => {
    const step = Math.max(1, Math.floor(seg.signal.length / 300));
    const s = seg.signal.filter((_, i) => i % step === 0);
    const min = Math.min(...s);
    const max = Math.max(...s);
    const range = max - min || 1;
    const d = s
      .map((v, i) => {
        const x = ((i / (s.length - 1)) * W).toFixed(1);
        const y = (H - ((v - min) / range) * H * 0.85 - H * 0.075).toFixed(1);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    return (
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" opacity="0.9" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Segment pickers */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <label className="text-[8px] font-bold uppercase tracking-widest text-primary">
            Segment A
          </label>
          <select
            value={idxA}
            onChange={(e) => setIdxA(Number(e.target.value))}
            className="w-full h-8 bg-card border border-border rounded-lg text-xs px-2 text-foreground"
          >
            {segments.map((s, i) => (
              <option key={i} value={i}>
                Seg {i + 1} · {s.leads.join(", ") || "Unassigned"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[8px] font-bold uppercase tracking-widest text-emerald-400">
            Segment B
          </label>
          <select
            value={idxB}
            onChange={(e) => setIdxB(Number(e.target.value))}
            className="w-full h-8 bg-card border border-border rounded-lg text-xs px-2 text-foreground"
          >
            {segments.map((s, i) => (
              <option key={i} value={i}>
                Seg {i + 1} · {s.leads.join(", ") || "Unassigned"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Overlaid comparison chart */}
      <div className="bg-black/30 rounded-2xl border border-white/5 p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
        >
          {toPath(segA, "hsl(230 80% 65%)")}
          {toPath(segB, "rgba(52,211,153,0.85)")}
        </svg>
      </div>
      <div className="flex items-center gap-4 text-[8px] text-muted-foreground px-1">
        <span>
          <span className="text-primary font-bold">—</span> Seg {idxA + 1}
          {segA.leads.length > 0 && ` (${segA.leads.join(",")})`}
        </span>
        <span>
          <span className="text-emerald-400 font-bold">—</span> Seg {idxB + 1}
          {segB.leads.length > 0 && ` (${segB.leads.join(",")})`}
        </span>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function CsvExport({ segments }: { segments: SignalSegment[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const downloadCSV = () => {
    const seg = segments[selectedIdx];
    const rSet = new Set(seg.r_peaks);
    const pSet = new Set(seg.p_peaks);
    const qSet = new Set(seg.q_peaks);
    const sSet = new Set(seg.s_peaks);
    const tSet = new Set(seg.t_peaks);

    const header = "time_ms,amplitude,r_peak,p_peak,q_peak,s_peak,t_peak";
    const rows = seg.signal.map((amp, i) => {
      const t = ((i / seg.sampling_rate) * 1000).toFixed(2);
      return `${t},${amp.toFixed(4)},${rSet.has(i)},${pSet.has(i)},${qSet.has(i)},${sSet.has(i)},${tSet.has(i)}`;
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecg_segment_${seg.segment_id + 1}_${seg.leads.join("-") || "unlabelled"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-48 space-y-1">
        <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
          Select Segment
        </label>
        <select
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          className="w-full h-8 bg-card border border-border rounded-lg text-xs px-2 text-foreground"
        >
          {segments.map((s, i) => (
            <option key={i} value={i}>
              Seg {i + 1} · {s.leads.join(", ") || "Unassigned"} ·{" "}
              {s.signal.length} samples
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[8px] text-muted-foreground/50 uppercase tracking-wider">
          Columns: time_ms, amplitude, r/p/q/s/t peaks
        </span>
        <Button
          onClick={downloadCSV}
          variant="outline"
          className="h-8 gap-2 rounded-xl text-xs font-bold border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </Button>
      </div>
    </div>
  );
}

// ─── Research Panel (Accordion) ───────────────────────────────────────────────

type PanelKey = "poincare" | "morphology" | "comparison" | "export";

const PANELS: { key: PanelKey; title: string; subtitle: string }[] = [
  {
    key: "poincare",
    title: "Poincaré HRV Plot",
    subtitle: "RR[n] vs RR[n+1] scatter — measures heart-rate variability",
  },
  {
    key: "morphology",
    title: "Beat Morphology Overlay",
    subtitle: "All QRS complexes aligned and stacked · average shown in blue",
  },
  {
    key: "comparison",
    title: "Segment Comparison",
    subtitle: "Overlay any two segments for visual diff",
  },
  {
    key: "export",
    title: "CSV Export",
    subtitle: "Download raw signal + peak annotations as CSV",
  },
];

/**
 * Research-grade tools panel with collapsible sections.
 * Does not modify any existing analysis flow.
 */
export function EcgResearchPanel({ data }: { data: SignalData }) {
  const [open, setOpen] = useState<PanelKey | null>(null);

  const successSegs = data.segments.filter((s) => s.status === "success");

  if (!successSegs.length) return null;

  const firstSeg = successSegs[0];

  const toggle = (key: PanelKey) =>
    setOpen((prev) => (prev === key ? null : key));

  return (
    <div className="rounded-[2.5rem] border border-white/5 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 py-5 border-b border-white/5">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Download className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Research Tools
          </p>
          <p className="text-[8px] text-muted-foreground/50 mt-0.5">
            HRV · Beat analysis · Comparison · Export
          </p>
        </div>
      </div>

      {/* Accordion sections */}
      <div className="divide-y divide-white/5">
        {PANELS.map(({ key, title, subtitle }) => (
          <div key={key}>
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-8 py-4 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <p className="text-xs font-bold text-foreground">{title}</p>
                <p className="text-[8px] text-muted-foreground mt-0.5">
                  {subtitle}
                </p>
              </div>
              {open === key ? (
                <ChevronUp className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {open === key && (
              <div className="px-8 pb-6">
                {key === "poincare" && (
                  <PoincarePlot rrIntervals={firstSeg.rr_intervals} />
                )}
                {key === "morphology" && (
                  <BeatMorphologyOverlay segment={firstSeg} />
                )}
                {key === "comparison" && (
                  <SegmentComparison segments={successSegs} />
                )}
                {key === "export" && <CsvExport segments={successSegs} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
