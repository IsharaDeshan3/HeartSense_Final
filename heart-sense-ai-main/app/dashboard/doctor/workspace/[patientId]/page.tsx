"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Activity,
  Microscope,
  BrainCircuit,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { CurrentState } from "@/components/ApprovalEditor";
import type { LabAnalysisResult } from "@/components/LabSuggester";
import type { EcgResult } from "@/lib/diagnosticMapper";
import {
  WorkflowService,
  type WorkflowState,
  type WorkflowSession,
} from "@/services/WorkflowService";

type WorkspacePatient = {
  _id: string;
  fullName: string;
  patientId: string;
  age?: number;
  gender?: string;
};

type NlpUpdatePayload = {
  translated_text?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function createInitialSummary() {
  return {
    recentObservation: "Awaiting clinical input...",
    riskScore: "pending",
    suggestedFocus: "Cardiovascular Screen",
    symptoms: [] as string[],
    riskFactors: [] as string[],
    ecgResult: null as EcgResult | null,
    labResult: null as LabAnalysisResult | null,
  };
}

function getWorkflowResumeKey(patientId: string) {
  return `workspace:workflow-resume:${patientId}`;
}

function mapWorkflowStateToTab(state: WorkflowState | string | null):
  | "nlp"
  | "ecg"
  | "lab"
  | "ai" {
  if (!state || state === "SESSION_CREATED") return "nlp";
  if (state === "EXTRACTION_DONE") return "ecg";
  if (state === "ECG_DONE") return "lab";
  return "ai";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function toApprovedMap(items: string[], prefix: string) {
  return items.reduce<Record<string, { value: string; status: "approved" }>>(
    (acc, item, index) => {
      acc[`${prefix}_${index + 1}`] = {
        value: item,
        status: "approved",
      };
      return acc;
    },
    {},
  );
}

const moduleFallback = (title: string, description: string) => (
  <div className="flex min-h-[24rem] items-center justify-center rounded-3xl border border-white/5 bg-white/[0.02] p-8 text-center">
    <div className="max-w-md space-y-3">
      <div className="mx-auto h-10 w-10 animate-pulse rounded-2xl bg-primary/10" />
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary/70">
        {title}
      </p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

const NlpProcessor = dynamic(() => import("@/components/NlpProcessor"), {
  ssr: false,
  loading: () =>
    moduleFallback(
      "Loading symptoms",
      "Preparing speech and transcript tools.",
    ),
});

const EcgInterpreter = dynamic(() => import("@/components/EcgInterpreter"), {
  ssr: false,
  loading: () =>
    moduleFallback(
      "Loading ECG tools",
      "Preparing waveform analysis and reporting.",
    ),
});

const LabSuggester = dynamic(() => import("@/components/LabSuggester"), {
  ssr: false,
  loading: () =>
    moduleFallback(
      "Loading lab tools",
      "Preparing lab interpretation and recommendations.",
    ),
});

const AiDiagnostics = dynamic(() => import("@/components/AiDiagnostics"), {
  ssr: false,
  loading: () =>
    moduleFallback(
      "Loading analysis engine",
      "Preparing the diagnostic workflow and result view.",
    ),
});

export default function DiagnosticWorkspace() {
  const { patientId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceNewDiagnosis = searchParams.get("new") === "1";
  const requestedResumeSessionId = searchParams.get("resume_session_id");
  const [patient, setPatient] = useState<WorkspacePatient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"nlp" | "ecg" | "lab" | "ai">(
    "nlp",
  );
  const [workflowSessionId, setWorkflowSessionId] = useState<string | null>(
    null,
  );
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(
    null,
  );
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Workspace State System (Persistent between modules)
  const [summary, setSummary] = useState(createInitialSummary);

  const [ecgSkipped, setEcgSkipped] = useState(false);
  const [labSkipped, setLabSkipped] = useState(false);

  // Track which tabs have been visited so we can keep them mounted (preserves state)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["nlp"]));
  useEffect(() => {
    setVisitedTabs((prev) => new Set([...prev, activeTab]));
  }, [activeTab]);

  // Shared NLP state — single source of truth for both voice and manual entry
  const [nlpCurrentState, setNlpCurrentState] = useState<CurrentState>({
    symptoms: {},
    medical_history: {},
    allergies: {},
    risk_factors: {},
  });

  const hydrateFromSession = useCallback((session: WorkflowSession) => {
    const extractionPayload =
      (session.step_payloads?.extraction?.payload as Record<string, unknown> | undefined) ??
      null;
    const ecgStepPayload =
      (session.step_payloads?.ecg?.payload as Record<string, unknown> | undefined) ??
      null;
    const labStepPayload =
      (session.step_payloads?.lab?.payload as Record<string, unknown> | undefined) ??
      null;

    const symptoms = normalizeStringArray(extractionPayload?.symptoms);
    const riskFactors = normalizeStringArray(extractionPayload?.risk_factors);
    const translatedText = String(
      extractionPayload?.translated_text || "Awaiting clinical input...",
    );

    const ecgResultPayload =
      (ecgStepPayload?.result as Record<string, unknown> | undefined) ?? null;
    const labResultPayload =
      (labStepPayload?.result as Record<string, unknown> | undefined) ?? null;

    const ecgWasSkipped = ecgResultPayload?.status === "skipped";
    const labWasSkipped = labResultPayload?.status === "skipped";

    setNlpCurrentState((prev) => ({
      ...prev,
      symptoms: toApprovedMap(symptoms, "symptom"),
      risk_factors: toApprovedMap(riskFactors, "risk"),
    }));

    setSummary((prev) => ({
      ...prev,
      recentObservation: translatedText,
      riskScore:
        riskFactors.length > 2
          ? "High"
          : riskFactors.length > 0
            ? "Moderate"
            : "Low",
      symptoms,
      riskFactors,
      ecgResult: ecgWasSkipped
        ? null
        : ((ecgResultPayload as unknown as EcgResult | null) ?? null),
      labResult: labWasSkipped
        ? null
        : ((labResultPayload as unknown as LabAnalysisResult | null) ?? null),
    }));

    setEcgSkipped(Boolean(ecgWasSkipped));
    setLabSkipped(Boolean(labWasSkipped));
    setWorkflowSessionId(session.session_id);
    setWorkflowState(session.current_state);
    setActiveTab(mapWorkflowStateToTab(session.current_state));
  }, []);

  // Keep summary.symptoms and riskFactors in sync with approved NLP state
  useEffect(() => {
    const approvedSymptoms = Object.values(nlpCurrentState.symptoms)
      .filter((v) => v.status === "approved")
      .map((v) => v.value);
    const approvedRiskFactors = Object.values(nlpCurrentState.risk_factors)
      .filter((v) => v.status === "approved")
      .map((v) => v.value);
    setSummary((prev) => ({
      ...prev,
      symptoms: approvedSymptoms,
      riskFactors: approvedRiskFactors,
      riskScore:
        approvedRiskFactors.length > 2
          ? "High"
          : approvedRiskFactors.length > 0
          ? "Moderate"
          : "Low",
    }));
  }, [nlpCurrentState]);

  const handleNlpUpdate = (data: NlpUpdatePayload) => {
    // Only sync translated text from voice — symptoms come through nlpCurrentState
    const { translated_text } = data;
    if (translated_text) {
      setSummary((prev) => ({
        ...prev,
        recentObservation: translated_text,
      }));
    }
    toast.success("Clinical Summary Synchronized");
  };

  const handleSkipStep = async () => {
    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      if (activeTab === "ecg") {
        const saved = await WorkflowService.saveEcg(workflowSessionId, {
          status: "skipped",
          reason: "user_skipped",
        });
        setWorkflowState(saved.state);
        setEcgSkipped(true);
        setActiveTab("lab");
        toast.info("ECG skipped and recorded");
      } else if (activeTab === "lab") {
        const saved = await WorkflowService.saveLab(workflowSessionId, {
          status: "skipped",
          reason: "user_skipped",
        });
        setWorkflowState(saved.state);
        setLabSkipped(true);
        setActiveTab("ai");
        toast.info("Lab Reports skipped and recorded");
      }
    } catch (error: unknown) {
      toast.error("Failed to skip step", {
        description: getErrorMessage(error, "Failed to skip the current step"),
      });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleEcgComplete = (data: EcgResult) => {
    setSummary((prev) => ({
      ...prev,
      ecgResult: data,
    }));
    toast.success("ECG findings synced to workspace");
  };

  const handleLabComplete = (data: LabAnalysisResult) => {
    setSummary((prev) => ({
      ...prev,
      labResult: data,
    }));
    toast.success("Lab findings synced to workspace");
  };

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const resolvedPatientId = String(patientId ?? "");
        const response = await fetch(
          `/api/doctor/patients/${encodeURIComponent(resolvedPatientId)}`,
        );

        if (response.ok) {
          setPatient(await response.json());
        } else {
          toast.error("Subject ID not found in registry");
          router.push("/dashboard/doctor");
        }
      } catch {
        toast.error("Connectivity issue with central registry");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPatientData();
  }, [patientId, router]);

  useEffect(() => {
    const initWorkflow = async () => {
      if (!patient) return;
      // Prevent re-initializing if a session already exists
      if (workflowSessionId) return;
      const resolvedPatientId = String(patient._id ?? patientId);
      const resumeKey = getWorkflowResumeKey(resolvedPatientId);

      try {
        if (forceNewDiagnosis) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(resumeKey);
          }

          const freshSession = await WorkflowService.initSession(
            resolvedPatientId,
            undefined,
          );
          setWorkflowSessionId(freshSession.session_id);
          setWorkflowState(freshSession.state);
          setActiveTab("nlp");
          setSummary(createInitialSummary());
          setNlpCurrentState({
            symptoms: {},
            medical_history: {},
            allergies: {},
            risk_factors: {},
          });
          setEcgSkipped(false);
          setLabSkipped(false);

          router.replace(`/dashboard/doctor/workspace/${resolvedPatientId}`);
          return;
        }

        if (requestedResumeSessionId) {
          try {
            const explicitSession = await WorkflowService.getSession(
              requestedResumeSessionId,
            );
            if (explicitSession?.patient_id === resolvedPatientId) {
              hydrateFromSession(explicitSession);
              router.replace(`/dashboard/doctor/workspace/${resolvedPatientId}`);
              return;
            }
          } catch {
            // Fallback to cache/latest behavior below.
          }
        }

        // 1) Resume from browser cache if still valid.
        if (typeof window !== "undefined") {
          const cached = window.localStorage.getItem(resumeKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as {
                session_id?: string;
                state?: WorkflowState;
              };
              if (parsed.session_id) {
                const existing = await WorkflowService.getSession(parsed.session_id);
                if (existing?.session_id) {
                  hydrateFromSession(existing);
                  return;
                }
              }
            } catch {
              // Ignore stale or malformed cache.
            }
          }
        }

        // 2) Resume from latest unfinished backend session for this patient.
        try {
          const latest = await WorkflowService.getLatestSession(resolvedPatientId, false);
          if (latest?.session_id) {
            hydrateFromSession(latest);
            return;
          }
        } catch {
          // If no resumable session exists, create a fresh one below.
        }

        // 3) No resumable session found, initialize a new workflow.
        const session = await WorkflowService.initSession(resolvedPatientId, undefined);
        setWorkflowSessionId(session.session_id);
        setWorkflowState(session.state);
        setActiveTab(mapWorkflowStateToTab(session.state));
      } catch (error: unknown) {
        toast.error("Failed to initialize workflow session", {
          description: getErrorMessage(error, "Unable to initialize workflow session"),
        });
      }
    };

    initWorkflow();
  }, [
    forceNewDiagnosis,
    hydrateFromSession,
    patient,
    patientId,
    requestedResumeSessionId,
    router,
    workflowSessionId,
  ]);

  useEffect(() => {
    if (!patient) return;
    if (!workflowSessionId) return;
    if (typeof window === "undefined") return;

    const resolvedPatientId = String(patient._id ?? patientId);
    const resumeKey = getWorkflowResumeKey(resolvedPatientId);
    window.localStorage.setItem(
      resumeKey,
      JSON.stringify({
        session_id: workflowSessionId,
        state: workflowState,
        updated_at: new Date().toISOString(),
      }),
    );
  }, [patient, patientId, workflowSessionId, workflowState]);

  const canAccessTab = (tab: "nlp" | "ecg" | "lab" | "ai") => {
    if (tab === "nlp") return true;
    if (!workflowState) return false;

    if (tab === "ecg") {
      return [
        "EXTRACTION_DONE",
        "ECG_DONE",
        "LAB_DONE",
        "ANALYSIS_RUNNING",
        "ANALYSIS_DONE",
      ].includes(workflowState);
    }
    if (tab === "lab") {
      return [
        "ECG_DONE",
        "LAB_DONE",
        "ANALYSIS_RUNNING",
        "ANALYSIS_DONE",
      ].includes(workflowState);
    }
    return ["LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(
      workflowState,
    );
  };

  const handleTabChange = (tab: string) => {
    const typedTab = tab as "nlp" | "ecg" | "lab" | "ai";
    if (!canAccessTab(typedTab)) {
      toast.warning("Complete previous step first");
      return;
    }
    setActiveTab(typedTab);
  };
  // Save a diagnostic entry to the patient's history
  const saveDiagnosticEntry = async (
    type: string,
    entrySummary: string,
    entryData: unknown,
  ) => {
    try {
      const resolvedPatientId = String(patient?._id ?? patientId);
      const res = await fetch(
        `/api/patients/${resolvedPatientId}/diagnostics`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            summary: entrySummary,
            data: entryData,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn(
          "Diagnostic history save skipped:",
          err?.message || `HTTP ${res.status}`,
        );
      }
    } catch (error) {
      console.error("Failed to save diagnostic entry:", error);
    }
  };

  const handleSaveCurrentStep = async () => {
    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      if (activeTab === "nlp") {
        if (summary.symptoms.length === 0) {
          toast.warning("Add symptoms before saving");
          return;
        }
        const saved = await WorkflowService.saveExtraction(workflowSessionId, {
          symptoms: summary.symptoms,
          risk_factors: summary.riskFactors,
          translated_text: summary.recentObservation,
          raw: { summary },
        });
        setWorkflowState(saved.state);
      } else if (activeTab === "ecg") {
        if (summary.ecgResult) {
          const saved = await WorkflowService.saveEcg(
            workflowSessionId,
            summary.ecgResult as unknown as Record<string, unknown>,
          );
          setWorkflowState(saved.state);
          setEcgSkipped(false);
        } else if (ecgSkipped) {
          const saved = await WorkflowService.saveEcg(workflowSessionId, {
            status: "skipped",
            reason: "user_skipped",
          });
          setWorkflowState(saved.state);
        } else {
          toast.warning("Complete ECG analysis or skip before saving");
          return;
        }
      } else if (activeTab === "lab") {
        if (summary.labResult) {
          const saved = await WorkflowService.saveLab(
            workflowSessionId,
            summary.labResult as unknown as Record<string, unknown>,
          );
          setWorkflowState(saved.state);
          setLabSkipped(false);
        } else if (labSkipped) {
          const saved = await WorkflowService.saveLab(workflowSessionId, {
            status: "skipped",
            reason: "user_skipped",
          });
          setWorkflowState(saved.state);
        } else {
          toast.warning("Complete lab analysis or skip before saving");
          return;
        }
      }

      toast.success("Progress saved");
    } catch (error: unknown) {
      toast.error("Failed to save progress", {
        description: getErrorMessage(error, "Unable to persist current workflow step"),
      });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleNextToEcg = async () => {
    if (summary.symptoms.length === 0) {
      toast.warning("Capture symptoms before proceeding");
      return;
    }

    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      const saved = await WorkflowService.saveExtraction(workflowSessionId, {
        symptoms: summary.symptoms,
        risk_factors: summary.riskFactors,
        translated_text: summary.recentObservation,
        raw: { summary },
      });
      setWorkflowState(saved.state);

      // Save to patient diagnostic history
      await saveDiagnosticEntry(
        "NLP",
        `Symptoms: ${summary.symptoms.join(", ")}. Risk factors: ${
          summary.riskFactors.join(", ") || "None"
        }`,
        {
          symptoms: summary.symptoms,
          riskFactors: summary.riskFactors,
          observation: summary.recentObservation,
        },
      );

      setActiveTab("ecg");
      toast.success("Symptoms saved. Proceeding to ECG");
    } catch (error: unknown) {
      toast.error("Could not proceed to ECG", {
        description: getErrorMessage(error, "Unable to save extraction step"),
      });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleNextToLab = async () => {
    if (!summary.ecgResult) {
      toast.warning("Complete ECG analysis before proceeding");
      return;
    }

    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      const saved = await WorkflowService.saveEcg(
        workflowSessionId,
        summary.ecgResult as unknown as Record<string, unknown>,
      );
      setWorkflowState(saved.state);

      // Save to patient diagnostic history
      await saveDiagnosticEntry(
        "ECG",
        `${summary.ecgResult.rhythm_analysis.rhythm_type} - ${summary.ecgResult.rhythm_analysis.heart_rate} BPM - ${summary.ecgResult.abnormalities.severity}`,
        summary.ecgResult,
      );

      setActiveTab("lab");
      toast.success("ECG saved. Proceeding to Lab");
    } catch (error: unknown) {
      toast.error("Could not proceed to Lab", {
        description: getErrorMessage(error, "Unable to save ECG step"),
      });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleNextToAnalysis = async () => {
    if (!summary.labResult && !labSkipped) {
      toast.warning("Complete Lab analysis before proceeding");
      return;
    }

    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      const labPayload = summary.labResult
        ? (summary.labResult as unknown as Record<string, unknown>)
        : {
            status: "skipped",
            reason: "user_skipped",
          };

      const saved = await WorkflowService.saveLab(
        workflowSessionId,
        labPayload,
      );
      setWorkflowState(saved.state);

      // Save to patient diagnostic history
      let abnormalCount = 0;
      let labCount = 0;
      if (summary.labResult && summary.labResult.labComparison) {
        abnormalCount = summary.labResult.labComparison.filter(
          (l) => l.status !== "Normal",
        ).length;
        labCount = summary.labResult.labComparison.length;
      }
      await saveDiagnosticEntry(
        "Lab",
        `${labCount} tests analyzed, ${abnormalCount} abnormal`,
        summary.labResult,
      );

      setActiveTab("ai");
      toast.success("Lab saved. Proceeding to Analysis");
    } catch (error: unknown) {
      toast.error("Could not proceed to Analysis", {
        description: getErrorMessage(error, "Unable to save lab step"),
      });
    } finally {
      setIsAdvancing(false);
    }
  };

  if (isLoading)
    return (
      <div className="min-h-screen bg-background flex-center text-primary animate-pulse">
        Initializing Neural Workspace...
      </div>
    );

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* PERSISTENT CLINICAL SIDEBAR */}
      <aside className="w-full lg:w-72 border-r border-white/5 glass p-4 space-y-4 flex flex-col shrink-0 overflow-y-auto">
        <div className="space-y-4">
          <LinkButton
            onClick={() => router.push("/dashboard/doctor")}
            icon={<ArrowLeft className="w-4 h-4" />}
            text="Exit Workspace"
          />

          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 bg-primary opacity-5 blur-3xl rounded-full"></div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex-center text-primary font-bold">
                {patient?.fullName?.charAt(0)}
              </div>
              <div>
                <h2 className="font-bold text-sm tracking-tight">
                  {patient?.fullName}
                </h2>
                <p className="text-[10px] text-muted-foreground uppercase">
                  {patient?.patientId}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
              <div className="px-2 py-1.5 bg-white/5 rounded-lg text-muted-foreground uppercase">
                Age: {patient?.age}y
              </div>
              <div className="px-2 py-1.5 bg-white/5 rounded-lg text-muted-foreground uppercase">
                {patient?.gender}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 flex-1 min-h-0">
          <div>
            <h3 className="text-[10px] font-black tracking-widest text-primary uppercase mb-4 opacity-50">
              Active Clinical Summary
            </h3>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 p-3 bg-white/[0.02]">
                <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-2">
                  <Activity className="h-3 w-3" /> NEURAL RISK STATUS
                </p>
                <div className="text-lg font-black text-white italic">
                  {summary.riskScore.toUpperCase()}
                </div>
              </div>

              {summary.symptoms.length > 0 && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-2 text-orange-400">
                    <AlertCircle className="h-3 w-3" /> ACTIVE SYMPTOMS
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {summary.symptoms.map((s, i) => (
                      <span
                        key={i}
                        className="text-[8px] font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.riskFactors.length > 0 && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-red-400">
                    <AlertCircle className="h-3 w-3" /> RISK FACTORS
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {summary.riskFactors.map((r, i) => (
                      <span
                        key={i}
                        className="text-[8px] font-bold text-red-300/80 bg-rose-500/10 px-2 py-0.5 rounded uppercase tracking-wider"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Object.values(nlpCurrentState.medical_history).filter(
                (v) => v.status === "approved",
              ).length > 0 && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-sky-400">
                    <ClipboardList className="h-3 w-3" /> MEDICAL HISTORY
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.values(nlpCurrentState.medical_history)
                      .filter((v) => v.status === "approved")
                      .map((v, i) => (
                        <span
                          key={i}
                          className="text-[8px] font-bold text-sky-300/80 bg-sky-500/10 px-2 py-0.5 rounded uppercase tracking-wider"
                        >
                          {v.value}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {Object.values(nlpCurrentState.allergies).filter(
                (v) => v.status === "approved",
              ).length > 0 && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-amber-400">
                    <AlertCircle className="h-3 w-3" /> ALLERGIES
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.values(nlpCurrentState.allergies)
                      .filter((v) => v.status === "approved")
                      .map((v, i) => (
                        <span
                          key={i}
                          className="text-[8px] font-bold text-amber-300/80 bg-amber-500/10 px-2 py-0.5 rounded uppercase tracking-wider"
                        >
                          {v.value}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {summary.ecgResult && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-blue-400">
                    <Activity className="h-3 w-3" /> ECG FINDINGS
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-xs text-white font-bold">
                      {summary.ecgResult.rhythm_analysis.rhythm_type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {summary.ecgResult.rhythm_analysis.heart_rate} BPM —{" "}
                      {summary.ecgResult.rhythm_analysis.regularity}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          summary.ecgResult.abnormalities.severity === "normal"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : summary.ecgResult.abnormalities.severity ===
                              "mild"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {summary.ecgResult.abnormalities.severity}
                      </span>
                      {summary.ecgResult.diagnosis?.urgency && (
                        <span className="text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-violet-500/10 text-violet-400">
                          {summary.ecgResult.diagnosis.urgency}
                        </span>
                      )}
                    </div>
                    {summary.ecgResult.abnormalities.abnormalities?.length >
                      0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {summary.ecgResult.abnormalities.abnormalities.map(
                          (a, i) => (
                            <span
                              key={i}
                              className="text-[8px] font-bold text-blue-300/70 bg-blue-500/10 px-2 py-0.5 rounded uppercase tracking-wider"
                            >
                              {a}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {summary.ecgResult.diagnosis?.primary_diagnosis && (
                      <p className="text-[9px] text-muted-foreground italic pt-0.5 leading-snug">
                        {summary.ecgResult.diagnosis.primary_diagnosis}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {summary.labResult &&
                (() => {
                  const abnormal = summary.labResult.labComparison.filter(
                    (l) => l.status !== "Normal",
                  );
                  const normalCount = summary.labResult.labComparison.filter(
                    (l) => l.status === "Normal",
                  ).length;
                  return (
                    <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                      <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-purple-400">
                        <Microscope className="h-3 w-3" /> LAB FINDINGS
                        <span className="ml-auto text-muted-foreground/50">
                          {summary.labResult.labComparison.length} tests
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {abnormal.map((l, i) => (
                          <span
                            key={i}
                            className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              l.status === "High"
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {l.test}: {l.status}
                          </span>
                        ))}
                        {normalCount > 0 && (
                          <span className="text-[8px] font-bold text-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
                            {normalCount} normal
                          </span>
                        )}
                        {abnormal.length === 0 && normalCount > 0 && (
                          <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
                            All values normal
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-white/5">
          <p className="text-[8px] text-muted-foreground font-bold tracking-[0.15em] uppercase text-center">
            HeartSense v2.6.0
          </p>
        </div>
      </aside>

      {/* DIAGNOSTIC WIZARD */}
      <main className="flex-1 flex flex-col bg-card/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] -z-10"></div>

        {/* WIZARD STEPPER HEADER */}
        <div className="border-b border-border/30 bg-background/80 backdrop-blur-xl px-6 py-3 shrink-0">
          <div className="flex items-center justify-center gap-0 max-w-4xl mx-auto">
            {[
              {
                key: "nlp" as const,
                label: "Patient Symptoms",
                icon: <ClipboardList className="h-4 w-4" />,
                step: 1,
              },
              {
                key: "ecg" as const,
                label: "ECG Analysis",
                icon: <Activity className="h-4 w-4" />,
                step: 2,
              },
              {
                key: "lab" as const,
                label: "Lab Reports",
                icon: <Microscope className="h-4 w-4" />,
                step: 3,
              },
              {
                key: "ai" as const,
                label: "Analysis",
                icon: <BrainCircuit className="h-4 w-4" />,
                step: 4,
              },
            ].map((item, idx) => {
              const isActive = activeTab === item.key;
              const isCompleted =
                (item.key === "nlp" && summary.symptoms.length > 0) ||
                (item.key === "ecg" && summary.ecgResult !== null) ||
                (item.key === "lab" && summary.labResult !== null);
              const isAccessible = canAccessTab(item.key);

              return (
                <div key={item.key} className="flex items-center">
                  {/* Step Button */}
                  <button
                    onClick={() => isAccessible && handleTabChange(item.key)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                        : isCompleted
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer"
                        : isAccessible
                        ? "bg-white/5 text-foreground border border-border/30 hover:bg-white/10 cursor-pointer"
                        : "bg-white/[0.02] text-muted-foreground/40 border border-border/10 cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`h-7 w-7 rounded-lg flex-center text-xs font-black ${
                        isActive
                          ? "bg-primary-foreground/20"
                          : isCompleted
                          ? "bg-emerald-500/20"
                          : "bg-white/10"
                      }`}
                    >
                      {isCompleted && !isActive ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : (
                        item.step
                      )}
                    </div>
                    <span className="text-sm font-bold">{item.label}</span>
                  </button>

                  {/* Arrow between steps */}
                  {idx < 3 && (
                    <div className="mx-3 flex items-center text-muted-foreground/30">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP CONTENT */}
        <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {visitedTabs.has("nlp") && (
              <div className={activeTab !== "nlp" ? "hidden" : ""}>
                <WorkspaceModule
                  icon={<ClipboardList className="h-10 w-10" />}
                  title="Patient Symptoms"
                  description="Use voice recognition to capture patient symptoms in Sinhala. The AI will automatically extract and translate medical information."
                >
                  <NlpProcessor
                    onUpdateSummary={handleNlpUpdate}
                    currentState={nlpCurrentState}
                    onCurrentStateChange={setNlpCurrentState}
                  />

                  {/* Manual Symptom Entry */}
                  {/* <div className="flex-1 glass rounded-2xl border border-white/5 p-6 flex flex-col shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-primary/80">
                      Manual Symptom Entry
                    </h4>
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 bg-white/5 rounded-lg uppercase">
                      Keyboard Input
                    </span>
                  </div>

                  <div className="flex gap-3 mb-5">
                    <input
                      type="text"
                      value={manualSymptom}
                      onChange={(e) => setManualSymptom(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddManualSymptom()
                      }
                      placeholder="Type a symptom and press Enter..."
                      className="flex-1 h-12 px-5 rounded-xl bg-black/20 border border-white/10 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all shadow-inner"
                    />
                    <Button
                      onClick={handleAddManualSymptom}
                      disabled={!manualSymptom.trim()}
                      className="h-12 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all font-bold gap-2"
                    >
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>

                  <div className="flex-1 bg-black/10 rounded-xl border border-white/5 p-4 overflow-y-auto">
                    {Object.values(nlpCurrentState.symptoms).filter(
                      (v) => v.status === "approved",
                    ).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(nlpCurrentState.symptoms)
                          .filter(([_, v]) => v.status === "approved")
                          .map(([key, v]) => (
                            <span
                              key={key}
                              className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-bold border border-orange-500/20 shadow-sm animate-in zoom-in-95"
                            >
                              {v.value}
                              <button
                                onClick={() => handleRemoveSymptom(key)}
                                className="opacity-50 group-hover:opacity-100 hover:text-orange-200 hover:bg-orange-500/20 p-0.5 rounded transition-all"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-center opacity-40">
                        <p className="text-xs italic text-muted-foreground">
                          No symptoms added yet.
                          <br />
                          Use the input above or voice capture to add symptoms.
                        </p>
                      </div>
                    )}
                  </div>
                </div> */}
                </WorkspaceModule>
              </div>
            )}

            {visitedTabs.has("ecg") && (
              <div className={activeTab !== "ecg" ? "hidden" : ""}>
                <WorkspaceModule
                  icon={<Activity className="h-10 w-10" />}
                  title="ECG Analysis"
                  description="Upload an ECG image for AI-powered analysis of heart rhythm patterns and abnormality detection."
                >
                  <EcgInterpreter
                    initialContext={`Patient: ${patient?.fullName}. Clinical suspicion of cardiac involvement. Reviewing standard leads.`}
                    onAnalysisComplete={handleEcgComplete}
                    patientId={String(patient?._id ?? patientId)}
                    sessionId={workflowSessionId ?? undefined}
                    patientSymptoms={
                      summary.symptoms.length > 0 ? summary.symptoms : undefined
                    }
                  />
                </WorkspaceModule>
              </div>
            )}

            {visitedTabs.has("lab") && (
              <div className={activeTab !== "lab" ? "hidden" : ""}>
                <WorkspaceModule
                  icon={<Microscope className="h-10 w-10" />}
                  title="Lab Reports"
                  description="Upload a lab report image to extract values, compare against normal ranges, and get recommended follow-up tests."
                >
                  <LabSuggester
                    patientContext={
                      patient
                        ? `Patient: ${patient.fullName}, Age: ${patient.age}, Gender: ${patient.gender}`
                        : undefined
                    }
                    patientName={patient?.fullName}
                    patientId={String(patient?._id ?? patientId)}
                    onAnalysisComplete={handleLabComplete}
                  />
                </WorkspaceModule>
              </div>
            )}

            {visitedTabs.has("ai") && (
              <div className={activeTab !== "ai" ? "hidden" : ""}>
                <WorkspaceModule
                  icon={<BrainCircuit className="h-10 w-10" />}
                  title="Analysis"
                  description="AI combines all collected data — symptoms, ECG, and lab results — to generate a comprehensive diagnostic assessment."
                >
                  <AiDiagnostics
                    patientId={String(patient?._id ?? patientId)}
                    symptoms={summary.symptoms}
                    riskFactors={summary.riskFactors}
                    recentObservation={summary.recentObservation}
                    patientAge={patient?.age}
                    patientGender={patient?.gender}
                    ecgResult={summary.ecgResult}
                    labResult={summary.labResult}
                    workflowSessionId={workflowSessionId}
                    workflowState={workflowState}
                    ecgSkipped={ecgSkipped}
                    labSkipped={labSkipped}
                    onWorkflowStateChange={(state: WorkflowState) =>
                      setWorkflowState(state)
                    }
                  />
                </WorkspaceModule>
              </div>
            )}
          </div>

          {/* WIZARD NEXT BUTTON — pinned footer */}
          {activeTab !== "ai" && (
            <div className="flex justify-end items-center gap-3 pt-4 pb-1 shrink-0 border-t border-white/5 mt-4">
              <Button
                onClick={handleSaveCurrentStep}
                variant="outline"
                disabled={isAdvancing}
                className="h-12 px-5 rounded-xl font-bold text-sm"
              >
                Save Progress
              </Button>
              {(activeTab === "ecg" || activeTab === "lab") && (
                <Button
                  onClick={handleSkipStep}
                  variant="ghost"
                  className="h-12 px-5 rounded-xl text-muted-foreground hover:text-foreground font-bold text-sm gap-2 border border-white/10 hover:border-white/20 transition-all"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip {activeTab === "ecg" ? "ECG" : "Lab"}
                </Button>
              )}
              <Button
                onClick={
                  activeTab === "nlp"
                    ? handleNextToEcg
                    : activeTab === "ecg"
                    ? handleNextToLab
                    : handleNextToAnalysis
                }
                disabled={
                  isAdvancing ||
                  (activeTab === "nlp" && summary.symptoms.length === 0) ||
                  (activeTab === "ecg" && !summary.ecgResult) ||
                  (activeTab === "lab" && !summary.labResult && !labSkipped)
                }
                className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all gap-2 group"
              >
                {isAdvancing ? (
                  "Saving..."
                ) : (
                  <>
                    Next Step
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LinkButton({
  icon,
  text,
  onClick,
}: {
  icon: ReactNode;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group text-[10px] font-bold uppercase tracking-widest leading-none"
    >
      <div className="h-9 w-9 rounded-xl border border-white/10 flex-center group-hover:bg-white/5 transition-all group-hover:border-primary/30">
        {icon}
      </div>
      {text}
    </button>
  );
}

function WorkspaceModule({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-4">
      <div className="flex items-center gap-4 shrink-0">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-xs max-w-2xl leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">{children}</div>
    </div>
  );
}
