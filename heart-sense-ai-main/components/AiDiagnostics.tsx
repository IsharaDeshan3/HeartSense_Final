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
import { toast } from "sonner";
import {
  type AnalysisResponse,
} from "@/services/DiagnosticService";
import { WorkflowService } from "@/services/WorkflowService";
import type { PatientDiagnosisRecord, WorkflowState } from "@/services/WorkflowService";
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

interface AiDiagnosticsProps {
  patientId: string;
  symptoms: string[];
  riskFactors: string[];
  recentObservation: string;
  patientAge?: number;
  patientGender?: string;
  ecgResult?: EcgResult | null;
  labResult?: LabAnalysisResult | null;
  workflowSessionId?: string | null;
  workflowState?: WorkflowState | null;
  ecgSkipped?: boolean;
  labSkipped?: boolean;
  onWorkflowStateChange?: (state: WorkflowState) => void;
}

type AnalysisProgressCache = {
  isRunning: boolean;
  startedAt: number | null;
  currentPipelineStep?: string;
  completedPipelineSteps: string[];
};

function getAnalysisProgressKey(sessionId: string) {
  return `workspace:analysis-progress:${sessionId}`;
}

const PIPELINE_STEP_LABELS: Record<string, string> = {
  session_init: "Workflow Session Ready",
  faiss_search: "Knowledge Retrieval",
  rare_case_search: "Rare Case Check",
  supabase_save_payload: "Saving Payload",
  kra_analysis: "KRA Reasoning",
  supabase_save_kra: "Saving KRA Output",
  ora_refinement: "ORA Refinement",
  supabase_save_ora: "Finalizing",
};

function normalizeOraMode(experienceLevel?: string | null): "newbie" | "seasoned" {
  return String(experienceLevel || "").toLowerCase() === "newbie" ? "newbie" : "seasoned";
}

function mapPersistedRecordToAnalysisResponse(record: PatientDiagnosisRecord): AnalysisResponse {
  const preferredMode = normalizeOraMode(record.experience_level);
  const refinedOutput = record.refined_output?.trim();
  const disclaimer = record.disclaimer?.trim();
  const persistedOutputs = record.ora_outputs;
  const persistedDisclaimers = record.ora_disclaimers;

  const newbieOutput = persistedOutputs?.newbie?.trim();
  const seasonedOutput = persistedOutputs?.seasoned?.trim();
  const newbieDisclaimer = persistedDisclaimers?.newbie?.trim();
  const seasonedDisclaimer = persistedDisclaimers?.seasoned?.trim();

  const selectedOutput =
    (preferredMode === "newbie" ? newbieOutput : seasonedOutput) ||
    seasonedOutput ||
    newbieOutput ||
    refinedOutput;
  const selectedDisclaimer =
    (preferredMode === "newbie" ? newbieDisclaimer : seasonedDisclaimer) ||
    seasonedDisclaimer ||
    newbieDisclaimer ||
    disclaimer;

  return {
    session_id: record.session_id,
    status: selectedOutput ? "COMPLETED" : "PARTIAL",
    supabase_payload_id: record.payload_id,
    supabase_kra_id: record.kra_id,
    supabase_ora_id: record.ora_id,
    experience_level: preferredMode,
    processing_steps: [],
    kra_raw: record.kra_raw_text,
    ora_outputs: selectedOutput
      ? {
        newbie: newbieOutput || selectedOutput,
        seasoned: seasonedOutput || selectedOutput,
      }
      : undefined,
    ora_disclaimers: selectedDisclaimer
      ? {
        newbie: newbieDisclaimer || selectedDisclaimer,
        seasoned: seasonedDisclaimer || selectedDisclaimer,
      }
      : undefined,
    refined_output:
      selectedOutput ||
      "### Analysis Complete\n\nThe workflow completed, but no ORA report text was available in the persisted record.",
    disclaimer: selectedDisclaimer,
  };
}

function applyOraModeToResponse(
  response: AnalysisResponse,
  mode: "newbie" | "seasoned",
): AnalysisResponse {
  const rawNewbie = response.ora_outputs?.newbie?.trim() || "";
  const rawSeasoned = response.ora_outputs?.seasoned?.trim() || "";
  const modeText = mode === "newbie" ? rawNewbie : rawSeasoned;
  const fallbackText = rawSeasoned || rawNewbie || response.refined_output || "";
  const bothPresent = Boolean(rawNewbie && rawSeasoned);
  const equalOutputs = bothPresent && rawNewbie === rawSeasoned;
  const modeLabel = mode === "newbie" ? "Newbie" : "Seasoned";
  const displayText = modeText || fallbackText;
  const refinedText =
    displayText && equalOutputs
      ? `### ${modeLabel} Output\n\n${displayText}`
      : displayText;

  const rawNewbieDisclaimer = response.ora_disclaimers?.newbie?.trim() || "";
  const rawSeasonedDisclaimer = response.ora_disclaimers?.seasoned?.trim() || "";
  const disclaimer =
    (mode === "newbie" ? rawNewbieDisclaimer : rawSeasonedDisclaimer) ||
    rawSeasonedDisclaimer ||
    rawNewbieDisclaimer ||
    response.disclaimer;

  return {
    ...response,
    refined_output: refinedText,
    disclaimer,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AiDiagnostics({
  patientId,
  symptoms,
  riskFactors,
  recentObservation,
  patientAge,
  patientGender,
  ecgResult,
  labResult,
  workflowSessionId,
  workflowState,
  ecgSkipped = false,
  labSkipped = false,
  onWorkflowStateChange,
}: AiDiagnosticsProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [oraMode, setOraMode] = useState<"newbie" | "seasoned">("newbie");
  const [currentPipelineStep, setCurrentPipelineStep] = useState<string | undefined>();
  const [completedPipelineSteps, setCompletedPipelineSteps] = useState<string[]>([]);
  const [failedPipelineStep, setFailedPipelineStep] = useState<string | undefined>();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stopAnalysisUi = (options?: {
    clearError?: boolean;
    errorMessage?: string | null;
    failedStep?: string;
    keepCompletedSteps?: boolean;
  }) => {
    const clearError = options?.clearError ?? false;
    setIsRunning(false);
    startedAtRef.current = null;
    setElapsed(0);
    setCurrentPipelineStep(undefined);
    setFailedPipelineStep(options?.failedStep);
    if (!options?.keepCompletedSteps) {
      setCompletedPipelineSteps([]);
    }
    if (clearError) {
      setError(null);
    } else {
      setError(options?.errorMessage ?? null);
    }
  };

  const recoverPersistedResult = async () => {
    if (!patientId || !workflowSessionId) return null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const record = await WorkflowService.getPatientDiagnosisRecord(patientId, workflowSessionId);
      if (record && (record.refined_output?.trim() || record.kra_raw_text?.trim())) {
        return mapPersistedRecordToAnalysisResponse(record);
      }

      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return null;
  };

  const waitForWorkflowState = async (
    sessionId: string,
    acceptableStates: WorkflowState[],
    timeoutMs = 8000,
  ) => {
    const deadline = Date.now() + timeoutMs;
    let session = await WorkflowService.getSession(sessionId);

    while (!acceptableStates.includes(session.current_state) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      session = await WorkflowService.getSession(sessionId);
    }

    return session;
  };

  // Data readiness flags
  const hasNlp =
    symptoms.length > 0 ||
    (recentObservation !== "Awaiting clinical input..." &&
      recentObservation.length > 5);
  const hasEcg = !!ecgResult;
  const hasLab = !!labResult;
  const isWorkflowAnalysisRunning = workflowState === "ANALYSIS_RUNNING";
  const canRun = hasNlp && !isWorkflowAnalysisRunning; // NLP/symptoms is the minimum requirement
  const dataSourceCount = [hasNlp, hasEcg, hasLab].filter(Boolean).length;

  // Elapsed timer
  useEffect(() => {
    if (isRunning) {
      if (!startedAtRef.current) {
        startedAtRef.current = Date.now();
      }
      const tick = () => {
        if (!startedAtRef.current) return;
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!workflowSessionId || typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(getAnalysisProgressKey(workflowSessionId));
      if (!raw) return;
      const cached = JSON.parse(raw) as AnalysisProgressCache;
      setCurrentPipelineStep(cached.currentPipelineStep);
      setCompletedPipelineSteps(Array.isArray(cached.completedPipelineSteps) ? cached.completedPipelineSteps : []);

      if (cached.startedAt) {
        startedAtRef.current = cached.startedAt;
        setElapsed(Math.max(0, Math.floor((Date.now() - cached.startedAt) / 1000)));
      } else {
        startedAtRef.current = null;
        setElapsed(0);
      }

      if (cached.isRunning) {
        setIsRunning(true);
      }
    } catch {
      // ignore invalid cache
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowSessionId]);

  useEffect(() => {
    if (!workflowSessionId || typeof window === "undefined") return;

    const startedAt = isRunning ? startedAtRef.current : null;
    if (!isRunning) {
      startedAtRef.current = null;
    }

    const payload: AnalysisProgressCache = {
      isRunning,
      startedAt,
      currentPipelineStep,
      completedPipelineSteps,
    };
    window.localStorage.setItem(getAnalysisProgressKey(workflowSessionId), JSON.stringify(payload));
  }, [workflowSessionId, isRunning, currentPipelineStep, completedPipelineSteps]);

  useEffect(() => {
    if (workflowState === "ANALYSIS_RUNNING") return;
    if (!isRunning && startedAtRef.current === null) return;

    setIsRunning(false);
    startedAtRef.current = null;
    setElapsed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowState]);

  useEffect(() => {
    if (!workflowSessionId || workflowState !== "ANALYSIS_RUNNING") return;

    const poll = setInterval(async () => {
      try {
        const session = await WorkflowService.getSession(workflowSessionId);
        if (session.current_state !== "ANALYSIS_RUNNING") {
          if (session.current_state === "ANALYSIS_DONE" && !result) {
            try {
              const recovered = await recoverPersistedResult();
              if (recovered) {
                const recoveredMode = normalizeOraMode(recovered.experience_level);
                setOraMode(recoveredMode);
                setResult(applyOraModeToResponse(recovered, recoveredMode));
                setFailedPipelineStep(undefined);
                stopAnalysisUi({ clearError: true, keepCompletedSteps: true });
                onWorkflowStateChange?.("ANALYSIS_DONE");
                toast.success("Recovered completed analysis result");
                return;
              }
            } catch {
              // fall through to normal state cleanup
            }
          }

          stopAnalysisUi({
            clearError: session.current_state !== "FAILED",
            errorMessage: session.current_state === "FAILED" ? "Analysis failed" : null,
            failedStep: session.current_state === "FAILED" ? failedPipelineStep : undefined,
            keepCompletedSteps: true,
          });
          onWorkflowStateChange?.(session.current_state);
        }
      } catch {
        // keep polling through transient errors
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [workflowSessionId, workflowState, onWorkflowStateChange, failedPipelineStep, result, patientId]);

  const handleRun = async () => {
    if (isWorkflowAnalysisRunning) {
      toast.info("Analysis is already running for this session. Please wait for completion.");
      return;
    }

    if (workflowSessionId) {
      try {
        const session = await WorkflowService.getSession(workflowSessionId);
        if (session.current_state === "ANALYSIS_RUNNING") {
          toast.info("Previous analysis is still stopping. Waiting for the session to settle...");
          const settled = await waitForWorkflowState(workflowSessionId, ["LAB_DONE", "ANALYSIS_DONE", "FAILED"], 8000);
          if (settled.current_state === "ANALYSIS_RUNNING") {
            toast.warning("Analysis is still shutting down. Please retry in a few seconds.");
            return;
          }
          onWorkflowStateChange?.(settled.current_state as WorkflowState);
        }
      } catch {
        // If the session lookup fails, fall through and let the run request
        // report the real backend error.
      }
    }

    setIsRunning(true);
    startedAtRef.current = Date.now();
    setError(null);
    setResult(null);
    setFailedPipelineStep(undefined);
    setCurrentPipelineStep("faiss_search");
    setCompletedPipelineSteps([]);
    toast.info("Diagnostic pipeline initiated — CPU inference may take 3-5 minutes…");

    // Real-time pipeline step streaming via SSE.  Subscribe BEFORE calling
    // runAnalysis so that no early events are missed.
    let eventSource: EventSource | null = null;
    let terminalEventSeen = false;
    if (workflowSessionId) {
      eventSource = WorkflowService.openAnalysisEventStream(workflowSessionId);
      eventSource.onmessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as { step?: string; status?: string; message?: string };
          if (event.status === "started") {
            setCurrentPipelineStep(event.step);
          } else if (event.status === "completed") {
            if (event.step !== "analysis_done") {
              setCurrentPipelineStep(event.step);
            }
            setCompletedPipelineSteps(prev =>
              event.step && prev.includes(event.step) ? prev : event.step ? [...prev, event.step] : prev
            );
          } else if (event.status === "error") {
            terminalEventSeen = true;
            eventSource?.close();
            eventSource = null;
            stopAnalysisUi({
              errorMessage: event.message || "Analysis failed",
              failedStep: event.step || currentPipelineStep || "session_init",
              keepCompletedSteps: true,
            });
            onWorkflowStateChange?.("LAB_DONE" as WorkflowState);
          } else if (event.status === "cancelled") {
            terminalEventSeen = true;
            eventSource?.close();
            eventSource = null;
            stopAnalysisUi({ clearError: true, keepCompletedSteps: true });
            onWorkflowStateChange?.("LAB_DONE" as WorkflowState);
          }
        } catch {
          // ignore JSON parse errors
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
      };
    }
    let keepTrackingAfterRequestDrop = false;

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
        onWorkflowStateChange?.("ANALYSIS_RUNNING" as WorkflowState);
        const workflowRes = await WorkflowService.runAnalysis(workflowSessionId);
        if (workflowRes.supabase_available === false) {
          toast.warning("Analysis completed, but Supabase persistence fell back to local IDs.");
        }
        const selectedOraMode: "newbie" | "seasoned" =
          workflowRes.ora_outputs?.seasoned ? "seasoned" : "newbie";
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
            workflowRes.refined_output ||
            (workflowRes.context_preview
              ? `### Phase C Partial\n\nContext prepared but ORA output missing.\n\n**Context Preview**\n${workflowRes.context_preview}`
              : "### Phase C Partial\n\nContext prepared but ORA output missing."),
          disclaimer: workflowRes.disclaimer,
        } as AnalysisResponse;
        res = applyOraModeToResponse(res, selectedOraMode);
        setOraMode(selectedOraMode);
      } else {
        throw new Error("Workflow session not ready for analysis");
      }

      // Mark remaining steps as completed and close SSE stream
      eventSource?.close();
      eventSource = null;
      setFailedPipelineStep(undefined);
      const allStepKeys = Object.keys(PIPELINE_STEP_LABELS);
      setCompletedPipelineSteps((prev) => Array.from(new Set([...prev, ...allStepKeys])));
      setCurrentPipelineStep(undefined);
      startedAtRef.current = null;
      setElapsed(0);
      setResult(res);

      if (res.status === "COMPLETED") {
        onWorkflowStateChange?.("ANALYSIS_DONE" as WorkflowState);
        toast.success("AI Diagnostic Analysis Complete");
      } else if (res.status === "PARTIAL") {
        onWorkflowStateChange?.("ANALYSIS_DONE" as WorkflowState);
        toast.warning("Partial result — some pipeline steps failed");
      } else {
        onWorkflowStateChange?.("FAILED" as WorkflowState);
        toast.error("Diagnostic pipeline failed");
      }
    } catch (err: any) {
      eventSource?.close();
      eventSource = null;
      const msg = err.message || "Failed to run diagnostic pipeline";
      setCurrentPipelineStep(undefined);

      if (workflowSessionId && patientId) {
        const isProxyDrop =
          msg.includes("[502]") ||
          msg.includes("Cannot reach workflow backend") ||
          msg.includes("fetch failed") ||
          msg.includes("upstream") ||
          msg.includes("timeout");

        if (isProxyDrop) {
          try {
            const session = await WorkflowService.getSession(workflowSessionId);

            if (session.current_state === "ANALYSIS_RUNNING") {
              keepTrackingAfterRequestDrop = true;
              setError(null);
              toast.warning("The long response dropped, but analysis is still running. Live tracking will continue.");
              return;
            }

            if (session.current_state === "ANALYSIS_DONE") {
              const recovered = await recoverPersistedResult();
              if (recovered) {
                const recoveredMode = normalizeOraMode(recovered.experience_level);
                setOraMode(recoveredMode);
                setResult(applyOraModeToResponse(recovered, recoveredMode));
                setFailedPipelineStep(undefined);
                setError(null);
                onWorkflowStateChange?.("ANALYSIS_DONE" as WorkflowState);
                toast.success("Analysis completed. Recovered saved result after the long request disconnected.");
                return;
              }
            }
          } catch {
            // fall through to normal error handling
          }
        }
      }

      if (msg.includes("ANALYSIS_CANCELLED")) {
        stopAnalysisUi({ clearError: true, keepCompletedSteps: true });
        onWorkflowStateChange?.("LAB_DONE" as WorkflowState);
        toast.info("Analysis stopped");
      } else {
        if (!terminalEventSeen) {
          stopAnalysisUi({
            errorMessage: msg,
            failedStep: currentPipelineStep || "session_init",
            keepCompletedSteps: true,
          });
        }
        // Rollback state on error (backend also rolls back to LAB_DONE)
        onWorkflowStateChange?.("LAB_DONE" as WorkflowState);
        toast.error(msg);
      }
    } finally {
      if (!keepTrackingAfterRequestDrop) {
        setIsRunning(false);
        startedAtRef.current = null;
      }
    }
  };

  const handleStop = async () => {
    if (!workflowSessionId || !isRunning || isStopping) return;

    setIsStopping(true);
    try {
      await WorkflowService.stopAnalysis(workflowSessionId);
      const settled = await waitForWorkflowState(workflowSessionId, ["LAB_DONE", "ANALYSIS_DONE", "FAILED"], 8000);
      stopAnalysisUi({ clearError: true, keepCompletedSteps: false });
      onWorkflowStateChange?.(settled.current_state as WorkflowState);
      toast.success("Stop requested. Analysis has been terminated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to stop analysis");
    } finally {
      setIsStopping(false);
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
        <div className="space-y-1">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            Analysis Mode
          </p>
          <p className="text-xs text-muted-foreground">
            System auto-generates both Newbie and Seasoned outputs every run.
          </p>
        </div>

        {/* Run / Status */}
        <div className="flex items-center gap-4">
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

          {isRunning && !!workflowSessionId && (
            <Button
              onClick={handleStop}
              disabled={isStopping}
              variant="outline"
              className="h-12 px-6 rounded-2xl border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            >
              {isStopping ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Stopping...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" /> Stop Analysis
                </>
              )}
            </Button>
          )}

        </div>
      </div>

      {/* ─── Pipeline Workflow Visualization ──────────────────────────── */}
      <PipelineWorkflow
        isRunning={isRunning}
        currentStep={currentPipelineStep}
        completedSteps={completedPipelineSteps}
        failedStep={failedPipelineStep}
      />

      {/* ─── Detailed Analysis Progress Bar ──────────────────────────── */}
      {isRunning && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 animate-pulse" />
              Analysis Progress
            </h4>
            <span className="text-xs text-muted-foreground tabular-nums">{elapsed}s</span>
          </div>

          {/* Step progress bar */}
          <div className="space-y-2">
            {Object.entries(PIPELINE_STEP_LABELS).map(([stepKey, stepLabel]) => {
              const isCompleted = completedPipelineSteps.includes(stepKey);
              const isCurrent = currentPipelineStep === stepKey;
              const isFailed = failedPipelineStep === stepKey;

              return (
                <div key={stepKey} className="flex items-center gap-3">
                  <div className="w-5 flex justify-center">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    ) : isFailed ? (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-white/10" />
                    )}
                  </div>
                  <span
                    className={`text-xs transition-colors ${
                      isCompleted
                        ? "text-emerald-400/80"
                        : isCurrent
                          ? "text-primary font-bold"
                          : isFailed
                            ? "text-rose-400"
                            : "text-muted-foreground/40"
                    }`}
                  >
                    {stepLabel}
                  </span>
                  {isCurrent && (stepKey === "kra_analysis" || stepKey === "ora_refinement") && (
                    <span className="ml-auto text-[9px] text-primary/50 italic">
                      {stepKey === "kra_analysis"
                        ? "LLM reasoning — this is the longest step…"
                        : "Formatting clinical report…"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Overall progress bar */}
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(
                  5,
                  (completedPipelineSteps.length / Object.keys(PIPELINE_STEP_LABELS).length) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

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
                prev ? applyOraModeToResponse(prev, "newbie") : prev,
              );
            }}
          >
            Newbie
          </Button>
          <Button
            type="button"
            size="sm"
            variant={oraMode === "seasoned" ? "default" : "outline"}
            className="h-8 rounded-lg"
            onClick={() => {
              setOraMode("seasoned");
              setResult((prev) =>
                prev ? applyOraModeToResponse(prev, "seasoned") : prev,
              );
            }}
          >
            Seasoned
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
