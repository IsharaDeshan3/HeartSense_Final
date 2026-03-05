"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Microscope,
  BrainCircuit,
  Stethoscope,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
  AlertCircle,
  SkipForward,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import EcgInterpreter from "@/components/EcgInterpreter";
import NlpProcessor from "@/components/NlpProcessor";
import LabSuggester from "@/components/LabSuggester";
import type { LabAnalysisResult } from "@/components/LabSuggester";
import AiDiagnostics from "@/components/AiDiagnostics";
import type { EcgResult } from "@/lib/diagnosticMapper";
import { WorkflowService, type WorkflowState } from "@/services/WorkflowService";


export default function DiagnosticWorkspace() {
  const { patientId } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"nlp" | "ecg" | "lab" | "ai">("nlp");
  const [workflowSessionId, setWorkflowSessionId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Workspace State System (Persistent between modules)
  const [summary, setSummary] = useState({
    recentObservation: "Awaiting clinical input...",
    riskScore: "pending",
    suggestedFocus: "Cardiovascular Screen",
    symptoms: [] as string[],
    riskFactors: [] as string[],
    ecgResult: null as EcgResult | null,
    labResult: null as LabAnalysisResult | null,
  });

  // Manual symptom entry state
  const [manualSymptom, setManualSymptom] = useState("");
  const [ecgSkipped, setEcgSkipped] = useState(false);
  const [labSkipped, setLabSkipped] = useState(false);

  const handleNlpUpdate = (data: any) => {
    // data contains { updated_state: { symptoms, risk_factors... }, translated_text }
    const { updated_state, translated_text } = data;
    setSummary((prev) => ({
      ...prev,
      recentObservation: translated_text || prev.recentObservation,
      symptoms: updated_state.symptoms || prev.symptoms,
      riskFactors: updated_state.risk_factors || prev.riskFactors,
      riskScore:
        updated_state.risk_factors?.length > 2
          ? "High"
          : updated_state.risk_factors?.length > 0
            ? "Moderate"
            : "Low",
    }));
    toast.success("Clinical Summary Synchronized");
  };

  const handleAddManualSymptom = () => {
    const symptom = manualSymptom.trim();
    if (!symptom) return;
    setSummary((prev) => ({
      ...prev,
      symptoms: [...prev.symptoms, symptom],
      riskScore: prev.riskFactors.length > 2 ? "High" : prev.riskFactors.length > 0 ? "Moderate" : "Low",
    }));
    setManualSymptom("");
    toast.success(`Added: ${symptom}`);
  };

  const handleRemoveSymptom = (index: number) => {
    setSummary((prev) => ({
      ...prev,
      symptoms: prev.symptoms.filter((_, i) => i !== index),
    }));
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
    } catch (error: any) {
      toast.error("Failed to skip step", { description: error.message });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleEcgComplete = (data: any) => {
    setSummary((prev) => ({
      ...prev,
      ecgResult: data as EcgResult,
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
        const response = await fetch(`/api/patients`); // Using existing generic fetch for now
        const allPatients = await response.json();
        const found = allPatients.find((p: any) => p._id === patientId);
        if (found) {
          setPatient(found);
        } else {
          toast.error("Subject ID not found in registry");
          router.push("/dashboard/doctor");
        }
      } catch (error) {
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
      try {
        const session = await WorkflowService.initSession(
          String(patient._id ?? patientId),
          undefined,
        );
        setWorkflowSessionId(session.session_id);
        setWorkflowState(session.state);
      } catch (error: any) {
        toast.error("Failed to initialize workflow session", {
          description: error.message,
        });
      }
    };

    initWorkflow();
  }, [patient, patientId]);

  const canAccessTab = (tab: "nlp" | "ecg" | "lab" | "ai") => {
    if (tab === "nlp") return true;
    if (!workflowState) return false;

    if (tab === "ecg") {
      return ["EXTRACTION_DONE", "ECG_DONE", "LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState);
    }
    if (tab === "lab") {
      return ["ECG_DONE", "LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState);
    }
    return ["LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState);
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
  const saveDiagnosticEntry = async (type: string, entrySummary: string, entryData: any) => {
    try {
      await fetch(`/api/patients/${patientId}/diagnostics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, summary: entrySummary, data: entryData }),
      });
    } catch (error) {
      console.error("Failed to save diagnostic entry:", error);
    }
  };

  const handleNextToEcg = async () => {
    if (summary.symptoms.length === 0) {
      toast.warning("Capture symptoms before proceeding");
      return;
    }

    // If extraction is already done, just navigate (don't re-save)
    if (workflowState && ["EXTRACTION_DONE", "ECG_DONE", "LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState)) {
      setActiveTab("ecg");
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
      await saveDiagnosticEntry("NLP",
        `Symptoms: ${summary.symptoms.join(", ")}. Risk factors: ${summary.riskFactors.join(", ") || "None"}`,
        { symptoms: summary.symptoms, riskFactors: summary.riskFactors, observation: summary.recentObservation }
      );

      setActiveTab("ecg");
      toast.success("Symptoms saved. Proceeding to ECG");
    } catch (error: any) {
      toast.error("Could not proceed to ECG", { description: error.message });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleNextToLab = async () => {
    if (!summary.ecgResult) {
      toast.warning("Complete ECG analysis before proceeding");
      return;
    }

    // If ECG is already done, just navigate
    if (workflowState && ["ECG_DONE", "LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState)) {
      setActiveTab("lab");
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
      await saveDiagnosticEntry("ECG",
        `${summary.ecgResult.rhythm_analysis.rhythm_type} - ${summary.ecgResult.rhythm_analysis.heart_rate} BPM - ${summary.ecgResult.abnormalities.severity}`,
        summary.ecgResult
      );

      setActiveTab("lab");
      toast.success("ECG saved. Proceeding to Lab");
    } catch (error: any) {
      toast.error("Could not proceed to Lab", { description: error.message });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleNextToAnalysis = async () => {
    if (!summary.labResult && !labSkipped) {
      toast.warning("Complete Lab analysis before proceeding");
      return;
    }

    // If Lab is already done, just navigate
    if (workflowState && ["LAB_DONE", "ANALYSIS_RUNNING", "ANALYSIS_DONE"].includes(workflowState)) {
      setActiveTab("ai");
      return;
    }

    if (!workflowSessionId) {
      toast.error("Workflow session not ready");
      return;
    }

    setIsAdvancing(true);
    try {
      const saved = await WorkflowService.saveLab(
        workflowSessionId,
        summary.labResult as unknown as Record<string, unknown>,
      );
      setWorkflowState(saved.state);

      // Save to patient diagnostic history
      const abnormalCount = summary.labResult.labComparison.filter(l => l.status !== "Normal").length;
      await saveDiagnosticEntry("Lab",
        `${summary.labResult.labComparison.length} tests analyzed, ${abnormalCount} abnormal`,
        summary.labResult
      );

      setActiveTab("ai");
      toast.success("Lab saved. Proceeding to Analysis");
    } catch (error: any) {
      toast.error("Could not proceed to Analysis", { description: error.message });
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

              <div className="rounded-xl border border-white/5 p-3 bg-white/[0.02]">
                <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-2">
                  <Stethoscope className="h-3 w-3" /> LAST OBSERVATION
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed italic">
                  &quot;{summary.recentObservation}&quot;
                </p>
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

              {summary.ecgResult && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-blue-400">
                    <Activity className="h-3 w-3" /> ECG FINDINGS
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-white font-bold">
                      {summary.ecgResult.rhythm_analysis.rhythm_type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {summary.ecgResult.rhythm_analysis.heart_rate} BPM —{" "}
                      {summary.ecgResult.rhythm_analysis.regularity}
                    </p>
                    <span
                      className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${summary.ecgResult.abnormalities.severity === "normal"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : summary.ecgResult.abnormalities.severity === "mild"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-rose-500/10 text-rose-400"
                        }`}
                    >
                      {summary.ecgResult.abnormalities.severity}
                    </span>
                  </div>
                </div>
              )}

              {summary.labResult && (
                <div className="rounded-2xl border border-white/5 p-4 bg-white/[0.02]">
                  <p className="text-[10px] font-bold mb-2 flex items-center gap-2 text-purple-400">
                    <Microscope className="h-3 w-3" /> LAB FINDINGS
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {summary.labResult.labComparison
                      .filter((l) => l.status !== "Normal")
                      .slice(0, 5)
                      .map((l, i) => (
                        <span
                          key={i}
                          className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${l.status === "High"
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-amber-500/10 text-amber-400"
                            }`}
                        >
                          {l.test}: {l.status}
                        </span>
                      ))}
                    {summary.labResult.labComparison.filter(
                      (l) => l.status === "Normal",
                    ).length > 0 && (
                        <span className="text-[8px] font-bold text-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
                          {
                            summary.labResult.labComparison.filter(
                              (l) => l.status === "Normal",
                            ).length
                          }{" "}
                          normal
                        </span>
                      )}
                  </div>
                </div>
              )}
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
            {([
              { key: "nlp" as const, label: "Patient Symptoms", icon: <ClipboardList className="h-4 w-4" />, step: 1 },
              { key: "ecg" as const, label: "ECG Analysis", icon: <Activity className="h-4 w-4" />, step: 2 },
              { key: "lab" as const, label: "Lab Reports", icon: <Microscope className="h-4 w-4" />, step: 3 },
              { key: "ai" as const, label: "Analysis", icon: <BrainCircuit className="h-4 w-4" />, step: 4 },
            ]).map((item, idx) => {
              const isActive = activeTab === item.key;
              const isCompleted = (
                (item.key === "nlp" && summary.symptoms.length > 0) ||
                (item.key === "ecg" && summary.ecgResult !== null) ||
                (item.key === "lab" && summary.labResult !== null)
              );
              const isAccessible = canAccessTab(item.key);

              return (
                <div key={item.key} className="flex items-center">
                  {/* Step Button */}
                  <button
                    onClick={() => isAccessible && handleTabChange(item.key)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 whitespace-nowrap ${isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                      : isCompleted
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer"
                        : isAccessible
                          ? "bg-white/5 text-foreground border border-border/30 hover:bg-white/10 cursor-pointer"
                          : "bg-white/[0.02] text-muted-foreground/40 border border-border/10 cursor-not-allowed"
                      }`}
                  >
                    <div className={`h-7 w-7 rounded-lg flex-center text-xs font-black ${isActive ? "bg-primary-foreground/20" : isCompleted ? "bg-emerald-500/20" : "bg-white/10"
                      }`}>
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
        <div className="p-6 flex-1 overflow-y-auto flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            {activeTab === "nlp" && (
              <WorkspaceModule
                icon={<ClipboardList className="h-10 w-10" />}
                title="Patient Symptoms"
                description="Use voice recognition to capture patient symptoms in Sinhala. The AI will automatically extract and translate medical information."
              >
                <NlpProcessor onUpdateSummary={handleNlpUpdate} />

                {/* Manual Symptom Entry */}
                <div className="flex-1 glass rounded-2xl border border-white/5 p-6 flex flex-col shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-primary/80">Manual Symptom Entry</h4>
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-1 bg-white/5 rounded-lg uppercase">Keyboard Input</span>
                  </div>

                  <div className="flex gap-3 mb-5">
                    <input
                      type="text"
                      value={manualSymptom}
                      onChange={(e) => setManualSymptom(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddManualSymptom()}
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
                    {summary.symptoms.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {summary.symptoms.map((s, i) => (
                          <span key={i} className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-bold border border-orange-500/20 shadow-sm animate-in zoom-in-95">
                            {s}
                            <button
                              onClick={() => handleRemoveSymptom(i)}
                              className="opacity-50 group-hover:opacity-100 hover:text-orange-200 hover:bg-orange-500/20 p-0.5 rounded transition-all"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-center opacity-40">
                        <p className="text-xs italic text-muted-foreground">No symptoms entered manually.<br />Use the input above to add symptoms.</p>
                      </div>
                    )}
                  </div>
                </div>
              </WorkspaceModule>
            )}

            {activeTab === "ecg" && (
              <WorkspaceModule
                icon={<Activity className="h-10 w-10" />}
                title="ECG Analysis"
                description="Upload an ECG image for AI-powered analysis of heart rhythm patterns and abnormality detection."
              >
                <EcgInterpreter
                  initialContext={`Patient: ${patient?.fullName}. Clinical suspicion of cardiac involvement. Reviewing standard leads.`}
                  onAnalysisComplete={handleEcgComplete}
                />
              </WorkspaceModule>
            )}

            {activeTab === "lab" && (
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
                  onAnalysisComplete={handleLabComplete}
                />
              </WorkspaceModule>
            )}

            {activeTab === "ai" && (
              <WorkspaceModule
                icon={<BrainCircuit className="h-10 w-10" />}
                title="Analysis"
                description="AI combines all collected data — symptoms, ECG, and lab results — to generate a comprehensive diagnostic assessment."
              >
                <AiDiagnostics
                  symptoms={summary.symptoms}
                  riskFactors={summary.riskFactors}
                  recentObservation={summary.recentObservation}
                  patientAge={patient?.age}
                  patientGender={patient?.gender}
                  ecgResult={summary.ecgResult}
                  labResult={summary.labResult}
                  workflowSessionId={workflowSessionId}
                  ecgSkipped={ecgSkipped}
                  labSkipped={labSkipped}
                />
              </WorkspaceModule>
            )}
          </div>

          {/* WIZARD NEXT BUTTON — bottom right */}
          {activeTab !== "ai" && (
            <div className="flex justify-end items-center gap-3 pt-4 pb-1 shrink-0">
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
                  activeTab === "nlp" ? handleNextToEcg :
                    activeTab === "ecg" ? handleNextToLab :
                      handleNextToAnalysis
                }
                disabled={
                  isAdvancing || !workflowSessionId ||
                  (activeTab === "nlp" && summary.symptoms.length === 0) ||
                  (activeTab === "ecg" && !summary.ecgResult) ||
                  (activeTab === "lab" && !summary.labResult && !labSkipped)
                }
                className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all gap-2 group"
              >
                {isAdvancing ? "Saving..." : (
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

// UI HELPERS
function Badge({
  icon,
  text,
  active,
}: {
  icon: any;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${active
        ? "bg-primary/10 border-primary/20 text-primary glow-primary-sm"
        : "bg-white/5 border-white/10 text-muted-foreground"
        }`}
    >
      {icon}
      {text}
    </div>
  );
}

function LinkButton({
  icon,
  text,
  onClick,
}: {
  icon: any;
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
  icon: any;
  title: string;
  description: string;
  children: React.ReactNode;
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
