"use client";

import { useState, useRef, useEffect } from "react";
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
  BarChart2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PatientService } from "@/services/PatientService";
import DiagnosticButtons from "./DiagnosticButtons";

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
  dailyHealthAdvice?: string[];
}

interface LabSuggesterProps {
  patientContext?: string;
  onAnalysisComplete?: (result: LabAnalysisResult) => void;
  /**
   * Pre-load a result from patient history without requiring a new upload.
   * When this prop changes, LabSuggester shows the result view immediately.
   */
  initialResult?: LabAnalysisResult;
  patientId?: string;
  isLoggedIn?: boolean;
  /**
   * Callback for risk results (diabetic and heart)
   */
  onRiskResults?: (diabeticResult: any, heartResult: any) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";

const PROMPT = `
You are a medical document analysis AI.

IMPORTANT MEDICAL SAFETY RULES:
- Abnormal lab values do NOT automatically require further testing.
- The purpose of this system is to evaluate possible **cardiovascular (heart disease) risk**.
- Future test recommendations must ONLY be made if the abnormal values may affect **heart health**.
- Mild, isolated, or clinically insignificant lab variations must be ignored.
- If abnormal values are unrelated to cardiovascular risk, DO NOT recommend any future tests.
- Diagnostic tests (ECG, Echocardiogram, CT, MRI, Ultrasound) must only be suggested if cardiovascular risk is clearly indicated by lab values.
- Daily health advice should only be provided for values that are clearly High or Low.

STEP 1 – VALIDATION
If this image is NOT a medical report (lab report, blood test, diagnostic report),
respond ONLY with:
{
  "isMedical": false,
  "error": "The uploaded file is not a medical report"
}

STEP 2 – EXTRACTION
If it IS a medical report, extract values if present.

Group 1:
{
  "Age": number,
  "Gender": "M" | "F",
  "BMI": number,
  "Chol": number,
  "TG": number,
  "HDL": number,
  "LDL": number,
  "Cr": number,
  "BUN": number
}

Group 2:
{
  "age": number,
  "sex": number,
  "cp": number,
  "trestbps": number,
  "chol": number,
  "fbs": number,
  "restecg": number,
  "thalach": number,
  "exang": number,
  "oldpeak": number,
  "slope": number,
  "ca": number,
  "thal": number
}

STEP 3 – COMPARISON
For each lab value:
- show actual value
- show normal range
- status: Normal | High | Low

STEP 4 – SUMMARY
Provide a short medical-friendly summary of the report.

Rules:
- Mention whether most lab values are normal or abnormal.
- Highlight clinically important high or low values related to cardiovascular health.
- Keep the explanation short and simple.
- DO NOT provide a medical diagnosis.

STEP 5 – DAILY HEALTH ADVICE
Provide simple daily health actions that may help balance abnormal lab values that affect heart health.

Rules:
- Only provide advice for abnormal values related to cardiovascular risk (cholesterol, LDL, triglycerides, BMI, glucose, etc.).
- Ignore abnormal values unrelated to heart health.
- Keep each item short.
- Format each item as:

"Action - Helps balance: Lab Value"

Examples:
- "Walk 30 minutes daily - Helps balance: Cholesterol, TG"
- "Reduce fried and fatty foods - Helps balance: LDL, Cholesterol"
- "Increase fruits and vegetables intake - Helps balance: Cholesterol"
- "Exercise regularly - Helps balance: BMI, Cholesterol"
- "Reduce sugary foods and drinks - Helps balance: TG"

Return these items inside the "dailyHealthAdvice" array.

STEP 6 – RECOMMENDED FUTURE TESTS (CARDIOVASCULAR ONLY)

Evaluate whether abnormal lab values may increase **cardiovascular risk**.

Rules:

1. Only recommend future tests if abnormal values are **clearly related to heart disease risk**.

2. Relevant cardiovascular markers include:
- Total Cholesterol
- LDL Cholesterol
- HDL Cholesterol
- Triglycerides
- Cholesterol ratios
- Blood glucose markers
- BMI
- Blood pressure related markers

3. Ignore abnormalities unrelated to cardiovascular risk such as:
- Slight RBC changes
- RDW changes
- Iron variations
- Minor CBC differences

4. Ignore small value deviations that are only slightly outside the reference range.

5. If cardiovascular risk markers are abnormal, recommend appropriate follow-up tests such as:

- "Repeat Lipid Profile in 3–6 months - To monitor elevated cholesterol or LDL levels."
- "Fasting Blood Glucose or HbA1c - To evaluate metabolic risk associated with cardiovascular disease."
- "ECG - To evaluate possible cardiac effects if multiple cardiovascular risk markers are abnormal."

6. If abnormalities exist but are **not related to cardiovascular risk**, return an empty array [].

7. If cardiovascular markers are only slightly abnormal, recommend **monitoring tests only**, not advanced diagnostics.

Format each recommendation as:
"Test Name - Reason for recommendation"

STEP 7 – OUTPUT

Respond ONLY in valid JSON:

{
  "isMedical": true,
  "patientInfo": {
    "age": number | null,
    "gender": string | null
  },
  "labComparison": [
    {
      "test": string,
      "actualValue": number | string,
      "normalRange": string,
      "status": "Normal" | "High" | "Low"
    }
  ],
  "extractedJsonGroup1": {},
  "extractedJsonGroup2": {},
  "summary": string,
  "dailyHealthAdvice": [
    "string"
  ],
  "recommendedTests": string[]
}
`;

const STATUS_CONFIG = {
  Normal: {
    badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    row: "hover:bg-emerald-500/5",
  },
  High: {
    badge: "text-rose-400 bg-rose-400/10 border-rose-400/20",
    row: "hover:bg-rose-500/5",
  },
  Low: {
    badge: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    row: "hover:bg-amber-500/5",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LabSuggester({
  patientContext,
  onAnalysisComplete,
  initialResult,
  patientId,
  isLoggedIn = true,
  onRiskResults,
}: LabSuggesterProps) {
  const [diagnosticRefresh, setDiagnosticRefresh] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [result, setResult]         = useState<LabAnalysisResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [fromHistory, setFromHistory] = useState(false);
  const [diabeticAutoResult, setDiabeticAutoResult] = useState<any>(null);
  const [heartAutoResult, setHeartAutoResult] = useState<any>(null);

  // ── When parent passes initialResult (history record clicked), show it ─────
  useEffect(() => {
    if (!initialResult) return;
    setResult(initialResult);
    setFile(null);
    setPreview(null);
    setError(null);
    setImageZoomed(false);
    setFromHistory(true);
  }, [initialResult]);

  const abnormalCount = result
    ? result.labComparison.filter((r) => r.status !== "Normal").length
    : 0;

  // ── File handling ─────────────────────────────────────────────────────────

    // Conversion factors for mg/dL to mmol/L
    const conversionFactors: Record<string, number> = {
      Chol: 0.0259, // Cholesterol
      TG: 0.0113,   // Triglycerides
      HDL: 0.0259,  // HDL Cholesterol
      LDL: 0.0259,  // LDL Cholesterol
      Cr: 88.4,     // Creatinine (mg/dL to µmol/L)
      BUN: 0.357,   // BUN (mg/dL to mmol/L)
    };

    function convertFormDataToMmolL(data: Record<string, any>): Record<string, any> {
      const converted: Record<string, any> = { ...data };
      for (const key of Object.keys(conversionFactors)) {
        const val = Number(data[key]);
        if (!isNaN(val) && val !== 0) {
          converted[key] = (val * conversionFactors[key]).toFixed(2);
        }
      }
      return converted;
    }

    useEffect(() => {
      if (!result) {
        setDiabeticAutoResult(null);
        setHeartAutoResult(null);
        return;
      }

      // Diabetic risk
      if (result.extractedJsonGroup1 && Object.keys(result.extractedJsonGroup1).length > 0) {
        const diabeticData = convertFormDataToMmolL(result.extractedJsonGroup1);
        fetch("https://diabetesnew-1051190728028.asia-south1.run.app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(diabeticData),
        })
          .then(res => res.json())
            .then(data => {
              setDiabeticAutoResult(data);
              if (onRiskResults) onRiskResults(data, heartAutoResult);
            })
          .catch(() => setDiabeticAutoResult(null));
      } else {
        setDiabeticAutoResult(null);
      }

      // Heart risk
      if (result.extractedJsonGroup2 && Object.keys(result.extractedJsonGroup2).length > 0) {
        const heartData = convertFormDataToMmolL(result.extractedJsonGroup2);
        fetch("https://cardiac-1051190728028.asia-south1.run.app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(heartData),
        })
          .then(res => res.json())
            .then(data => {
              setHeartAutoResult(data);
              if (onRiskResults) onRiskResults(diabeticAutoResult, data);
            })
          .catch(() => setHeartAutoResult(null));
      } else {
        setHeartAutoResult(null);
      }

    }, [result]);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setFromHistory(false);
    setImageZoomed(false);
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
    setFromHistory(false);
    setDiabeticAutoResult(null);
    setHeartAutoResult(null);
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
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

      const raw     = await geminiRes.json();
      const text    = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed: LabAnalysisResult & { error?: string } = JSON.parse(cleaned);

      if (!parsed.isMedical) {
        setError(parsed.error ?? "Not a valid medical lab report.");
        setAnalyzing(false);
        return;
      }

      setResult(parsed);
      setFromHistory(false);

      // Save extracted values to backend for pre-fill
      if (parsed.extractedJsonGroup1 && patientId) {
        PatientService.sendDiabeticData(parsed.extractedJsonGroup1, patientId);
      }
      if (parsed.extractedJsonGroup2 && patientId) {
        PatientService.sendHeartData(parsed.extractedJsonGroup2, patientId);
      }

      // Call parent callback - parent handles all saving logic
      onAnalysisComplete?.(parsed);
      toast.success("Analysis complete");
    } catch (e: any) {
      console.error(e);
      setError("Analysis failed. Ensure the image is clear and try again.");
      toast.error("Analysis Failed");
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // ── Pre-upload / no result ────────────────────────────────────────────────
  if (!file && !result) {
    return (
      <div
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        className="relative glass rounded-[3rem] border-2 border-dashed border-white/10 hover:border-primary/30 transition-all duration-500 p-16 flex flex-col items-center justify-center text-center gap-8"
      >
        <div className="h-28 w-28 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary">
          <FlaskConical className="h-14 w-14" />
        </div>
        <div>
          <h3 className="text-3xl font-black tracking-tight mb-3">Lab Report Analysis</h3>
          <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
            Upload a lab report image for AI analysis, or click a history record above to reload a previous result.
          </p>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="h-16 px-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest border-none hover:scale-105 transition-all text-sm"
        >
          <Upload className="h-5 w-5 mr-3" /> Select Lab Report
        </Button>
        <p className="text-xs text-muted-foreground/40 uppercase tracking-widest">
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

  // ── File selected, not yet analysed ──────────────────────────────────────
  if (file && !result) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-[3rem] border border-white/5 p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                <CheckCircle className="h-7 w-7" />
              </div>
              <div>
                <p className="font-black text-base uppercase tracking-wider">Report Loaded</p>
                <p className="text-xs text-muted-foreground/60 uppercase tracking-widest truncate max-w-[250px]">{file.name}</p>
              </div>
            </div>
            <button
              onClick={clearFile}
              className="h-12 w-12 rounded-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {preview && (
            <div className="rounded-[2rem] overflow-hidden border border-white/5 bg-black/20">
              <img src={preview} alt="Lab report preview" className="w-full max-h-[400px] object-contain" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-destructive/5 border border-destructive/20">
              <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={runAnalysis}
            disabled={analyzing}
            className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest border-none hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 text-sm"
          >
            {analyzing ? (
              <><Loader2 className="h-5 w-5 mr-3 animate-spin" /> Synthesizing Neural Analysis…</>
            ) : (
              <><Microscope className="h-5 w-5 mr-3" /> Run AI Lab Analysis</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Results view (fresh analysis OR history load) ─────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* History badge */}
          {fromHistory && (
            <div className="px-4 py-2 glass rounded-xl border border-violet-500/20 text-xs font-black uppercase tracking-widest text-violet-400">
              From History
            </div>
          )}
          {result?.patientInfo?.age && (
            <div className="px-4 py-2 glass rounded-xl border border-white/5 text-xs font-black uppercase tracking-widest text-muted-foreground">
              Age <span className="text-white ml-1">{result.patientInfo.age}y</span>
            </div>
          )}
          {result?.patientInfo?.gender && (
            <div className="px-4 py-2 glass rounded-xl border border-white/5 text-xs font-black uppercase tracking-widest text-muted-foreground">
              Gender <span className="text-white ml-1">{result.patientInfo.gender}</span>
            </div>
          )}

        {diabeticAutoResult?.diabetes_risk_percentage && (
          <div className="px-4 py-2 border rounded-lg text-xs text-yellow-600">
            Diabetic Risk {diabeticAutoResult.diabetes_risk_percentage.toFixed(1)}%
          </div>
        )}

        {heartAutoResult?.confidence && (
          <div className="px-4 py-2 border rounded-lg text-xs text-pink-600">
            Heart Risk {heartAutoResult.confidence.toFixed(1)}%
          </div>
        )}
          {abnormalCount > 0 && (
            <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-black uppercase tracking-widest text-rose-400">
              {abnormalCount} Abnormal {abnormalCount === 1 ? "Value" : "Values"}
            </div>
          )}
        </div>
        <button
          onClick={clearFile}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-colors"
        >
          <X className="h-4 w-4" /> {fromHistory ? "Clear" : "New Report"}
        </button>
      </div>

      {/* ── Split view ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT: source image (upload) OR history placeholder */}
        <div className="glass rounded-[3rem] border border-white/5 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                {fromHistory ? "History Record" : "Source Document"}
              </span>
            </div>
            {preview && (
              <button
                onClick={() => setImageZoomed(z => !z)}
                className="h-10 w-10 rounded-lg border border-white/10 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
              >
                {imageZoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              </button>
            )}
          </div>

          <div
            className={`relative flex-1 overflow-auto bg-black/20 ${preview ? (imageZoomed ? "cursor-zoom-out" : "cursor-zoom-in") : ""}`}
            onClick={() => preview && setImageZoomed(z => !z)}
            style={{ minHeight: "280px" }}
          >
            {preview ? (
              <img
                src={preview}
                alt="Lab report"
                className={`transition-all duration-500 ${imageZoomed ? "w-full object-cover" : "w-full h-full object-contain p-4"}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <BarChart2 className="h-14 w-14 text-muted-foreground/20" />
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/30">
                  Loaded from patient history
                </p>
                {result?.summary && (
                  <p className="text-sm text-muted-foreground/50 italic leading-relaxed max-w-xs line-clamp-4">
                    &quot;{result.summary}&quot;
                  </p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="mt-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                >
                  <Upload className="h-4 w-4" /> Upload new report
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            )}
          </div>

          {preview && (
            <div className="px-8 py-4 border-t border-white/5 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/30 uppercase tracking-widest font-black">
                {imageZoomed ? "Click to Fit" : "Click to Zoom"}
              </p>
            </div>
          )}
        </div>
        {/* RIGHT: summary + tabs */}
        <div className="flex flex-col gap-6">
          {/* Clinical Summary */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2.5rem]">
            <CardContent className="p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Activity className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Clinical Summary</h3>
              </div>
              <p className="text-sm md:text-lg text-foreground/80 leading-loose">
                &quot;{result!.summary}&quot;
              </p>
              
              {/* Daily Health Advice */}
              {result!.dailyHealthAdvice && result!.dailyHealthAdvice.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-emerald-400">Daily Health Guidance</h4>
                  </div>
                  <ul className="space-y-3">
                    {result!.dailyHealthAdvice.map((advice, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-foreground/70 leading-relaxed">
                        <ChevronRight className="h-4 w-4 text-emerald-400 mt-1 shrink-0" />
                        <span className="text-sm md:text-lg">{advice}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabbed results */}
          <div className="flex-1">
            <Tabs defaultValue="comparison" className="h-full flex flex-col"
              onValueChange={val => {
                if (val === "recommended") {
                  setDiagnosticRefresh(r => r + 1);
                }
              }}
            >
              <TabsList className="h-16 bg-white/5 border border-white/5 rounded-2xl p-1.5 gap-1.5 self-start mb-4 w-full">
                <TabsTrigger
                  value="comparison"
                  className="flex-1 flex items-center gap-2 rounded-xl text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Microscope className="h-4 w-4" /> Lab Values
                </TabsTrigger>
                <TabsTrigger
                  value="recommended"
                  className="flex-1 flex items-center gap-2 rounded-xl text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <ClipboardList className="h-4 w-4" /> Next Tests
                  {result!.recommendedTests && result!.recommendedTests.length > 0 && (
                    <span className="ml-1 h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">
                      {result!.recommendedTests.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Lab Values table */}
              <TabsContent value="comparison" className="flex-1 mt-0">
                <div className="glass rounded-[2rem] border border-white/5 overflow-hidden">
                  {result!.labComparison && result!.labComparison.length > 0 ? (
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
                            <th className="text-left px-6 py-4 font-black uppercase tracking-widest text-muted-foreground text-xs">Test</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground text-xs">Result</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground text-xs">Range</th>
                            <th className="text-left px-4 py-4 font-black uppercase tracking-widest text-muted-foreground text-xs">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result!.labComparison.map((row, i) => {
                            const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.Normal;
                            return (
                              <tr key={i} className={`border-b border-white/5 last:border-0 transition-colors ${cfg.row}`}>
                                <td className="px-6 py-4 font-bold text-sm">{row.test}</td>
                                <td className="px-4 py-4 font-black text-sm">{row.actualValue}</td>
                                <td className="px-4 py-4 text-muted-foreground/60 font-medium text-sm">{row.normalRange}</td>
                                <td className="px-4 py-4">
                                  <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${cfg.badge}`}>
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
                    <div className="p-12 text-center text-muted-foreground/30 italic text-sm">
                      No lab values could be extracted.
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Recommended tests */}
              <TabsContent value="recommended" className="flex-1 mt-0">
                <div className="glass rounded-[2rem] border border-white/5 overflow-hidden p-6">
                  {/* DiagnosticButtons added here */}
                  <DiagnosticButtons
                    key={diagnosticRefresh + '-' + JSON.stringify(result?.extractedJsonGroup1) + JSON.stringify(result?.extractedJsonGroup2)}
                    extractedGroup1={result?.extractedJsonGroup1}
                    extractedGroup2={result?.extractedJsonGroup2}
                  />
                  {!result!.recommendedTests || result!.recommendedTests.length === 0 ? (
                    <div className="text-center py-10">
                      <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4 opacity-50" />
                      <p className="font-black text-emerald-400 uppercase tracking-widest text-base mb-2">All Values Normal</p>
                      <p className="text-sm text-muted-foreground">No follow-up tests required at this time.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 overflow-y-auto max-h-[460px]">
                      {result!.recommendedTests.map((test, i) => {
                        const dashIdx = test.indexOf(" - ");
                        const name   = dashIdx !== -1 ? test.slice(0, dashIdx) : test;
                        const reason = dashIdx !== -1 ? test.slice(dashIdx + 3) : "";
                        return (
                          <div key={i} className="flex items-start gap-4 p-6 rounded-[1.5rem] bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all group cursor-default">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-black shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-base mb-1">{name}</p>
                              {reason && <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground/20 group-hover:text-primary/60 transition-all shrink-0 mt-1" />
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