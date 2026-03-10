"use client";

import { useMemo } from "react";
import type { SignalSegment } from "@/lib/ecg-types";

/** Standard hexaxial reference angles (degrees) for each limb lead.
 *  Convention: 0° = right (Lead I positive pole), +90° = inferior (aVF). */
const LEAD_AXES = [
  { lead: "I", angle: 0 },
  { lead: "II", angle: 60 },
  { lead: "III", angle: 120 },
  { lead: "aVR", angle: -150 },
  { lead: "aVL", angle: -30 },
  { lead: "aVF", angle: 90 },
] as const;

const CX = 110;
const CY = 110;
const R = 90;

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

function axisEnd(angle: number, r = R) {
  const rad = deg2rad(angle);
  return { x: CX + Math.cos(rad) * r, y: CY + Math.sin(rad) * r };
}

/** Mean signal deflection (signed mean amplitude → indicates axis direction) */
function signedMean(sig: number[]): number {
  if (!sig.length) return 0;
  return sig.reduce((a, b) => a + b, 0) / sig.length;
}

function axisCategoryLabel(deg: number): { label: string; color: string } {
  const n = ((deg % 360) + 360) % 360;
  if (n >= 0 && n <= 90)
    return { label: "Normal Axis", color: "rgba(34,197,94,0.9)" };
  if (n > 90 && n <= 180)
    return { label: "Right Axis Deviation", color: "rgba(251,191,36,0.9)" };
  if (n > 180 && n <= 270)
    return { label: "Left Axis Deviation", color: "rgba(251,191,36,0.9)" };
  return { label: "Extreme Axis", color: "rgba(239,68,68,0.9)" };
}

/**
 * Hexaxial cardiac axis reference diagram (SVG).
 * Calculates mean QRS axis from Lead I and aVF signal amplitudes.
 * Falls back to a 60° example if neither lead is uploaded.
 */
export function EcgAxisDiagram({ segments }: { segments: SignalSegment[] }) {
  const leadMap = useMemo(() => {
    const m = new Map<string, SignalSegment>();
    for (const seg of segments) for (const lead of seg.leads) m.set(lead, seg);
    return m;
  }, [segments]);

  const { axisAngle, hasData } = useMemo(() => {
    const segI = leadMap.get("I");
    const segAVF = leadMap.get("aVF");
    if (!segI && !segAVF) return { axisAngle: 60, hasData: false };

    const leadI_amp = segI ? signedMean(segI.signal) : 0;
    const aVF_amp = segAVF ? signedMean(segAVF.signal) : 0;

    // atan2(aVF, LeadI) → angle in ECG convention (y=down = +aVF direction)
    const rad = Math.atan2(aVF_amp, leadI_amp);
    const deg = (rad * 180) / Math.PI;
    return { axisAngle: deg, hasData: true };
  }, [leadMap]);

  const arrowEnd = axisEnd(axisAngle, R * 0.82);
  const arrowTipBackA = axisEnd(axisAngle + 140, 12);
  const arrowTipBackB = axisEnd(axisAngle - 140, 12);
  const { label: axisLabel, color: axisColor } = axisCategoryLabel(axisAngle);

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="bg-black/30 rounded-2xl border border-white/5 p-4">
          <svg viewBox="0 0 220 220" width={280} height={280}>
            {/* Outer reference circle */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="#1f2937"
              strokeWidth="1"
            />

            {/* Hexaxial axes */}
            {LEAD_AXES.map(({ lead, angle }) => {
              const pos = axisEnd(angle);
              const neg = axisEnd(angle + 180);
              const labelPos = axisEnd(angle, R + 14);
              const rad = deg2rad(angle);
              return (
                <g key={lead}>
                  {/* Negative half (dashed) */}
                  <line
                    x1={CX}
                    y1={CY}
                    x2={neg.x}
                    y2={neg.y}
                    stroke="#2d3748"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  {/* Positive half (solid) */}
                  <line
                    x1={CX}
                    y1={CY}
                    x2={pos.x}
                    y2={pos.y}
                    stroke="#374151"
                    strokeWidth="1.2"
                  />
                  {/* Label */}
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 3}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize="9"
                    fontWeight="600"
                  >
                    {lead}
                  </text>
                  {/* Small tick at positive pole */}
                  <circle cx={pos.x} cy={pos.y} r="2.5" fill="#4b5563" />
                </g>
              );
            })}

            {/* Center dot */}
            <circle cx={CX} cy={CY} r="3.5" fill="#4b5563" />

            {/* Mean electrical axis arrow */}
            <line
              x1={CX}
              y1={CY}
              x2={arrowEnd.x}
              y2={arrowEnd.y}
              stroke={axisColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <polygon
              points={`${arrowEnd.x},${arrowEnd.y} ${arrowTipBackA.x},${arrowTipBackA.y} ${arrowTipBackB.x},${arrowTipBackB.y}`}
              fill={axisColor}
            />
            {/* Angle label */}
            <text
              x={CX}
              y={CY + 120}
              textAnchor="middle"
              fill={axisColor}
              fontSize="10"
              fontWeight="700"
            >
              {Math.round(axisAngle)}°
            </text>
          </svg>
        </div>
      </div>

      {/* Status */}
      <div className="text-center space-y-1">
        <p className="text-sm font-bold" style={{ color: axisColor }}>
          {axisLabel}
        </p>
        <p className="text-[8px] text-muted-foreground">
          {hasData
            ? `Calculated from Lead I + aVF signal amplitudes · ${Math.round(axisAngle)}°`
            : "No Lead I or aVF segment uploaded — showing example 60° normal axis"}
        </p>
        <div className="text-[8px] text-muted-foreground/50 flex gap-3 justify-center">
          <span>Normal: 0° to +90°</span>
          <span>RAD: +90° to +180°</span>
          <span>LAD: −30° to −90°</span>
        </div>
      </div>
    </div>
  );
}
