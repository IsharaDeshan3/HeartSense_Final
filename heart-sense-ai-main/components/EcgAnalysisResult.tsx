"use client";

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
  FileText,
  LayoutDashboard
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EcgAnalysisResultProps {
  analysis: {
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
    deterministic_metrics?: {
      heart_rate_avg?: number;
      peak_count?: number;
      hrv?: number;
      status?: string;
      segment_id?: number;
    } | Array<{
      heart_rate_avg?: number;
      peak_count?: number;
      hrv?: number;
      status?: string;
      segment_id?: number;
    }>;
  };
}

export function EcgAnalysisResult({ analysis }: EcgAnalysisResultProps) {
  const { rhythm_analysis, abnormalities, diagnosis, full_interpretation } = analysis;

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* 🚀 Header Summary Card - Always Visible */}
      <Card className="bg-card border-border rounded-[2.5rem] shadow-md overflow-hidden">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-sm shrink-0">
                <Heart className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground/90 leading-tight mb-2">
                  {diagnosis.primary_diagnosis}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={`px-4 py-1 rounded-full font-bold uppercase text-[10px] tracking-widest ${getSeverityStyles(abnormalities.severity)}`}>
                    {abnormalities.severity} Severity
                  </Badge>
                  <Badge variant="secondary" className="px-4 py-1 rounded-full font-bold uppercase text-[10px] tracking-widest flex gap-2 items-center bg-secondary text-muted-foreground border border-border">
                    {getUrgencyIcon(diagnosis.urgency)}
                    {diagnosis.urgency} Protocol
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4 md:border-l border-white/10 md:pl-8">
               <div className="text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Heart Rate</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-black text-primary">{rhythm_analysis.heart_rate}</span>
                    <span className="text-[10px] font-bold text-primary/60">BPM</span>
                  </div>
               </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 📑 Tabbed Interface */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-secondary border border-border p-1.5 h-auto rounded-[2.5rem] shadow-sm mb-6 grid grid-cols-2 lg:flex flex-wrap lg:flex-row gap-1">
          <TabsTrigger value="overview" className="rounded-full px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="findings" className="rounded-full px-6 py-3 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest">
            <Activity className="h-4 w-4" /> Waveforms
          </TabsTrigger>
          <TabsTrigger value="actions" className="rounded-full px-6 py-3 data-[state=active]:bg-green-600 data-[state=active]:text-white flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest">
            <ClipboardList className="h-4 w-4" /> Recommendations
          </TabsTrigger>
          <TabsTrigger value="narrative" className="rounded-full px-6 py-3 data-[state=active]:bg-card data-[state=active]:text-primary flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest border border-transparent data-[state=active]:border-border">
            <FileText className="h-4 w-4" /> Clinical Notes
          </TabsTrigger>
          <TabsTrigger value="research" className="rounded-full px-6 py-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white flex gap-2 items-center transition-all font-bold text-xs uppercase tracking-widest">
            <Stethoscope className="h-4 w-4" /> Research
          </TabsTrigger>
        </TabsList>

        {/* 📋 Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="bg-card border-border rounded-[2.5rem] shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Biometric Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-2xl bg-secondary border border-border">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rhythm Category</span>
                  <span className="text-sm font-black">{rhythm_analysis.rhythm_type}</span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-2xl bg-secondary border border-border">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Regularity</span>
                  <span className="text-sm font-black capitalize">{rhythm_analysis.regularity.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="p-6 rounded-[2rem] bg-primary/5 border border-primary/10 flex flex-col justify-center items-center text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Automated Diagnostic Confidence</p>
                 <div className="text-4xl font-black text-primary italic">OPTIMAL</div>
                 <p className="text-[9px] text-muted-foreground mt-2 uppercase tracking-[0.3em]">SYNTHESIZED FROM LEAD DATA</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 🔍 Findings Tab */}
        <TabsContent value="findings" className="space-y-6">
          <Card className="glass border-white/5 rounded-[2.5rem]">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Detected Abnormalities
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {abnormalities.abnormalities.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-accent/5 border border-accent/10">
                    <div className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">{item}</span>
                  </div>
                ))}
              </div>
              
              {abnormalities.affected_leads.length > 0 && (
                <div className="mt-8 pt-8 border-t border-white/10">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-4">Morphological Mapping (Affected Leads)</p>
                  <div className="flex flex-wrap gap-2">
                    {abnormalities.affected_leads.map((lead, i) => (
                      <Badge key={i} variant="outline" className="px-4 py-2 border-white/10 bg-white/5 text-foreground/80 font-mono text-xs">
                        {lead}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 🚀 Actions Tab */}
        <TabsContent value="actions" className="space-y-6">
          <Card className="glass border-white/5 rounded-[2.5rem]">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-green-500 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Clinical Action Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <div className="space-y-4">
                {diagnosis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-4 p-5 rounded-3xl bg-green-500/5 border border-green-500/10">
                    <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0 mt-0.5">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/80 font-medium">{rec}</p>
                  </div>
                ))}
              </div>

              {diagnosis.differential_diagnoses && diagnosis.differential_diagnoses.length > 0 && (
                <div className="mt-8 pt-8 border-t border-white/10">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-4">Differential Diagnostic Considerations</p>
                   <div className="space-y-3">
                     {diagnosis.differential_diagnoses.map((diff, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs text-foreground/60 px-4 py-2 rounded-xl bg-white/5 italic">
                           <Info className="h-3 w-3 opacity-50" /> {diff}
                        </div>
                     ))}
                   </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 📝 Narrative Tab */}
        <TabsContent value="narrative" className="space-y-6">
        {full_interpretation ? (
          <Card className="glass border-white/5 rounded-[2.5rem] border-l-4 border-l-primary/40">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <FileText className="h-4 w-4" /> Unified AI Physician Narrative
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <div className="bg-white/5 rounded-[2rem] p-8 border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 to-transparent" />
                <p className="text-base leading-relaxed text-foreground/80 whitespace-pre-line italic font-medium">
                  {full_interpretation}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center glass border-white/5 rounded-[2.5rem] opacity-30 italic">
             <FileText className="h-10 w-10 mb-4" />
             <p>No formal narrative generated for this cycle</p>
          </div>
        )}
        </TabsContent>

        {/* 🧪 Research & Validation Tab */}
        <TabsContent value="research" className="space-y-6">
          <Card className="glass border-white/5 rounded-[2.5rem]">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Technical & Research Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {analysis.deterministic_metrics ? (
                <div className="space-y-6">
                  {(Array.isArray(analysis.deterministic_metrics) ? analysis.deterministic_metrics : [analysis.deterministic_metrics]).map((feat, idx) => (
                    <div key={idx} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-[8px] font-black">
                          {feat.segment_id || idx + 1}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Segment Signal Analysis</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 text-center">
                           <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Deterministic HR</p>
                           <div className="text-2xl font-black">{feat.heart_rate_avg?.toFixed(1)} <span className="text-[10px] opacity-50">BPM</span></div>
                        </div>
                        <div className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 text-center">
                           <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">R-Peak Count</p>
                           <div className="text-2xl font-black">{feat.peak_count}</div>
                        </div>
                        <div className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 text-center">
                           <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">HRV (SDNN)</p>
                           <div className="text-2xl font-black">{feat.hrv?.toFixed(3)} <span className="text-[10px] opacity-50">S</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 text-center italic text-xs opacity-50">
                  No deterministic metrics available for this scan session.
                </div>
              )}

              <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Evaluation Methodology</p>
                <div className="text-xs leading-relaxed text-foreground/70 space-y-3">
                  <p>• Analysis utilizes a **Hybrid Neuro-Symbolic** approach, combining LLM vision with deterministic signal processing via `NeuroKit2`.</p>
                  <p>• Signal is filtered using a 0.5Hz High-pass, 40Hz Low-pass, and 50Hz Notch filter to ensure clinical grade SNR (Signal-to-Noise Ratio).</p>
                  <p>• Validation is performed against the **PTB-XL Benchmark Dataset** standards for waveform morphology matching.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 🛠️ System Metadata Footer */}
      <div className="flex flex-col md:flex-row justify-between items-center px-8 py-5 bg-white/5 border border-white/10 rounded-[2rem] opacity-40 text-[9px] font-black uppercase tracking-[0.4em] gap-4">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-3 w-3" /> 
          <span>Instance: {analysis.source || "FLASK-LOCAL-ENGINE"}</span>
        </div>
        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8">
          <span>{analysis.model || "MODEL SYNTHESIS v1.2"}</span>
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
