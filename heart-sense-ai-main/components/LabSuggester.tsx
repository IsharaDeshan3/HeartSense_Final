"use client";

import { useState, useRef } from "react";
import {
  Microscope,
  Upload,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
  FlaskConical,
  ClipboardList,
  ChevronRight,
  FileText,
  ZoomIn,
  ZoomOut,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabComparisonItem {
  test: string;
  actualValue: number | string;
  normalRange: string;
  status: "Normal" | "High" | "Low";
}

export interface LabAnalysisResult {
  isMedical: boolean;
  summary: string;
  patientInfo?: { age?: number | null; gender?: string | null };
  labComparison: LabComparisonItem[];
  recommendedTests: string[];
  extractedJsonGroup1?: Record<string, any>;
  extractedJsonGroup2?: Record<string, any>;
}

interface LabSuggesterProps {
  patientId?: string;
  patientContext?: string;
  onAnalysisComplete?: (result: LabAnalysisResult) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";

const PROMPT = `
You are a medical document analysis AI.

STEP 1 – VALIDATION
If this image is NOT a medical lab report, respond ONLY with:
{ "isMedical": false, "error": "Not a medical report" }

STEP 2 – EXTRACTION
Group 1 (diabetic/metabolic):
{ "Age": number|null, "Gender": "M"|"F"|null, "BMI": number|null, "Chol": number|null,
  "TG": number|null, "HDL": number|null, "LDL": number|null, "Cr": number|null, "BUN": number|null }

Group 2 (cardiac):
{ "age": number|null, "sex": number|null, "cp": number|null, "trestbps": number|null,
  "chol": number|null, "fbs": number|null, "restecg": number|null, "thalach": number|null,
  "exang": number|null, "oldpeak": number|null, "slope": number|null, "ca": number|null, "thal": number|null }

STEP 3 – COMPARISON: test name, actual value, normal range, status (Normal/High/Low).
STEP 4 – SUMMARY (short, medical-friendly, NO diagnosis)
STEP 5 – RECOMMENDED NEXT TESTS: "Test Name - Reason". Empty array if all normal.
STEP 6 – PATIENT INFO: age and gender if present.

Respond ONLY in valid JSON:
{
  "isMedical": true,
  "patientInfo": { "age": number|null, "gender": string|null },
  "labComparison": [{ "test": string, "actualValue": number|string, "normalRange": string, "status": "Normal"|"High"|"Low" }],
  "extractedJsonGroup1": {},
  "extractedJsonGroup2": {},
  "summary": string,
  "recommendedTests": string[]
}
`;

const STATUS_CONFIG = {
  Normal: {
    badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    bar: "bg-emerald-500",
    row: "hover:bg-emerald-500/5",
  },
  High: {
    badge: "text-rose-400 bg-rose-400/10 border-rose-400/20",
    bar: "bg-rose-500",
    row: "hover:bg-rose-500/5",
  },
  Low: {
    badge: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    bar: "bg-amber-500",
    row: "hover:bg-amber-500/5",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LabSuggester({ patientId, patientContext, onAnalysisComplete }: LabSuggesterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<LabAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageZoomed, setImageZoomed] = useState(false);

  const abnormalCount = result
    ? result.labComparison.filter((r) => r.status !== "Normal").length
    : 0;

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setImageZoomed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Analysis ──────────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    toast.info("Neural Lab Analysis Initiated…");

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res((fr.result as string).split(",")[1]);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });

      const contextNote = patientContext ? `Clinical context: ${patientContext}\n` : "";

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: contextNote + PROMPT },
                  { inline_data: { mime_type: file.type, data: base64 } },
                ],
              },
            ],
          }),
        }
      );

      if (!geminiRes.ok) throw new Error(`Gemini error: ${geminiRes.status}`);

      const raw = await geminiRes.json();
      const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed: LabAnalysisResult & { error?: string } = JSON.parse(cleaned);

      if (!parsed.isMedical) {
        setError(parsed.error ?? "Not a valid medical lab report.");
        setAnalyzing(false);
        return;
      }

      setResult(parsed);
      onAnalysisComplete?.(parsed);

      // Non-blocking: persist to lab backend by patientId
      if (patientId) {
        fetch("/api/lab/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diabeticData: parsed.extractedJsonGroup1 ? { patientId, ...parsed.extractedJsonGroup1 } : null,
            heartData: parsed.extractedJsonGroup2 ? { patientId, ...parsed.extractedJsonGroup2 } : null,
            patientHistory: {
              patientId,
              extractedJsonGroup1: parsed.extractedJsonGroup1,
              extractedJsonGroup2: parsed.extractedJsonGroup2,
              isMedical: true,
              labComparison: parsed.labComparison,
              patientInfo: parsed.patientInfo,
              recommendedTests: parsed.recommendedTests,
              summary: parsed.summary,
            },
          }),
        }).catch(console.warn);
      }

      toast.success("Analysis Complete");
    } catch (e: any) {
      console.error(e);
      setError("Analysis failed. Ensure the image is clear and try again.");
      toast.error("Analysis Failed");
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // ── Pre-upload state ──────────────────────────────────────────────────────
  if (!file) {
    return (
      <div
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        className="relative glass rounded-[3rem] border-2 border-dashed border-white/10 hover:border-primary/30 transition-all duration-500 p-16 flex flex-col items-center justify-center text-center gap-8"
      >
        <div className="h-28 w-28 rounded-[2rem] bg-primary/10 flex-center text-primary glow-primary">
          <FlaskConical className="h-14 w-14" />
        </div>
        <div>
          <h3 className="text-2xl font-black tracking-tight mb-3">Lab Report Analysis</h3>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Upload a patient&apos;s lab report image. Gemini AI will extract all values, compare against normal ranges, and recommend follow-up tests.
          </p>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="h-14 px-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest border-none glow-primary hover:scale-105 transition-all"
        >
          <Upload className="h-4 w-4 mr-3" /> Select Lab Report
        </Button>
        <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">
          or drag and drop — JPG, PNG accepted
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
    );
  }

  // ── File selected, not yet analyzed ──────────────────────────────────────
  if (!result) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-[3rem] border border-white/5 p-8 space-y-6">
          {/* File header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-400/10 flex-center text-emerald-400">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="font-black text-sm uppercase tracking-wider">Report Loaded</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest truncate max-w-[250px]">{file.name}</p>
              </div>
            </div>
            <button
              onClick={clearFile}
              className="h-10 w-10 rounded-xl border border-white/10 flex-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Preview */}
          {preview && (
            <div className="rounded-[2rem] overflow-hidden border border-white/5 bg-black/20">
              <img src={preview} alt="Lab report preview" className="w-full max-h-[400px] object-contain" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-destructive/5 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Analyze button */}
          <Button
            onClick={runAnalysis}
            disabled={analyzing}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest border-none glow-primary hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-3 animate-spin" /> Synthesizing Neural Analysis…</>
            ) : (
              <><Microscope className="h-4 w-4 mr-3" /> Run AI Lab Analysis</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Results Layout ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {result.patientInfo?.age && (
            <div className="px-4 py-2 glass rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Age <span className="text-white ml-1">{result.patientInfo.age}y</span>
            </div>
          )}
          {result.patientInfo?.gender && (
            <div className="px-4 py-2 glass rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Gender <span className="text-white ml-1">{result.patientInfo.gender}</span>
            </div>
          )}
          {abnormalCount > 0 && (
            <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest text-rose-400">
              {abnormalCount} Abnormal {abnormalCount === 1 ? "Value" : "Values"}
            </div>
          )}
        </div>
        <button
          onClick={clearFile}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-colors"
        >
          <X className="h-3 w-3" /> New Report
        </button>
      </div>

      {/* ── MAIN SPLIT VIEW ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT: Zoomable Lab Report Image */}
        <div className="glass rounded-[3rem] border border-white/5 overflow-hidden flex flex-col">
          {/* Image header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex-center text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Source Document</span>
            </div>
            <button
              onClick={() => setImageZoomed((z) => !z)}
              className="h-8 w-8 rounded-lg border border-white/10 flex-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
              title={imageZoomed ? "Fit to view" : "Zoom in"}
            >
              {imageZoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Image area */}
          <div className={`relative flex-1 overflow-auto bg-black/20 ${imageZoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            onClick={() => setImageZoomed((z) => !z)}
            style={{ minHeight: "380px" }}
          >
            {preview && (
              <img
                src={preview}
                alt="Lab report"
                className={`transition-all duration-500 ${imageZoomed
                    ? "w-full object-cover"
                    : "w-full h-full object-contain p-4"
                  }`}
              />
            )}
          </div>

          {/* Image footer hint */}
          <div className="px-8 py-4 border-t border-white/5 flex-center">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest font-bold">
              {imageZoomed ? "Click to Fit" : "Click to Zoom"}
            </p>
          </div>
        </div>

        {/* RIGHT: Summary + Tabs */}
        <div className="flex flex-col gap-6">
          {/* Clinical Summary Card */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2.5rem]">
            <CardContent className="p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex-center text-primary">
                  <Activity className="h-5 w-5" />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Clinical Summary</h3>
              </div>
              <p className="text-sm text-foreground/80 leading-loose italic">
                &quot;{result.summary}&quot;
              </p>
            </CardContent>
          </Card>

          {/* Tabbed Results */}
          <div className="flex-1">
            <Tabs defaultValue="comparison" className="h-full flex flex-col">
              <TabsList className="h-14 bg-white/5 border border-white/5 rounded-2xl p-1.5 gap-1.5 self-start mb-4 w-full">
                <TabsTrigger
                  value="comparison"
                  className="flex-1 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Microscope className="h-3.5 w-3.5" /> Lab Values
                </TabsTrigger>
                <TabsTrigger
                  value="recommended"
                  className="flex-1 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Next Tests
                  {result.recommendedTests.length > 0 && (
                    <span className="ml-1 h-5 w-5 rounded-full bg-primary/20 text-primary flex-center text-[9px] font-black">
                      {result.recommendedTests.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Lab Value Comparison */}
              <TabsContent value="comparison" className="flex-1 mt-0">
                <div className="glass rounded-[2rem] border border-white/5 overflow-hidden">
                  {result.labComparison && result.labComparison.length > 0 ? (
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
                            <th className="text-left px-6 py-4 font-black uppercase tracking-widest text-muted-foreground">Test</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground">Result</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground">Range</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.labComparison.map((row, i) => {
                            const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.Normal;
                            return (
                              <tr
                                key={i}
                                className={`border-b border-white/5 last:border-0 transition-colors ${cfg.row}`}
                              >
                                <td className="px-6 py-4 font-bold">{row.test}</td>
                                <td className="px-4 py-4 font-black">{row.actualValue}</td>
                                <td className="px-4 py-4 text-muted-foreground/60 font-medium">{row.normalRange}</td>
                                <td className="px-4 py-4">
                                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${cfg.badge}`}>
                                    {row.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-muted-foreground/30 italic text-xs">No lab values could be extracted.</div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 2: Recommended Next Tests */}
              <TabsContent value="recommended" className="flex-1 mt-0">
                <div className="glass rounded-[2rem] border border-white/5 overflow-hidden p-6">
                  {result.recommendedTests.length === 0 ? (
                    <div className="text-center py-10">
                      <CheckCircle className="h-14 w-14 text-emerald-400 mx-auto mb-4 opacity-50" />
                      <p className="font-black text-emerald-400 uppercase tracking-widest text-sm mb-2">All Values Normal</p>
                      <p className="text-xs text-muted-foreground">No follow-up tests required at this time.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 overflow-y-auto max-h-[460px]">
                      {result.recommendedTests.map((test, i) => {
                        const dashIdx = test.indexOf(" - ");
                        const name = dashIdx !== -1 ? test.slice(0, dashIdx) : test;
                        const reason = dashIdx !== -1 ? test.slice(dashIdx + 3) : "";
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-4 p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all group cursor-default"
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex-center text-primary text-[10px] font-black shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-sm mb-1">{name}</p>
                              {reason && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{reason}</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary/60 transition-all shrink-0 mt-1" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
