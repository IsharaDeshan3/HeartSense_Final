"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, RotateCcw } from "lucide-react";
import { UPlotChart, type UPlotOptions } from "./UPlotChart";
import type { SignalSegment } from "@/lib/ecg-types";

interface Annotation {
  timeMs: number;
  label: string;
}

/**
 * Renders the actual ECG signal waveform using uPlot with:
 *  - Real filtered signal from the backend
 *  - R-peak (red), P-wave (blue), T-wave (green) dot markers rendered as separate series
 *  - Click-to-annotate overlay (SVG vertical flags)
 *  - Zoom/pan natively via uPlot cursor
 */
export function EcgWaveformChart({ segment }: { segment: SignalSegment }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotating, setAnnotating] = useState(false);
  const plotRef = useRef<unknown>(null);

  const { signal, r_peaks, p_peaks, t_peaks, sampling_rate, leads } = segment;

  // Build series data — memoised so uPlot only re-renders when segment changes
  const chartData = useMemo<(number | null)[][]>(() => {
    const xMs = signal.map((_, i) => (i / sampling_rate) * 1000);

    const markerSeries = (peaks: number[]) => {
      const arr: (number | null)[] = new Array(signal.length).fill(null);
      for (const idx of peaks) {
        if (idx >= 0 && idx < signal.length) arr[idx] = signal[idx];
      }
      return arr;
    };

    return [
      xMs,
      signal,
      markerSeries(r_peaks),
      markerSeries(p_peaks),
      markerSeries(t_peaks),
    ] as (number | null)[][];
  }, [signal, r_peaks, p_peaks, t_peaks, sampling_rate]);

  const opts = useMemo<UPlotOptions>(
    () => ({
      height: 220,
      scales: { x: { time: false }, y: { auto: true } },
      cursor: { show: true, drag: { x: true, y: false } },
      legend: { show: false },
      axes: [
        {
          label: "Time (ms)",
          stroke: "#6b7280",
          grid: { stroke: "#1f293766", width: 1 },
          ticks: { stroke: "#374151" },
          font: "10px sans-serif",
          labelFont: "10px sans-serif",
        },
        {
          label: "Amplitude",
          stroke: "#6b7280",
          grid: { stroke: "#1f293766", width: 1 },
          ticks: { stroke: "#374151" },
          font: "10px sans-serif",
          labelFont: "10px sans-serif",
        },
      ],
      series: [
        {},
        {
          label: "ECG Signal",
          stroke: "hsl(230 80% 65%)",
          width: 1.5,
          spanGaps: false,
        },
        {
          label: "R-peak",
          stroke: "transparent",
          points: {
            show: true,
            size: 9,
            fill: "rgba(239,68,68,0.9)",
            width: 0,
          },
          spanGaps: false,
        },
        {
          label: "P-wave",
          stroke: "transparent",
          points: {
            show: true,
            size: 7,
            fill: "rgba(59,130,246,0.85)",
            width: 0,
          },
          spanGaps: false,
        },
        {
          label: "T-wave",
          stroke: "transparent",
          points: {
            show: true,
            size: 7,
            fill: "rgba(34,197,94,0.85)",
            width: 0,
          },
          spanGaps: false,
        },
      ],
      padding: [10, 16, 0, 0],
    }),
    [],
  );

  const handlePlotReady = useCallback((plot: unknown) => {
    plotRef.current = plot;
  }, []);

  // Add annotation on chart click when annotating mode is active
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotating || !plotRef.current) return;
    const plot = plotRef.current as {
      posToVal: (pos: number, axis: string) => number;
    };
    const rect = e.currentTarget.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const timeMs = plot.posToVal(cssX, "x");
    setAnnotations((prev) => [
      ...prev,
      { timeMs, label: `T=${Math.round(timeMs)}ms` },
    ]);
    setAnnotating(false);
  };

  // Convert annotation timeMs to CSS-pixel x position using the plot instance
  const getAnnotationX = (timeMs: number): number => {
    if (!plotRef.current) return 0;
    const plot = plotRef.current as {
      valToPos: (val: number, axis: string) => number;
    };
    return plot.valToPos(timeMs, "x");
  };

  return (
    <div className="space-y-3">
      {/* Legend + toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          <span className="text-[8px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            ● R-peak
          </span>
          <span className="text-[8px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
            ● P-wave
          </span>
          <span className="text-[8px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
            ● T-wave
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAnnotating((a) => !a)}
            className={`h-7 text-[9px] rounded-lg ${annotating ? "bg-primary/20 border-primary text-primary" : ""}`}
          >
            <Pencil className="h-3 w-3 mr-1" />
            {annotating ? "Click chart…" : "Annotate"}
          </Button>
          {annotations.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAnnotations([])}
              className="h-7 text-[9px] rounded-lg text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Chart + annotation overlay */}
      <div
        className={`relative rounded-2xl overflow-hidden bg-black/30 border border-white/5 ${annotating ? "cursor-crosshair" : ""}`}
        onClick={handleChartClick}
      >
        <UPlotChart
          data={chartData}
          opts={opts}
          onPlotReady={handlePlotReady}
        />

        {/* Annotation SVG flags */}
        {annotations.length > 0 && !!plotRef.current && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
          >
            {annotations.map((ann, i) => {
              const xPx = getAnnotationX(ann.timeMs);
              return (
                <g key={i}>
                  <line
                    x1={xPx}
                    y1={0}
                    x2={xPx}
                    y2="100%"
                    stroke="rgba(251,191,36,0.7)"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  <rect
                    x={xPx + 2}
                    y={8}
                    width={ann.label.length * 5.5 + 6}
                    height={14}
                    rx="3"
                    fill="rgba(251,191,36,0.15)"
                    stroke="rgba(251,191,36,0.5)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={xPx + 5}
                    y={19}
                    fill="rgba(251,191,36,0.95)"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {ann.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between text-[8px] text-muted-foreground px-1">
        <span>
          {annotations.length > 0
            ? `${annotations.length} annotation${annotations.length > 1 ? "s" : ""} · Click "Annotate" to add more`
            : `Click "Annotate" then click waveform to place a marker`}
        </span>
        <span>
          {signal.length} samples · {sampling_rate} Hz ·{" "}
          {leads.join(", ") || "Unassigned"}
        </span>
      </div>
    </div>
  );
}
