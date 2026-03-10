"use client";

import { useMemo } from "react";
import type { SignalSegment } from "@/lib/ecg-types";

// Standard 12-lead clinical layout (4 columns × 3 rows)
const LEAD_GRID: string[][] = [
  ["I", "aVR", "V1", "V4"],
  ["II", "aVL", "V2", "V5"],
  ["III", "aVF", "V3", "V6"],
];

/** Generates a compact SVG path string from a signal array.
 *  Down-samples to at most maxPts points for performance in mini-charts. */
function miniPath(
  signal: number[],
  w: number,
  h: number,
  maxPts = 180,
): string {
  if (!signal.length) return "";
  const step = Math.max(1, Math.floor(signal.length / maxPts));
  const sampled: number[] = [];
  for (let i = 0; i < signal.length; i += step) sampled.push(signal[i]);

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  return sampled
    .map((v, i) => {
      const x = ((i / (sampled.length - 1)) * w).toFixed(1);
      const y = (h - ((v - min) / range) * (h * 0.85) - h * 0.075).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

/**
 * Displays all 12 ECG leads in the standard clinical 4×3 paper layout.
 * Leads with uploaded signal data show a mini-waveform; unrecorded leads
 * show a greyed placeholder.
 */
export function EcgLeadLayout({ segments }: { segments: SignalSegment[] }) {
  // Build a map: lead name → SignalSegment
  const leadMap = useMemo(() => {
    const map = new Map<string, SignalSegment>();
    for (const seg of segments) {
      for (const lead of seg.leads) map.set(lead, seg);
    }
    return map;
  }, [segments]);

  const CELL_W = 120;
  const CELL_H = 48;

  return (
    <div className="space-y-4">
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest px-1">
        Standard 12-lead layout — shaded cells have recorded signal data
      </p>

      <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
        {LEAD_GRID.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className={`grid grid-cols-4 ${rowIdx < LEAD_GRID.length - 1 ? "border-b border-white/5" : ""}`}
          >
            {row.map((lead, colIdx) => {
              const seg = leadMap.get(lead);
              return (
                <div
                  key={lead}
                  className={`relative p-2 ${colIdx < row.length - 1 ? "border-r border-white/5" : ""} ${seg ? "bg-primary/[0.03]" : "opacity-40"}`}
                >
                  {/* Lead label */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider ${seg ? "text-primary" : "text-muted-foreground/50"}`}
                    >
                      {lead}
                    </span>
                    {seg && (
                      <span className="text-[7px] text-muted-foreground/40 font-mono">
                        {seg.r_peaks.length} peaks
                      </span>
                    )}
                  </div>

                  {/* Mini waveform or placeholder */}
                  <svg
                    viewBox={`0 0 ${CELL_W} ${CELL_H}`}
                    width="100%"
                    height={CELL_H}
                    preserveAspectRatio="none"
                    className="block"
                  >
                    {/* ECG grid lines */}
                    {[0.25, 0.5, 0.75].map((t) => (
                      <line
                        key={t}
                        x1={0}
                        y1={t * CELL_H}
                        x2={CELL_W}
                        y2={t * CELL_H}
                        stroke="#1f293740"
                        strokeWidth="0.5"
                      />
                    ))}

                    {seg ? (
                      <path
                        d={miniPath(seg.signal, CELL_W, CELL_H)}
                        fill="none"
                        stroke="hsl(230 80% 65%)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <>
                        <line
                          x1={0}
                          y1={CELL_H / 2}
                          x2={CELL_W}
                          y2={CELL_H / 2}
                          stroke="#374151"
                          strokeWidth="0.75"
                          strokeDasharray="3,4"
                        />
                        <text
                          x={CELL_W / 2}
                          y={CELL_H / 2 + 3}
                          textAnchor="middle"
                          fill="#374151"
                          fontSize="7"
                        >
                          No Signal
                        </text>
                      </>
                    )}
                  </svg>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[8px] text-muted-foreground px-1">
        {leadMap.size} / 12 leads recorded ·{" "}
        {12 - leadMap.size > 0
          ? `Upload segments assigned to missing leads for a complete picture`
          : "All 12 leads present"}
      </p>
    </div>
  );
}
