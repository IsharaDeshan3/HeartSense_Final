"use client";

import { useState, useEffect, useRef } from "react";
import {
  BrainCircuit,
  Mic,
  Activity,
  Microscope,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCcw,
  XCircle,
  Timer,
  Zap,
  HeartPulse,
  FlaskConical,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DiagnosticService,
  type AnalysisResponse,
} from "@/services/DiagnosticService";
import { WorkflowService } from "@/services/WorkflowService";
import {
  buildSymptomsPayload,
  buildECGPayload,
  buildLabPayload,
  type EcgResult,
} from "@/lib/diagnosticMapper";
import type { LabAnalysisResult } from "@/components/LabSuggester";
import DiagnosticResult from "@/components/DiagnosticResult";
import PipelineWorkflow from "@/components/PipelineWorkflow";

// ─── Types ──────────────────────────────────────────────────────────────────

type ExperienceLevel = "newbie" | "seasoned" | "expert";

interface AiDiagnosticsProps {
  symptoms: string[];
  riskFactors: string[];
  recentObservation: string;
  patientAge?: number;
  patientGender?: string;
  ecgResult?: EcgResult | null;
  labResult?: LabAnalysisResult | null;
  workflowSessionId?: string | null;
  ecgSkipped?: boolean;
  labSkipped?: boolean;
}

const EXPERIENCE_OPTIONS: {
  value: ExperienceLevel;
  label: string;
  desc: string;
}[] = [
    { value: "newbie", label: "Newbie", desc: "Detailed explanations" },
    { value: "seasoned", label: "Seasoned", desc: "Standard clinical" },
    { value: "expert", label: "Expert", desc: "Concise & technical" },
  ];

const PIPELINE_STEP_LABELS: Record<string, string> = {
  session_init: "Session Init",
  faiss_search: "Knowledge Retrieval",
  rare_case_search: "Rare Case Check",
  supabase_save_payload: "Saving Payload",
  kra_analysis: "KRA Reasoning",
  supabase_save_kra: "Saving KRA Output",
  ora_refinement: "ORA Refinement",
  supabase_save_ora: "Finalizing",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AiDiagnostics({
  symptoms,
  riskFactors,
  recentObservation,
  patientAge,
  patientGender,
  ecgResult,
  labResult,
  workflowSessionId,
  ecgSkipped = false,
  labSkipped = false,
}: AiDiagnosticsProps) {
  const [experience, setExperience] = useState<ExperienceLevel>("seasoned");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [oraMode, setOraMode] = useState<"newbie" | "expert">("newbie");
  const [currentPipelineStep, setCurrentPipelineStep] = useState<string | undefined>();
  const [completedPipelineSteps, setCompletedPipelineSteps] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Data readiness flags
  const hasNlp =
    symptoms.length > 0 ||
    (recentObservation !== "Awaiting clinical input..." &&
      recentObservation.length > 5);
  const hasEcg = !!ecgResult;
  const hasLab = !!labResult;
  const canRun = hasNlp; // NLP/symptoms is the minimum requirement
  const dataSourceCount = [hasNlp, hasEcg, hasLab].filter(Boolean).length;

  // Health check on mount
  useEffect(() => {
    DiagnosticService.checkHealth().then((h) => {
      setIsHealthy(h.status === "ok" || h.status === "degraded");
    });
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setCurrentPipelineStep("session_init");
    setCompletedPipelineSteps([]);
    toast.info("Diagnostic pipeline initiated — this may take 30-120s…");

    // Simulate step progression (the backend doesn't stream steps yet)
    const steps = [
      { key: "session_init", delay: 500 },
      { key: "faiss_search", delay: 2000 },
      { key: "rare_case_search", delay: 3000 },
      { key: "supabase_save_payload", delay: 2000 },
      { key: "kra_analysis", delay: 0 }, // will stay here until done
    ];
    let cancelled = false;
    (async () => {
      for (const step of steps) {
        if (cancelled) return;
        setCurrentPipelineStep(step.key);
        if (step.delay > 0) {
          await new Promise(r => setTimeout(r, step.delay));
          if (cancelled) return;
          setCompletedPipelineSteps(prev => [...prev, step.key]);
        }
      }
    })();

    try {
      const symptomsPayload = buildSymptomsPayload(
        symptoms,
        riskFactors,
        recentObservation,
        patientAge,
        patientGender,
      );
      const ecgPayload = buildECGPayload(ecgResult, ecgSkipped);
      const labPayload = buildLabPayload(labResult, labSkipped);

      let res: AnalysisResponse;

      // Workflow session is the source of truth for stored extraction/ECG/lab
      // payloads and Supabase link-chaining to KRA/ORA.
      const useWorkflow = !!workflowSessionId;

      if (useWorkflow) {
        const workflowRes = await WorkflowService.runAnalysis(workflowSessionId, experience);
        res = {
          session_id: workflowRes.session_id,
          status: workflowRes.status,
          supabase_payload_id: workflowRes.supabase_payload_id,
          supabase_kra_id: workflowRes.supabase_kra_id,
          supabase_ora_id: workflowRes.supabase_ora_id,
          experience_level: workflowRes.experience_level,
          processing_steps: workflowRes.processing_steps,
          total_duration_ms: workflowRes.total_duration_ms,
          kra_raw: workflowRes.kra_raw,
          ora_outputs: workflowRes.ora_outputs,
          ora_disclaimers: workflowRes.ora_disclaimers,
          rare_case_alert: workflowRes.rare_case_alert as any,
          refined_output:
            workflowRes.ora_outputs?.newbie ||
            workflowRes.refined_output ||
            (workflowRes.context_preview
              ? `### Phase C Partial\n\nContext prepared but ORA output missing.\n\n**Context Preview**\n${workflowRes.context_preview}`
              : "### Phase C Partial\n\nContext prepared but ORA output missing."),
          disclaimer:
            workflowRes.ora_disclaimers?.newbie || workflowRes.disclaimer,
        } as AnalysisResponse;
        setOraMode("newbie");
      } else {
        res = await DiagnosticService.runDiagnosis({
          symptoms: symptomsPayload,
          ecg: ecgPayload,
          labs: labPayload,
          experience_level: experience,
        });
      }

      // Mark remaining steps as completed
      cancelled = true;
      const allStepKeys = Object.keys(PIPELINE_STEP_LABELS);
      setCompletedPipelineSteps(allStepKeys);
      setCurrentPipelineStep(undefined);
      setResult(res);

      if (res.status === "COMPLETED") {
        toast.success("AI Diagnostic Analysis Complete");
      } else if (res.status === "PARTIAL") {
        toast.warning("Partial result — some pipeline steps failed");
      } else {
        toast.error("Diagnostic pipeline failed");
      }
    } catch (err: any) {
      cancelled = true;
      const msg = err.message || "Failed to run diagnostic pipeline";
      setCurrentPipelineStep(undefined);
      setError(msg);
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-5xl mx-auto">
      {/* ─── Data Readiness Panel ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DataSourceCard
          icon={<Mic className="h-5 w-5" />}
          label="NLP / Symptoms"
          ready={hasNlp}
          detail={
            hasNlp
              ? `${symptoms.length} symptom${symptoms.length !== 1 ? "s" : ""}, ${riskFactors.length} risk factor${riskFactors.length !== 1 ? "s" : ""}`
              : "Awaiting NLP input"
          }
          items={symptoms.slice(0, 4)}
        />
        <DataSourceCard
          icon={<Activity className="h-5 w-5" />}
          label="ECG Analysis"
          ready={hasEcg}
          detail={
            hasEcg
              ? `${ecgResult!.rhythm_analysis.rhythm_type} — ${ecgResult!.rhythm_analysis.heart_rate} BPM`
              : "Awaiting ECG analysis"
          }
          items={
            hasEcg ? ecgResult!.abnormalities.abnormalities.slice(0, 3) : []
          }
        />
        <DataSourceCard
          icon={<Microscope className="h-5 w-5" />}
          label="Lab Results"
          ready={hasLab}
          detail={
            hasLab
              ? `${labResult!.labComparison.length} tests analyzed`
              : "Awaiting lab data"
          }
          items={
            hasLab
              ? labResult!.labComparison
                .filter((l) => l.status !== "Normal")
                .slice(0, 3)
                .map((l) => `${l.test}: ${l.status}`)
              : []
          }
        />
      </div>

      {/* ─── Controls Bar ───────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
        {/* Experience Level Selector */}
        <div className="space-y-2">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            Experience Level
          </p>
          <div className="flex gap-2">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExperience(opt.value)}
                disabled={isRunning}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${experience === opt.value
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-white"
                  } disabled:opacity-50`}
              >
                <span className="block">{opt.label}</span>
                <span className="block text-[8px] font-normal opacity-70 mt-0.5">
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Run / Status */}
        <div className="flex items-center gap-4">
          {isHealthy === false && (
            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[9px]">
              Service Offline
            </Badge>
          )}

          {isRunning && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5 animate-pulse text-primary" />
              {elapsed}s elapsed
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={!canRun || isRunning}
            className="h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg glow-primary border-none text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…
              </>
            ) : result ? (
              <>
                <RefreshCcw className="h-4 w-4 mr-2" /> Re-run Diagnosis
              </>
            ) : (
              <>
                <BrainCircuit className="h-4 w-4 mr-2" /> Run AI Diagnosis
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Pipeline Workflow Visualization ──────────────────────────── */}
      <PipelineWorkflow
        isRunning={isRunning}
        currentStep={currentPipelineStep}
        completedSteps={completedPipelineSteps}
      />

      {/* Minimum-data hint */}
      {!canRun && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300/80">
            At least NLP symptom data is required before running the diagnostic
            pipeline. Process a voice recording or enter symptoms in the NLP tab
            first.
          </p>
        </div>
      )}

      {/* Data source count indicator */}
      {canRun && !isRunning && !result && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-primary/80">
            {dataSourceCount === 1
              ? "1 data source ready. Adding ECG or Lab data will improve diagnostic accuracy."
              : dataSourceCount === 2
                ? "2 data sources ready. Adding the third will provide the most comprehensive analysis."
                : "All 3 data sources ready. You can run the full diagnostic pipeline."}
          </p>
        </div>
      )}

      {/* ─── Error Display ──────────────────────────────────────────────── */}
      {error && !isRunning && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-rose-400" />
            <p className="text-sm text-rose-400 font-bold">
              Diagnostic Pipeline Error
            </p>
          </div>
          <p className="text-xs text-rose-300/70 leading-relaxed">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={!canRun}
            className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 mt-2"
          >
            <RefreshCcw className="h-3 w-3 mr-2" /> Retry
          </Button>
        </div>
      )}

      {result?.ora_outputs && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/[0.02] w-fit">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-2">
            ORA Output Mode
          </span>
          <Button
            type="button"
            size="sm"
            variant={oraMode === "newbie" ? "default" : "outline"}
            className="h-8 rounded-lg"
            onClick={() => {
              setOraMode("newbie");
              setResult((prev) =>
                prev
                  ? {
                    ...prev,
                    refined_output: prev.ora_outputs?.newbie ?? prev.refined_output,
                    disclaimer: prev.ora_disclaimers?.newbie ?? prev.disclaimer,
                  }
                  : prev,
              );
            }}
          >
            Newbie
          </Button>
          <Button
            type="button"
            size="sm"
            variant={oraMode === "expert" ? "default" : "outline"}
            className="h-8 rounded-lg"
            onClick={() => {
              setOraMode("expert");
              setResult((prev) =>
                prev
                  ? {
                    ...prev,
                    refined_output: prev.ora_outputs?.expert ?? prev.refined_output,
                    disclaimer: prev.ora_disclaimers?.expert ?? prev.disclaimer,
                  }
                  : prev,
              );
            }}
          >
            Expert
          </Button>
        </div>
      )}

      {/* ─── Results ────────────────────────────────────────────────────── */}
      {result && !isRunning && <DiagnosticResult response={result} />}

      {/* ─── Skip Recommendations ────────────────────────────────────────── */}
      {(ecgSkipped || labSkipped) && (
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Recommended Follow-up (Skipped Steps)
          </h3>

          {ecgSkipped && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <HeartPulse className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-300">ECG Analysis Recommended</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Skipped in this session</p>
                </div>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">
                An ECG provides critical insight into the heart&apos;s electrical activity and is essential for detecting arrhythmias, ischemia, and structural abnormalities. Based on the reported symptoms, an ECG would help:
              </p>
              <ul className="space-y-2">
                {[
                  { reason: "Detect irregular heart rhythms (arrhythmias) that may cause palpitations or syncope", priority: "High" },
                  { reason: "Identify signs of myocardial ischemia or infarction (heart attack markers)", priority: "High" },
                  { reason: "Evaluate ST-segment changes indicating acute coronary syndrome", priority: "High" },
                  { reason: "Assess QT interval prolongation which increases sudden cardiac death risk", priority: "Medium" },
                  { reason: "Detect ventricular hypertrophy suggesting chronic hypertension or cardiomyopathy", priority: "Medium" },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs">
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <ChevronRight className="h-3 w-3 text-amber-400" />
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${item.priority === "High" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {item.priority}
                      </span>
                    </div>
                    <span className="text-foreground/70">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {labSkipped && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-300">Initial Lab Tests Suggested</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Baseline screening for cardiac risk</p>
                </div>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">
                The following lab tests are recommended as an initial screening to identify cardiac risk factors and underlying conditions:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { test: "Complete Blood Count (CBC)", reason: "Rule out anemia, infection, and inflammatory conditions" },
                  { test: "Lipid Panel", reason: "Assess cholesterol (Total, HDL, LDL, Triglycerides) for cardiovascular risk" },
                  { test: "Fasting Blood Glucose / HbA1c", reason: "Screen for diabetes, a major cardiac risk factor" },
                  { test: "Serum Creatinine & BUN", reason: "Evaluate kidney function; renal impairment affects cardiac health" },
                  { test: "Troponin I/T", reason: "Detect myocardial injury if acute chest pain is present" },
                  { test: "BNP / NT-proBNP", reason: "Assess for heart failure if dyspnea or edema is reported" },
                  { test: "Thyroid Function (TSH)", reason: "Thyroid disorders can cause palpitations and arrhythmias" },
                  { test: "Electrolytes (Na, K, Ca, Mg)", reason: "Imbalances can trigger arrhythmias and affect heart function" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <ChevronRight className="h-3 w-3 text-blue-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-blue-300">{item.test}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Data Source Card ───────────────────────────────────────────────────────

function DataSourceCard({
  icon,
  label,
  ready,
  detail,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  ready: boolean;
  detail: string;
  items: string[];
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-all ${ready
        ? "border-emerald-500/20 bg-emerald-500/[0.03]"
        : "border-white/5 bg-white/[0.01]"
        }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center ${ready
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-white/5 text-muted-foreground"
              }`}
          >
            {icon}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        </div>
        {ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-white/10" />
        )}
      </div>
      <p
        className={`text-xs font-medium ${ready ? "text-white" : "text-muted-foreground italic"}`}
      >
        {detail}
      </p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {items.map((item, i) => (
            <span
              key={i}
              className="text-[8px] font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
