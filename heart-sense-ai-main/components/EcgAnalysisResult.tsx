"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Stethoscope,
  Zap,
  Heart,
  ClipboardList,
  MessageCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DoctorEcgChat } from "./DoctorEcgChat";

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
  segments?: EcgSegmentView[];
  activeViewSegment?: number;
  onActiveViewSegmentChange?: (idx: number) => void;
}

export function EcgAnalysisResult({
  analysis,
  patientId,
  sessionId,
  patientContext,
  segments = [],
  activeViewSegment = 0,
  onActiveViewSegmentChange,
}: EcgAnalysisResultProps) {
  const { rhythm_analysis, abnormalities, diagnosis } = analysis;
  const qualityView = analysis.quality_indicator || analysis.quality_control;
  const traceability = analysis.traceability || analysis.provenance;

  // Zoom state for ECG image viewer
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Chat panel state
  const [chatOpen, setChatOpen] = useState(false);

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      {/* OVERVIEW - always visible on top */}
      <Card className="bg-card border-border rounded-[2.5rem] shadow-md overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Diagnosis + badges */}
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm shrink-0">
                <Heart className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black tracking-tight text-foreground/90 leading-tight mb-2 truncate">
                  {diagnosis.primary_diagnosis}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`px-3 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-widest ${getSeverityStyles(abnormalities.severity)}`}
                  >
                    {abnormalities.severity}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="px-3 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-widest flex gap-1.5 items-center bg-secondary text-muted-foreground border border-border"
                  >
                    {getUrgencyIcon(diagnosis.urgency)}
                    {diagnosis.urgency}
                  </Badge>
                  {qualityView?.overall_grade && (
                    <Badge
                      variant="outline"
                      className="px-3 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-widest border-primary/20 text-primary"
                    >
                      QC {qualityView.overall_grade}
                      {qualityView.overall_score !== undefined &&
                        qualityView.overall_score !== null &&
                        ` (${qualityView.overall_score})`}
                    </Badge>
                  )}
                  {traceability?.model_name && (
                    <Badge
                      variant="outline"
                      className="px-3 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-widest border-white/15 text-muted-foreground"
                    >
                      Trace {traceability.model_name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Biometric strip */}
            <div className="flex gap-6 md:border-l border-border md:pl-6 shrink-0">
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                  Heart Rate
                </p>
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-2xl font-black text-primary">
                    {rhythm_analysis.heart_rate}
                  </span>
                  <span className="text-[9px] font-bold text-primary/50">
                    BPM
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                  Rhythm
                </p>
                <p className="text-sm font-black text-foreground/80 max-w-[120px] truncate">
                  {rhythm_analysis.rhythm_type}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                  Regularity
                </p>
                <p className="text-sm font-black capitalize text-foreground/80">
                  {rhythm_analysis.regularity.replace("_", " ")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SPLIT: ECG Viewer (left) + Tabs (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: ECG Image Viewer with Zoom */}
        {segments.length > 0 && (
          <div className="glass rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col sticky top-4">
            {/* Viewer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Activity className="h-3.5 w-3.5" />
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
                          className="text-[7px] font-black uppercase tracking-widest px-1 py-0 rounded bg-primary/10 text-primary border border-primary/10"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Zoom controls */}
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
              </div>
            </div>

            {/* Zoomable image area */}
            <div
              className="relative bg-black overflow-hidden select-none"
              style={{
                height: singleSegment ? "400px" : "320px",
                cursor: zoom > 1 ? "grab" : "default",
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* ECG grid overlay */}
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
            </div>

            {/* Multi-segment thumbnails */}
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

        {/* RIGHT: Waveforms + Recommendations Tabs */}
        <div className="animate-in fade-in zoom-in-95 duration-1000">
          <Tabs defaultValue="findings" className="w-full">
            <TabsList className="bg-secondary border border-border p-1 h-auto rounded-2xl shadow-sm mb-4 flex gap-1">
              <TabsTrigger
                value="findings"
                className="rounded-xl px-5 py-2.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest flex-1 justify-center"
              >
                <Activity className="h-3.5 w-3.5" /> Waveforms
              </TabsTrigger>
              <TabsTrigger
                value="actions"
                className="rounded-xl px-5 py-2.5 data-[state=active]:bg-green-600 data-[state=active]:text-white flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest flex-1 justify-center"
              >
                <ClipboardList className="h-3.5 w-3.5" /> Recommendations
              </TabsTrigger>
            </TabsList>

            {/* Waveforms / Findings */}
            <TabsContent value="findings" className="space-y-4">
              <Card className="glass border-white/5 rounded-[2rem]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" /> Detected
                    Abnormalities
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="grid grid-cols-1 gap-3">
                    {abnormalities.abnormalities.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/10"
                      >
                        <div className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-accent">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  {abnormalities.affected_leads.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3">
                        Affected Leads
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {abnormalities.affected_leads.map((lead, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="px-3 py-1 border-white/10 bg-white/5 text-foreground/80 font-mono text-[10px]"
                          >
                            {lead}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Recommendations / Actions */}
            <TabsContent value="actions" className="space-y-4">
              <Card className="glass border-white/5 rounded-[2rem]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] text-green-500 flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5" /> Clinical Action
                    Plan
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="space-y-3">
                    {diagnosis.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-4 rounded-2xl bg-green-500/5 border border-green-500/10"
                      >
                        <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0 mt-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                        <p className="text-sm leading-relaxed text-foreground/80 font-medium">
                          {rec}
                        </p>
                      </div>
                    ))}
                  </div>

                  {diagnosis.differential_diagnoses?.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3">
                        Differential Considerations
                      </p>
                      <div className="space-y-2">
                        {diagnosis.differential_diagnoses.map((diff, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-foreground/60 px-3 py-2 rounded-lg bg-white/5 italic"
                          >
                            <Info className="h-3 w-3 opacity-50 shrink-0" />{" "}
                            {diff}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Source info */}
          <div className="flex items-center justify-between px-4 py-3 mt-4 bg-white/5 border border-white/10 rounded-2xl opacity-40 text-[8px] font-black uppercase tracking-[0.3em]">
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
      </div>

      {/* FLOATING CHAT BUTTON */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-violet-600 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center hover:bg-violet-700 hover:scale-110 active:scale-95 transition-all group"
          title="Discuss ECG with AI"
        >
          <MessageCircle className="h-6 w-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[8px] font-black flex items-center justify-center animate-bounce">
            AI
          </span>
        </button>
      )}

      {/* SLIDE-IN CHAT PANEL (fixed right) */}
      {chatOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setChatOpen(false)}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight">
                    ECG Discussion
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest">
                    AI-Assisted Clinical Chat
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Chat body */}
            <div className="flex-1 overflow-hidden">
              <DoctorEcgChat
                analysisData={analysis}
                patientId={patientId}
                sessionId={sessionId}
                patientContext={patientContext}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
