"use client";

import { useState, useRef } from "react";
import {
  Upload,
  X,
  BrainCircuit,
  Loader2,
  FileImage,
  MessageSquareText,
  AlertCircle,
  Activity,
  ArrowLeft,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EcgAnalysisResult } from "./EcgAnalysisResult";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, Edit2 } from "lucide-react";

// --- LEAD PICKER COMPONENT ---
const ALL_LEADS = [
  "I",
  "II",
  "III",
  "aVR",
  "aVL",
  "aVF",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
];

function LeadPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (leads: string[]) => void;
}) {
  const toggleLead = (lead: string) => {
    if (selected.includes(lead)) {
      onChange(selected.filter((l) => l !== lead));
    } else {
      onChange([...selected, lead]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-lg border-primary/20 bg-primary/5 text-primary text-[9px] font-black uppercase tracking-widest hover:bg-primary/10"
        >
          <Edit2 className="h-3 w-3 mr-2" /> Assign Leads
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 glass border-white/10 p-4 rounded-3xl shadow-2xl z-50">
        <div className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">
            Select Leads in segment
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {ALL_LEADS.map((lead) => (
              <button
                key={lead}
                onClick={() => toggleLead(lead)}
                className={`h-8 rounded-lg text-[9px] font-bold transition-all border ${
                  selected.includes(lead)
                    ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {lead}
              </button>
            ))}
          </div>
          <div className="pt-2 flex justify-end">
            <p className="text-[8px] text-muted-foreground uppercase font-medium">
              Click to toggle leads
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- SIGNAL TRACE COMPONENT ---
function SignalTrace({
  segment,
  active,
}: {
  segment: EcgSegment;
  active: boolean;
}) {
  // Simple fake signal path for visualization if no real data yet
  const width = 400;
  const height = 100;

  const generatePath = () => {
    let d = "M 0 50 ";
    for (let x = 0; x <= width; x += 10) {
      const isPeak = x % 60 === 0 && x > 0;
      const y = isPeak ? 10 : 50 + Math.sin(x / 5) * 5;
      d += `L ${x} ${y} `;
    }
    return d;
  };

  return (
    <div
      className={`mt-4 p-4 rounded-[2rem] border transition-all duration-700 bg-black/40 overflow-hidden relative ${active ? "border-primary/40" : "border-white/5 opacity-40"}`}
    >
      {/* ECG Grid BG */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#f00 1px, transparent 1px), linear-gradient(90deg, #f00 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-16 drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]"
      >
        <path
          d={generatePath()}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary transition-all duration-1000"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Touch Points */}
        {[60, 120, 180, 240, 300, 360].map((x) => (
          <circle
            key={x}
            cx={x}
            cy="10"
            r="4"
            className="fill-primary animate-pulse cursor-pointer hover:r-6 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              toast.info(
                `Segment ${segment.id}: Manual Signal Anchor at ${x}ms`,
              );
            }}
          />
        ))}
      </svg>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[7px] font-black text-primary/40 uppercase tracking-[0.3em]">
          Digital Signal Trace
        </span>
        <span className="text-[7px] font-black text-muted-foreground uppercase">
          50mm/s • High Resolution
        </span>
      </div>
    </div>
  );
}

interface EcgSegment {
  id: string;
  url: string;
  leads: string[];
  quality: "optimal" | "suboptimal";
  signalData?: number[];
}

interface EcgInterpreterProps {
  initialContext?: string;
  onAnalysisComplete?: (result: any) => void;
}

export default function EcgInterpreter({
  initialContext = "",
  onAnalysisComplete,
}: EcgInterpreterProps) {
  const [view, setView] = useState<"acquisition" | "interpretation">(
    "acquisition",
  );
  const [segments, setSegments] = useState<EcgSegment[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(
    null,
  );
  const [patientContext, setPatientContext] = useState(initialContext);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [activeViewSegment, setActiveViewSegment] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file (PNG, JPG, etc)");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;

        const img = new window.Image();
        img.onload = () => {
          const isOptimal = img.width >= 1000 && img.height >= 600;
          const newSegment: EcgSegment = {
            id: Math.random().toString(36).substr(2, 9),
            url: result,
            leads: [], // Initially empty, clinician will assign
            quality: isOptimal ? "optimal" : "suboptimal",
          };
          setSegments((prev) => [...prev, newSegment]);
          setActiveSegmentIndex(segments.length);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
    if (activeSegmentIndex === index) setActiveSegmentIndex(null);
  };

  const updateSegmentLeads = (index: number, leads: string[]) => {
    setSegments((prev) =>
      prev.map((s, i) => (i === index ? { ...s, leads } : s)),
    );
  };

  const resetAcquisition = () => {
    setSegments([]);
    setActiveSegmentIndex(null);
    setAnalysisResult(null);
    setPatientContext("");
    setView("acquisition");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runAnalysis = async () => {
    if (segments.length === 0) {
      toast.error("Please upload at least one ECG segment");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/ecg/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: segments.map((s) => s.url),
          leads: segments.map((s) => s.leads),
          patientContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Analysis failed");
      }

      setAnalysisResult(data);
      onAnalysisComplete?.(data);
      setView("interpretation");
      toast.success("Interpretation Synthesized");
    } catch (error: any) {
      console.error("ECG Analysis Error:", error);
      toast.error(error.message || "Failed to analyze ECG");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- ACQUISITION VIEW ---
  if (view === "acquisition") {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-10 animate-in fade-in duration-700">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] shadow-sm">
            <Sparkles className="h-3 w-3" /> Neural Cardiac Intelligence
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-foreground">
            Panoramic ECG Acquisition
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto leading-relaxed font-medium">
            Upload sequential segments of the ECG strip. HeartSense AI will
            correlate the signal across all parts for a high-resolution 12-lead
            interpretation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full items-start">
          {/* Filmstrip / Upload Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <FileImage className="h-3 w-3" /> Acquisition Strip (
                {segments.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] h-8 rounded-full border border-white/10 glass bg-primary/5 hover:bg-primary/10 text-primary font-bold"
              >
                <Upload className="h-3 w-3 mr-2" /> Add Segment
              </Button>
            </div>

            {segments.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="h-[500px] border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center p-8 glass hover:border-primary/40 transition-all cursor-pointer group hover:bg-primary/5 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="h-24 w-24 rounded-[3rem] bg-secondary flex items-center justify-center text-primary mb-8 group-hover:scale-110 transition-all duration-500 relative z-10 border border-border shadow-inner">
                  <Upload className="h-10 w-10" />
                </div>
                <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors relative z-10">
                  Select First Segment
                </p>
                <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest px-6 border border-border rounded-full py-1.5 bg-background relative z-10">
                  Long 12-Lead Strip Segments
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {segments.map((segment, idx) => (
                  <div
                    key={segment.id}
                    className={`relative p-4 rounded-[2.5rem] border transition-all duration-500 group ${activeSegmentIndex === idx ? "border-primary bg-primary/5 shadow-lg" : "border-white/5 bg-white/[0.02] hover:border-white/10"}`}
                    onClick={() => setActiveSegmentIndex(idx)}
                  >
                    <div className="flex gap-6 items-center">
                      <div className="h-28 w-40 rounded-3xl overflow-hidden border border-border bg-black shrink-0 relative">
                        <img
                          src={segment.url}
                          alt={`Segment ${idx + 1}`}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[8px] font-black text-white">
                          #{idx + 1}
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                              Digital Segment
                            </span>
                            {segment.quality === "optimal" ? (
                              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[8px] font-black tracking-tighter h-4">
                                Research Grade
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[8px] font-black tracking-tighter h-4">
                                Sub-optimal
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSegment(idx);
                            }}
                            className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {segment.leads.length > 0 ? (
                            segment.leads.map((lead) => (
                              <Badge
                                key={lead}
                                variant="outline"
                                className="rounded-lg bg-primary/5 border-primary/20 text-primary text-[9px] font-bold px-2 py-0"
                              >
                                {lead}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">
                              No leads assigned
                            </span>
                          )}
                        </div>

                        <div className="pt-2 flex items-center gap-3">
                          <LeadPicker
                            selected={segment.leads}
                            onChange={(leads) => updateSegmentLeads(idx, leads)}
                          />
                        </div>

                        <SignalTrace
                          segment={segment}
                          active={activeSegmentIndex === idx}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-2">
              <MessageSquareText className="h-3 w-3" /> Diagnostic Context
            </h3>
            <textarea
              value={patientContext}
              onChange={(e) => setPatientContext(e.target.value)}
              placeholder="Symptoms, clinical suspicion, prior ECG findings..."
              className="w-full h-52 bg-card border border-border rounded-[2.5rem] p-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm resize-none placeholder:text-muted-foreground/50 font-medium"
            />

            <Button
              onClick={runAnalysis}
              disabled={segments.length === 0 || isAnalyzing}
              className="w-full h-20 rounded-[2.5rem] bg-primary text-primary-foreground font-black text-xl flex items-center justify-center gap-4 border-none enabled:hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin" />
                  Correlating Segments...
                </>
              ) : (
                <>
                  <BrainCircuit className="h-7 w-7" />
                  Synthesize Report
                </>
              )}
            </Button>

            <div className="p-6 bg-accent/5 border border-accent/20 rounded-[2.5rem] space-y-3">
              <div className="flex items-center gap-2 text-accent">
                <AlertCircle className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                  Panoramic Guidance
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed italic font-medium">
                Upload segments in sequential order from left to right. Ensure
                overlapping regions for better neural correlation.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- INTERPRETATION VIEW ---
  const singleSegment = segments.length === 1;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-in slide-in-from-right-12 duration-1000">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setView("acquisition")}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-bold uppercase text-[10px] tracking-widest"
        >
          <ArrowLeft className="h-4 w-4" /> Edit Acquisition
        </Button>

        <div className="text-center">
          <h1 className="text-base font-black tracking-tighter text-foreground/90">
            Multimodal Diagnostic Report
          </h1>
          <p className="text-[9px] text-muted-foreground uppercase tracking-[0.3em]">
            Neural Synthesis Complete • {new Date().toLocaleDateString()}
          </p>
        </div>

        <Button
          variant="ghost"
          onClick={resetAcquisition}
          className="flex items-center gap-2 text-muted-foreground hover:text-destructive transition-colors font-bold uppercase text-[10px] tracking-widest"
        >
          <RefreshCcw className="h-4 w-4" /> New Case
        </Button>
      </div>

      {/* ── SPLIT PANE ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: ECG Images Panel */}
        <div className="glass rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex-center text-primary">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {singleSegment
                    ? "ECG Recording"
                    : `Segment ${activeViewSegment + 1} of ${segments.length}`}
                </span>
                {segments[activeViewSegment]?.leads?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {segments[activeViewSegment].leads.map((l) => (
                      <span
                        key={l}
                        className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/10"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-6 px-3 rounded-full text-[8px] font-black uppercase tracking-widest border flex-center ${
                  segments[activeViewSegment]?.quality === "optimal"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}
              >
                {segments[activeViewSegment]?.quality === "optimal"
                  ? "Research Grade"
                  : "Sub-optimal"}
              </span>
            </div>
          </div>

          {/* Main image */}
          <div
            className="relative bg-black flex-center overflow-hidden"
            style={{ minHeight: singleSegment ? "440px" : "320px" }}
          >
            {/* ECG grid background */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(#f00 1px, transparent 1px), linear-gradient(90deg, #f00 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
            {segments[activeViewSegment] && (
              <img
                src={segments[activeViewSegment].url}
                alt={`ECG Segment ${activeViewSegment + 1}`}
                className="relative z-10 w-full object-contain transition-all duration-500"
                style={{ maxHeight: singleSegment ? "440px" : "320px" }}
              />
            )}
          </div>

          {/* Multi-segment thumbnail strip */}
          {!singleSegment && (
            <div className="border-t border-white/5 p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-3 px-2">
                All Segments — Click to View
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                {segments.map((seg, i) => (
                  <button
                    key={seg.id}
                    onClick={() => setActiveViewSegment(i)}
                    className={`relative shrink-0 h-20 w-28 rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                      activeViewSegment === i
                        ? "border-primary shadow-lg shadow-primary/20 scale-105"
                        : "border-white/10 opacity-50 hover:opacity-80 hover:border-white/20"
                    }`}
                  >
                    <img
                      src={seg.url}
                      alt={`seg ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Lead label overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm px-2 py-1">
                      <p className="text-[7px] font-black text-white/80 uppercase tracking-wider truncate">
                        {seg.leads.length > 0
                          ? seg.leads.join(", ")
                          : `Seg ${i + 1}`}
                      </p>
                    </div>
                    {activeViewSegment === i && (
                      <div className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full bg-primary animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer hint */}
          <div className="px-8 py-4 border-t border-white/5">
            <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.3em] font-bold text-center">
              {singleSegment
                ? "Full ECG Recording — Neural Synthesis Complete"
                : `${segments.length} Panoramic Segments Correlated`}
            </p>
          </div>
        </div>

        {/* RIGHT: Diagnostics */}
        <div className="animate-in fade-in zoom-in-95 duration-1000">
          <EcgAnalysisResult analysis={analysisResult} />
        </div>
      </div>

      {/* Download footer */}
      <div className="flex justify-center pt-4">
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="rounded-full px-8 py-6 h-auto flex items-center gap-3 border-white/10 hover:bg-white/5 font-bold uppercase text-xs tracking-widest"
        >
          <FileImage className="h-4 w-4" /> Download Clinical PDF
        </Button>
      </div>
    </div>
  );
}
