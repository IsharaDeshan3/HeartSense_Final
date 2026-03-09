"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, GitBranch, LayoutGrid, Compass } from "lucide-react";
import { EcgWaveformChart } from "./EcgWaveformChart";
import { EcgVCGLoop } from "./EcgVCGLoop";
import { EcgLeadLayout } from "./EcgLeadLayout";
import { EcgAxisDiagram } from "./EcgAxisDiagram";
import type { SignalData, SignalSegment } from "@/lib/ecg-types";

interface EcgVisualizationHubProps {
  data: SignalData;
}

export function EcgVisualizationHub({ data }: EcgVisualizationHubProps) {
  const [activeTab, setActiveTab] = useState("waveform");
  const [selectedSegIdx, setSelectedSegIdx] = useState(0);

  const successfulSegs: SignalSegment[] = data.segments.filter(
    (s) => s.status === "success" || s.status === "partial",
  );

  if (successfulSegs.length === 0) {
    return (
      <div className="rounded-[2.5rem] border border-white/5 bg-card p-10 text-center text-muted-foreground text-sm">
        Signal data unavailable for visualisation — check that the ECG image is
        high-contrast and the Flask backend is running.
      </div>
    );
  }

  const activeSeg = successfulSegs[selectedSegIdx] ?? successfulSegs[0];

  return (
    <div className="rounded-[2.5rem] border border-white/5 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Research Visualization Hub
            </p>
            <p className="text-[8px] text-muted-foreground/50 mt-0.5">
              Interactive signal maps ·{" "}
              {successfulSegs.length === 12
                ? "12-lead ECG · all leads"
                : `${successfulSegs.length} segment${
                    successfulSegs.length > 1 ? "s" : ""
                  } loaded`}
            </p>
          </div>
        </div>

        {/* Segment selector — compact 4×3 grid for 12-lead, buttons for multi, hidden for single */}
        {successfulSegs.length === 12 ? (
          // 12-lead mode: standard anatomical grid layout
          <div className="grid grid-cols-4 gap-1">
            {successfulSegs.map((seg, i) => (
              <button
                key={seg.segment_id}
                onClick={() => setSelectedSegIdx(i)}
                className={`h-7 rounded-lg text-[9px] font-black border transition-all ${
                  i === selectedSegIdx
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                {seg.leads[0] ?? `S${i + 1}`}
              </button>
            ))}
          </div>
        ) : successfulSegs.length > 1 ? (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {successfulSegs.map((seg, i) => (
              <button
                key={seg.segment_id}
                onClick={() => setSelectedSegIdx(i)}
                className={`h-7 px-3 rounded-lg text-[9px] font-bold border transition-all ${
                  i === selectedSegIdx
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                Seg {i + 1}
                {seg.leads.length > 0 && (
                  <span className="ml-1 opacity-60">
                    {seg.leads.slice(0, 2).join(",")}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-8 pt-4 border-b border-white/5">
          <TabsList className="h-9 bg-secondary/50 rounded-xl p-0.5">
            <TabsTrigger
              value="waveform"
              className="h-8 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 px-3"
            >
              <Activity className="h-3 w-3" />
              Waveform
            </TabsTrigger>
            <TabsTrigger
              value="vcg"
              className="h-8 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 px-3"
            >
              <GitBranch className="h-3 w-3" />
              VCG Loop
            </TabsTrigger>
            <TabsTrigger
              value="layout"
              className="h-8 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 px-3"
            >
              <LayoutGrid className="h-3 w-3" />
              12-Lead Grid
            </TabsTrigger>
            <TabsTrigger
              value="axis"
              className="h-8 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 px-3"
            >
              <Compass className="h-3 w-3" />
              Cardiac Axis
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Waveform tab */}
        <TabsContent value="waveform" className="p-8 mt-0">
          <EcgWaveformChart segment={activeSeg} />
        </TabsContent>

        {/* VCG Loop tab */}
        <TabsContent value="vcg" className="p-8 mt-0">
          <EcgVCGLoop segments={successfulSegs} />
        </TabsContent>

        {/* 12-Lead Grid tab */}
        <TabsContent value="layout" className="p-8 mt-0">
          <EcgLeadLayout segments={successfulSegs} />
        </TabsContent>

        {/* Cardiac Axis tab */}
        <TabsContent value="axis" className="p-8 mt-0">
          <EcgAxisDiagram segments={successfulSegs} />
        </TabsContent>
      </Tabs>

      {/* Footer metadata */}
      <div className="px-8 py-4 border-t border-white/5 flex items-center gap-3 flex-wrap">
        <Badge
          variant="outline"
          className="text-[8px] border-primary/20 text-primary bg-primary/5"
        >
          {activeSeg.signal.length} samples
        </Badge>
        <Badge
          variant="outline"
          className="text-[8px] border-white/10 text-muted-foreground"
        >
          {activeSeg.sampling_rate} Hz
        </Badge>
        <Badge
          variant="outline"
          className="text-[8px] border-white/10 text-muted-foreground"
        >
          {activeSeg.r_peaks.length} R-peaks
        </Badge>
        {activeSeg.leads.length > 0 && (
          <Badge
            variant="outline"
            className="text-[8px] border-white/10 text-muted-foreground"
          >
            {activeSeg.leads.join(", ")}
          </Badge>
        )}
        <span className="ml-auto text-[8px] text-muted-foreground/40 uppercase tracking-widest">
          Deterministic · No AI
        </span>
      </div>
    </div>
  );
}
