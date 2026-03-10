"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { SignalSegment } from "@/lib/ecg-types";

const LEAD_PAIR_OPTIONS: [string, string][] = [
  ["I", "II"],
  ["I", "aVF"],
  ["V1", "V5"],
];

function normalize(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  return arr.map((v) => ((v - min) / range) * 2 - 1);
}

// SVG viewport is 200×200, center at (100, 100), radius 90
const toSVGX = (v: number) => 100 + v * 90;
const toSVGY = (v: number) => 100 + v * 90; // y-axis flipped via negation of signal

/**
 * Vectorcardiogram (VCG) loop — plots one lead's signal against another.
 * Requires two uploaded segments assigned to the chosen lead pair.
 * Animatable to trace the loop frame-by-frame.
 */
export function EcgVCGLoop({ segments }: { segments: SignalSegment[] }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1); // 0→1; 1 = full loop visible
  const [leadPair, setLeadPair] = useState<[string, string]>(["I", "II"]);
  const animRef = useRef<number | null>(null);

  // Find segments that carry the chosen leads (same segment may carry both)
  const segA = segments.find((s) => s.leads.includes(leadPair[0]));
  const segB = segments.find((s) => s.leads.includes(leadPair[1]));

  const { xNorm, yNorm, sampleCount } = useMemo(() => {
    if (!segA || !segB) return { xNorm: [], yNorm: [], sampleCount: 0 };
    const n = Math.min(segA.signal.length, segB.signal.length);
    return {
      xNorm: normalize(segA.signal.slice(0, n)),
      yNorm: normalize(segB.signal.slice(0, n)),
      sampleCount: n,
    };
  }, [segA, segB]);

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const TOTAL = 90;
    setProgress(0);

    const step = () => {
      frame++;
      setProgress(frame / TOTAL);
      if (frame < TOTAL) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setPlaying(false);
        setProgress(1);
      }
    };
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing]);

  const reset = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setPlaying(false);
    setProgress(1);
  };

  if (!segA || !segB) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium">VCG loop needs two lead signals</p>
          <p className="text-xs text-muted-foreground/60">
            Assign these lead pairs to your uploaded segments:
          </p>
          <div className="flex gap-2 justify-center">
            {LEAD_PAIR_OPTIONS.map((pair) => (
              <span
                key={pair.join("+")}
                className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono"
              >
                {pair[0]} + {pair[1]}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const endIdx = Math.max(2, Math.floor(sampleCount * progress));

  // Build SVG path from the slice
  const pathPoints = xNorm.slice(0, endIdx).map((x, i) => ({
    x: toSVGX(x),
    y: toSVGY(-yNorm[i]),
  }));
  const pathD =
    pathPoints.length > 0
      ? pathPoints
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
          )
          .join(" ")
      : "";

  const startX = toSVGX(xNorm[0]);
  const startY = toSVGY(-yNorm[0]);
  const curX = toSVGX(xNorm[endIdx - 1]);
  const curY = toSVGY(-yNorm[endIdx - 1]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {LEAD_PAIR_OPTIONS.map((pair) => (
            <button
              key={pair.join("+")}
              onClick={() => {
                setLeadPair(pair);
                reset();
              }}
              className={`text-[9px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                leadPair[0] === pair[0] && leadPair[1] === pair[1]
                  ? "bg-primary/20 border-primary text-primary"
                  : "border-white/10 text-muted-foreground hover:border-white/20"
              }`}
            >
              {pair[0]} vs {pair[1]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={reset}
            className="h-7 rounded-lg text-[9px]"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPlaying((p) => !p)}
            className="h-7 rounded-lg text-[9px] gap-1"
          >
            {playing ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {playing ? "Pause" : "Animate"}
          </Button>
        </div>
      </div>

      {/* VCG SVG */}
      <div className="flex justify-center">
        <div className="relative bg-black/30 rounded-2xl border border-white/5 p-4">
          <svg viewBox="0 0 200 200" width={260} height={260}>
            {/* Axis grid */}
            <line
              x1="100"
              y1="8"
              x2="100"
              y2="192"
              stroke="#1f2937"
              strokeWidth="1"
            />
            <line
              x1="8"
              y1="100"
              x2="192"
              y2="100"
              stroke="#1f2937"
              strokeWidth="1"
            />

            {/* Quadrant shading (normal axis) */}
            <rect
              x="100"
              y="100"
              width="90"
              height="90"
              fill="rgba(34,197,94,0.03)"
            />

            {/* Axis labels */}
            <text x="190" y="96" fill="#4b5563" fontSize="8" textAnchor="end">
              {leadPair[0]}+
            </text>
            <text x="12" y="96" fill="#4b5563" fontSize="8">
              {leadPair[0]}−
            </text>
            <text
              x="100"
              y="18"
              fill="#4b5563"
              fontSize="8"
              textAnchor="middle"
            >
              {leadPair[1]}−
            </text>
            <text
              x="100"
              y="196"
              fill="#4b5563"
              fontSize="8"
              textAnchor="middle"
            >
              {leadPair[1]}+
            </text>

            {/* Reference circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#1f2937"
              strokeWidth="0.5"
            />

            {/* VCG loop */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="hsl(230 80% 65%)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}

            {/* Start marker (green) */}
            <circle cx={startX} cy={startY} r="5" fill="rgba(34,197,94,0.9)" />

            {/* Current position marker (red) */}
            {endIdx > 2 && (
              <circle
                cx={curX}
                cy={curY}
                r="5"
                fill="rgba(239,68,68,0.9)"
                className={playing ? "animate-pulse" : ""}
              />
            )}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-[8px]">
            <span className="text-green-400">● Start</span>
            <span className="text-red-400">● Current</span>
          </div>
        </div>
      </div>

      <p className="text-[8px] text-muted-foreground text-center">
        Vectorcardiogram · Lead {leadPair[0]} (x) vs Lead {leadPair[1]} (y) ·{" "}
        {sampleCount} samples
        {segA === segB && (
          <span className="text-yellow-500/80 ml-1">
            · Same-segment projection — for true VCG, upload separate lead
            images
          </span>
        )}
      </p>
    </div>
  );
}
