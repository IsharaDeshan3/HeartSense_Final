"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Heart,
  Info,
  MessageCircle,
  RotateCcw,
  Stethoscope,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DoctorEcgChat } from "./DoctorEcgChat";
import { EcgAxisDiagram } from "./EcgAxisDiagram";
import type { SignalData } from "@/lib/ecg-types";

export interface EcgAnalysisData {
  rhythm_analysis: {
    heart_rate: number;
    rhythm_type: string;
    regularity: string;
  };
  abnormalities: {
    abnormalities: string[];
    severity: string;
    affected_leads: string[];
  };
  diagnosis: {
    primary_diagnosis: string;
    differential_diagnoses: string[];
    recommendations: string[];
    urgency: string;
  };
  full_interpretation?: string;
  source?: string;
  model?: string;
  quality_indicator?: {
    overall_score?: number;
    overall_grade?: string;
    status?: string;
  };
  quality_control?: {
    overall_score?: number;
    overall_grade?: string;
    status?: string;
  };
  traceability?: {
    pipeline_version?: string;
    model_name?: string;
  };
  provenance?: {
    pipeline_version?: string;
    model_name?: string;
  };
  deterministic_metrics?:
    | {
        heart_rate_avg?: number;
        peak_count?: number;
        hrv?: number;
        status?: string;
        segment_id?: number;
      }
    | Array<{
        heart_rate_avg?: number;
        peak_count?: number;
        hrv?: number;
        status?: string;
        segment_id?: number;
      }>;
}

export interface EcgSegmentView {
  id: string;
  url: string;
  leads: string[];
  quality: "optimal" | "suboptimal";
}

interface EcgAnalysisResultProps {
  analysis: EcgAnalysisData;
  patientId?: string;
  sessionId?: string;
  patientContext?: string;
  signalData?: SignalData;
  segments?: EcgSegmentView[];
  activeViewSegment?: number;
  onActiveViewSegmentChange?: (idx: number) => void;
}

export function EcgAnalysisResult({
  analysis,
  patientId,
  sessionId,
  patientContext,
  signalData,
  segments = [],
  activeViewSegment = 0,
  onActiveViewSegmentChange,
}: EcgAnalysisResultProps) {
  const { rhythm_analysis, abnormalities, diagnosis } = analysis;
  const qualityView = analysis.quality_indicator || analysis.quality_control;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [chatOpen, setChatOpen] = useState(false);
  const [leadBadgesOpen, setLeadBadgesOpen] = useState(true);
  const [findingBadgesOpen, setFindingBadgesOpen] = useState(true);
  const [recommendationBadgesOpen, setRecommendationBadgesOpen] =
    useState(false);
  const [activeLead, setActiveLead] = useState<string | null>(null);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [activeRecommendation, setActiveRecommendation] = useState<
    string | null
  >(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChatOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const getSeverityStyles = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
      case "severe":
        return "bg-destructive/10 text-destructive border-destructive/20 glow-destructive";
      case "moderate":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "mild":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case "emergent":
      case "urgent":
        return <Zap className="h-4 w-4 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const singleSegment = segments.length <= 1;
  const currentSeg = segments[activeViewSegment];
  const allLeads = Array.from(
    new Set([
      ...(abnormalities.affected_leads || []),
      ...((currentSeg?.leads || []) as string[]),
    ]),
  );

  const inferLeadsFromText = (text: string) => {
    const lower = text.toLowerCase();
    return allLeads.filter((lead) => lower.includes(lead.toLowerCase()));
  };

  const highlightedLeads = new Set(
    activeLead
      ? [activeLead]
      : activeFinding
        ? inferLeadsFromText(activeFinding)
        : [],
  );
  const hasLeadFocus = highlightedLeads.size > 0;
  const focusLabel = activeLead
    ? `Focused Lead: ${activeLead}`
    : activeFinding
      ? `Focused Finding: ${activeFinding}`
      : activeRecommendation
        ? `Focused Recommendation: ${activeRecommendation}`
        : null;

  const selectLead = (lead: string) => {
    setActiveLead((prev) => (prev === lead ? null : lead));
    setActiveFinding(null);
    setActiveRecommendation(null);
  };

  const selectFinding = (finding: string) => {
    setActiveFinding((prev) => (prev === finding ? null : finding));
    setActiveLead(null);
    setActiveRecommendation(null);
  };

  const selectRecommendation = (recommendation: string) => {
    setActiveRecommendation((prev) =>
      prev === recommendation ? null : recommendation,
    );
    setActiveLead(null);
    setActiveFinding(null);
  };

  const clearFocus = () => {
    setActiveLead(null);
    setActiveFinding(null);
    setActiveRecommendation(null);
  };

  const axisSegments = (signalData?.segments || []).filter(
    (s) => s.status === "success" || s.status === "partial",
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      <div
        className={`grid grid-cols-1 lg:grid-cols-4 gap-6 ${chatOpen ? "lg:hidden" : ""}`}
      >
        <Card className="relative overflow-hidden lg:col-span-4 rounded-[2.75rem] border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.45)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-accent/60 to-emerald-400/60" />
          <CardContent className="p-6 md:p-8 lg:p-9">
            <div className="flex items-start gap-5 lg:gap-6">
              <div className="hidden sm:flex h-16 w-16 rounded-3xl bg-primary/10 ring-1 ring-primary/10 items-center justify-center text-primary shadow-sm shrink-0">
                <Heart className="h-8 w-8" />
              </div>
              <div className="flex-1 min-w-0 space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 lg:gap-5 items-start">
                  <div className="min-w-0 space-y-5">
                    <div>
                      <p className="text-[10px] lg:text-xs font-black uppercase tracking-[0.36em] text-muted-foreground/80 mb-2">
                        ECG Overview
                      </p>
                      <h2 className="text-3xl lg:text-4xl xl:text-5xl font-black tracking-tight text-foreground/90 leading-[1.05] max-w-4xl">
                        {diagnosis.primary_diagnosis}
                      </h2>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Badge
                          variant="outline"
                          className={`px-4 py-1.5 rounded-full font-bold uppercase text-xs tracking-widest ${getSeverityStyles(abnormalities.severity)}`}
                        >
                          {abnormalities.severity}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="px-4 py-1.5 rounded-full font-bold uppercase text-xs tracking-widest flex gap-2 items-center bg-secondary text-muted-foreground border border-border"
                        >
                          {getUrgencyIcon(diagnosis.urgency)}
                          {diagnosis.urgency}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
                      <div className="text-center p-4 rounded-3xl bg-background/60 border border-white/8 shadow-sm backdrop-blur-sm">
                        <p className="text-[10px] lg:text-xs font-black text-muted-foreground uppercase tracking-[0.24em] mb-2">
                          Heart Rate
                        </p>
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-3xl lg:text-4xl font-black text-primary leading-none">
                            {rhythm_analysis.heart_rate}
                          </span>
                          <span className="text-xs lg:text-sm font-bold text-primary/45">
                            BPM
                          </span>
                        </div>
                      </div>
                      <div className="text-center p-4 rounded-3xl bg-background/60 border border-white/8 shadow-sm backdrop-blur-sm">
                        <p className="text-[10px] lg:text-xs font-black text-muted-foreground uppercase tracking-[0.24em] mb-2">
                          Rhythm
                        </p>
                        <p className="text-sm lg:text-base xl:text-lg font-black text-foreground/80 leading-snug">
                          {rhythm_analysis.rhythm_type}
                        </p>
                      </div>
                      <div className="text-center p-4 rounded-3xl bg-background/60 border border-white/8 shadow-sm backdrop-blur-sm">
                        <p className="text-[10px] lg:text-xs font-black text-muted-foreground uppercase tracking-[0.24em] mb-2">
                          Regularity
                        </p>
                        <p className="text-sm lg:text-base xl:text-lg font-black capitalize text-foreground/80 leading-snug">
                          {rhythm_analysis.regularity.replace("_", " ")}
                        </p>
                      </div>
                      <div className="text-center p-4 rounded-3xl bg-background/60 border border-white/8 shadow-sm backdrop-blur-sm">
                        <p className="text-[10px] lg:text-xs font-black text-muted-foreground uppercase tracking-[0.24em] mb-2">
                          Quality
                        </p>
                        <p className="text-sm lg:text-base xl:text-lg font-black text-foreground/80 leading-snug">
                          {qualityView?.overall_grade || "-"}
                        </p>
                      </div>
                    </div>

                    {abnormalities.affected_leads.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[10px] lg:text-xs font-black uppercase tracking-[0.32em] text-muted-foreground/80 mb-3">
                          Affected Leads
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {abnormalities.affected_leads.map((lead) => (
                            <button
                              key={lead}
                              type="button"
                              onClick={() => selectLead(lead)}
                              aria-pressed={activeLead === lead}
                              className={`px-3 py-1.5 rounded-full font-bold uppercase text-[10px] tracking-[0.22em] transition-all border ${
                                highlightedLeads.has(lead)
                                  ? "bg-accent text-accent-foreground border-accent shadow-sm"
                                  : hasLeadFocus
                                    ? "bg-white/5 text-muted-foreground border-white/10"
                                    : "bg-accent/5 text-accent border-accent/20"
                              }`}
                            >
                              {lead}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/60 backdrop-blur-sm p-4 lg:p-5 h-fit">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-3">
                      Cardiac Axis
                    </p>
                    {axisSegments.length > 0 ? (
                      <div>
                        <EcgAxisDiagram segments={axisSegments} />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-background/70 px-3 py-3">
                        <p className="text-sm font-semibold text-muted-foreground">
                          Axis visualization unavailable for this case.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {segments.length > 0 && (
          <div
            className={`glass rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col ${
              chatOpen
                ? "lg:fixed lg:left-4 lg:top-4 lg:bottom-4 lg:right-[440px] lg:z-20"
                : "lg:col-span-5"
            }`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    {singleSegment
                      ? "ECG Recording"
                      : `Segment ${activeViewSegment + 1} / ${segments.length}`}
                  </span>
                  {currentSeg?.leads?.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {currentSeg.leads.map((l) => (
                        <span
                          key={l}
                          className={`text-[7px] font-black uppercase tracking-widest px-1 py-0 rounded border transition-all ${
                            highlightedLeads.has(l)
                              ? "bg-primary text-primary-foreground border-primary shadow shadow-primary/30"
                              : hasLeadFocus
                                ? "bg-primary/5 text-primary/40 border-primary/10"
                                : "bg-primary/10 text-primary border-primary/10"
                          }`}
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  className="h-7 w-7 rounded-lg hover:bg-white/10"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[9px] font-black text-muted-foreground w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  className="h-7 w-7 rounded-lg hover:bg-white/10"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomReset}
                  className="h-7 w-7 rounded-lg hover:bg-white/10"
                  title="Reset"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                {chatOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatOpen(false)}
                    className="hidden lg:inline-flex h-7 rounded-lg text-[10px] font-black uppercase tracking-wider"
                    title="Back to findings"
                  >
                    Results
                  </Button>
                )}
                {currentSeg && (
                  <span
                    className={`h-5 px-2 rounded-full text-[7px] font-black uppercase tracking-widest border flex items-center ${
                      currentSeg.quality === "optimal"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {currentSeg.quality === "optimal" ? "Research" : "Sub-opt"}
                  </span>
                )}
                {focusLabel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFocus}
                    className="hidden lg:inline-flex h-7 rounded-lg text-[10px] font-black uppercase tracking-wider border-primary/20 text-primary"
                    title="Clear focused ECG context"
                  >
                    {focusLabel}
                  </Button>
                )}
              </div>
            </div>

            <div
              className="relative bg-black overflow-hidden select-none"
              style={{
                height: chatOpen
                  ? "calc(100vh - 9.5rem)"
                  : singleSegment
                    ? "560px"
                    : "420px",
                cursor: zoom > 1 ? "grab" : "default",
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(#f00 1px, transparent 1px), linear-gradient(90deg, #f00 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              {currentSeg && (
                <img
                  src={currentSeg.url}
                  alt={`ECG Segment ${activeViewSegment + 1}`}
                  className="w-full h-full object-contain transition-transform duration-200 pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  }}
                  draggable={false}
                />
              )}

              {chatOpen && (
                <div
                  className="absolute top-3 left-3 z-20 w-[min(380px,72%)] rounded-2xl border border-white/15 bg-black/55 backdrop-blur-md text-white shadow-xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                      ECG Focus Assistant
                    </p>
                    <button
                      type="button"
                      onClick={clearFocus}
                      className="text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
                    <div className="rounded-xl border border-white/10 bg-white/5">
                      <button
                        type="button"
                        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-left"
                        onClick={() => setLeadBadgesOpen((v) => !v)}
                        aria-expanded={leadBadgesOpen}
                      >
                        <span>Leads ({allLeads.length})</span>
                        {leadBadgesOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {leadBadgesOpen && (
                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                          {allLeads.map((lead) => (
                            <button
                              key={lead}
                              type="button"
                              className={`px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${
                                activeLead === lead
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white/5 text-white/80 border-white/20 hover:bg-white/10"
                              }`}
                              aria-pressed={activeLead === lead}
                              onClick={() => selectLead(lead)}
                            >
                              {lead}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5">
                      <button
                        type="button"
                        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-left"
                        onClick={() => setFindingBadgesOpen((v) => !v)}
                        aria-expanded={findingBadgesOpen}
                      >
                        <span>
                          Findings ({abnormalities.abnormalities.length})
                        </span>
                        {findingBadgesOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {findingBadgesOpen && (
                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                          {abnormalities.abnormalities
                            .slice(0, 8)
                            .map((finding, idx) => (
                              <button
                                key={`${finding}-${idx}`}
                                type="button"
                                className={`px-2 py-1 rounded-full border text-[10px] font-semibold transition-all ${
                                  activeFinding === finding
                                    ? "bg-accent text-accent-foreground border-accent"
                                    : "bg-white/5 text-white/85 border-white/20 hover:bg-white/10"
                                }`}
                                aria-pressed={activeFinding === finding}
                                onClick={() => selectFinding(finding)}
                              >
                                {finding}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5">
                      <button
                        type="button"
                        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-left"
                        onClick={() => setRecommendationBadgesOpen((v) => !v)}
                        aria-expanded={recommendationBadgesOpen}
                      >
                        <span>
                          Recommendations ({diagnosis.recommendations.length})
                        </span>
                        {recommendationBadgesOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {recommendationBadgesOpen && (
                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                          {diagnosis.recommendations
                            .slice(0, 6)
                            .map((item, idx) => (
                              <button
                                key={`${item}-${idx}`}
                                type="button"
                                className={`px-2 py-1 rounded-full border text-[10px] font-semibold transition-all ${
                                  activeRecommendation === item
                                    ? "bg-emerald-500 text-white border-emerald-400"
                                    : "bg-white/5 text-white/85 border-white/20 hover:bg-white/10"
                                }`}
                                aria-pressed={activeRecommendation === item}
                                onClick={() => selectRecommendation(item)}
                              >
                                Rec {idx + 1}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {chatOpen &&
                (activeLead || activeFinding || activeRecommendation) && (
                  <div className="absolute left-3 bottom-3 z-20 rounded-xl border border-primary/30 bg-primary/20 backdrop-blur px-3 py-2 max-w-[75%]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-primary-foreground/90">
                      Focused Context
                    </p>
                    <p className="text-xs text-white/90 mt-0.5 line-clamp-2">
                      {activeLead || activeFinding || activeRecommendation}
                    </p>
                  </div>
                )}
            </div>

            {!singleSegment && (
              <div className="border-t border-white/5 p-3">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {segments.map((seg, i) => (
                    <button
                      key={seg.id}
                      onClick={() => {
                        onActiveViewSegmentChange?.(i);
                        setZoom(1);
                        setPan({ x: 0, y: 0 });
                      }}
                      className={`relative shrink-0 h-16 w-24 rounded-xl overflow-hidden border-2 transition-all ${
                        activeViewSegment === i
                          ? "border-primary shadow-lg shadow-primary/20 scale-105"
                          : "border-white/10 opacity-50 hover:opacity-80"
                      }`}
                    >
                      <img
                        src={seg.url}
                        alt={`seg ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5">
                        <p className="text-[6px] font-black text-white/80 uppercase truncate">
                          {seg.leads.length > 0
                            ? seg.leads.join(", ")
                            : `Seg ${i + 1}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className={`space-y-6 animate-in fade-in zoom-in-95 duration-1000 ${
            chatOpen ? "lg:hidden" : "lg:col-span-7"
          }`}
        >
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="text-xl lg:text-2xl font-black uppercase tracking-tight text-foreground/90">
                Waveform Findings
              </h3>
            </div>

            <Button
              type="button"
              variant="outline"
              className="lg:hidden rounded-full"
              onClick={() => setChatOpen((v) => !v)}
              aria-expanded={chatOpen}
              aria-label={
                chatOpen
                  ? "Hide clinical discussion"
                  : "Open clinical discussion"
              }
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              {chatOpen ? "Hide Chat" : "Open Chat"}
            </Button>
          </div>

          {abnormalities.abnormalities.length > 0 &&
          diagnosis.recommendations.length > 0 ? (
            <Card className="glass border-white/5 rounded-4xl">
              <CardHeader>
                <CardTitle className="text-base lg:text-lg font-bold uppercase tracking-[0.2em] text-primary">
                  Finding and Recommendation Matrix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[170px] border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                          Waveform Finding
                        </th>
                        <th className="text-left py-3 px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                          Recommendation
                        </th>
                        <th className="text-left py-3 px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground w-40">
                          Severity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {abnormalities.abnormalities.map((finding, idx) => {
                        const recommendation =
                          diagnosis.recommendations[idx] ||
                          diagnosis.recommendations[
                            diagnosis.recommendations.length - 1
                          ];

                        return (
                          <tr
                            key={`${finding}-${idx}`}
                            className="border-b border-white/5 align-top"
                          >
                            <td className="py-3 px-3 text-sm lg:text-base font-semibold text-foreground/90">
                              {finding}
                            </td>
                            <td className="py-3 px-3 text-sm lg:text-base text-foreground/80 leading-relaxed">
                              {recommendation}
                            </td>
                            <td className="py-3 px-3">
                              <Badge
                                variant="outline"
                                className={`px-3 py-1 rounded-full font-bold uppercase text-[10px] tracking-wider ${getSeverityStyles(abnormalities.severity)}`}
                              >
                                {abnormalities.severity}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="p-8 rounded-2xl bg-green-500/5 border border-green-500/20 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-foreground/80">
                No abnormalities detected
              </p>
              <p className="text-base text-muted-foreground mt-2">
                ECG trace shows normal cardiac activity
              </p>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-2xl opacity-40 text-[8px] font-black uppercase tracking-[0.3em]">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-2.5 w-2.5" />
              <span>{analysis.source || "FLASK-ENGINE"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{analysis.model || "SYNTHESIS v1.2"}</span>
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </div>

        {chatOpen && (
          <div className="lg:hidden">
            <DoctorEcgChat
              analysisData={analysis}
              patientId={patientId}
              sessionId={sessionId}
              patientContext={patientContext}
              className="min-h-[520px]"
              autoFocusInput
            />
          </div>
        )}
      </div>

      {diagnosis.differential_diagnoses?.length > 0 && (
        <Card className="glass border-white/5 rounded-4xl">
          <CardHeader>
            <CardTitle className="text-base lg:text-lg font-bold uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
              <Info className="h-5 w-5" /> Differential Considerations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {diagnosis.differential_diagnoses.map((diff, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10"
                >
                  <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-base text-foreground/75 font-medium leading-snug">
                    {diff}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        className="hidden lg:flex fixed right-3 top-1/2 -translate-y-1/2 z-40 items-center gap-2 rounded-l-2xl rounded-r-md border border-border bg-card px-3 py-3 shadow-lg hover:bg-secondary transition-colors"
        aria-expanded={chatOpen}
        aria-label={
          chatOpen ? "Collapse clinical discussion" : "Open clinical discussion"
        }
      >
        <MessageCircle className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Chat</span>
        {chatOpen ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      <aside
        className={`hidden lg:block fixed top-4 right-4 bottom-4 z-30 w-[420px] max-w-[calc(100vw-2rem)] transition-transform duration-300 ${
          chatOpen ? "translate-x-0" : "translate-x-[110%]"
        }`}
        aria-hidden={!chatOpen}
      >
        <DoctorEcgChat
          analysisData={analysis}
          patientId={patientId}
          sessionId={sessionId}
          patientContext={patientContext}
          className="h-full"
          autoFocusInput={chatOpen}
        />
      </aside>
    </div>
  );
}
