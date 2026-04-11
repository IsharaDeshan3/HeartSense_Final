"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Activity,
  AlertCircle,
  History,
  Check,
  Shield,
  Edit3,
  Heart,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ApprovalEditor, { CurrentState, SymptomData } from "./ApprovalEditor";
import VideoCallModal from "./VideoCallModal";

interface NlpProcessorProps {
  readonly onUpdateSummary: (extractedData: any) => void;
  readonly currentState: CurrentState;
  readonly onCurrentStateChange: (s: CurrentState) => void;
}

interface BackendResponse {
  updated_state: CurrentState;
  missing_critical: {
    symptoms: string[];
    risk_factors: string[];
  };
  translated_text: string;
}

const TRANSCRIPT_PROXY_URL = "/api/proxy/process-transcript";

type ExtractionPair = [string, SymptomData];

type ExtractionSection = {
  key: keyof CurrentState;
  label: string;
  icon: LucideIcon;
  accent: "orange" | "blue" | "red" | "primary";
  empty: string;
  description: string;
  total: number;
  approved: ExtractionPair[];
  pending: ExtractionPair[];
};

type GuidanceState = {
  title: string;
  primary: string;
  chips: string[];
};

const extractionCategories = [
  {
    key: "symptoms",
    label: "Confirmed Symptoms",
    icon: AlertCircle,
    accent: "orange",
    empty: "Awaiting symptom extraction from stream...",
    description: "Live symptom signals from the conversation.",
  },
  {
    key: "medical_history",
    label: "Known History",
    icon: History,
    accent: "blue",
    empty: "No medical history captured yet.",
    description: "Past diagnoses, interventions, and relevant history.",
  },
  {
    key: "allergies",
    label: "Documented Allergies",
    icon: Heart,
    accent: "red",
    empty: "No allergies identified.",
    description: "Allergy and sensitivity items needing confirmation.",
  },
  {
    key: "risk_factors",
    label: "Current Risk Factors",
    icon: Shield,
    accent: "primary",
    empty: "No risk factors identified in current context.",
    description: "Cardiac and clinical risks that need follow-up.",
  },
] as const;

export default function NlpProcessor({
  onUpdateSummary,
  currentState,
  onCurrentStateChange,
}: NlpProcessorProps) {
  const [sessionId] = useState(`session_${Date.now()}`);
  const [backendResponse, setBackendResponse] =
    useState<BackendResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranslated, setLastTranslated] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const delayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const extractionSections = useMemo<ExtractionSection[]>(
    () =>
      extractionCategories.map((section) => {
        const entries = Object.entries(
          currentState[section.key],
        ) as ExtractionPair[];
        const approved = entries.filter(
          ([, entry]) => entry.status === "approved",
        );
        const pending = entries.filter(
          ([, entry]) => entry.status !== "approved",
        );

        return {
          ...section,
          total: entries.length,
          approved,
          pending,
        };
      }),
    [currentState],
  );

  const guidance = useMemo<GuidanceState>(() => {
    const symptoms = backendResponse?.missing_critical.symptoms ?? [];
    const riskFactors = backendResponse?.missing_critical.risk_factors ?? [];

    if (symptoms.length > 0) {
      return {
        title: "Ask next",
        primary: `Clarify ${symptoms[0].toLowerCase()} first, then ask about onset, severity, radiation, and duration.`,
        chips: symptoms.slice(0, 4),
      };
    }

    if (riskFactors.length > 0) {
      return {
        title: "Ask next",
        primary: `Verify ${riskFactors[0].toLowerCase()} and ask about medications, family history, and prior episodes.`,
        chips: riskFactors.slice(0, 4),
      };
    }

    return {
      title: "Ask next",
      primary:
        "Stay in capture mode. The next extracted findings will surface here as the conversation continues.",
      chips: ["Onset", "Severity", "Triggers", "Duration"],
    };
  }, [backendResponse]);

  const totalApproved = extractionSections.reduce<number>(
    (sum, section) => sum + section.approved.length,
    0,
  );
  const totalPending = extractionSections.reduce<number>(
    (sum, section) => sum + section.pending.length,
    0,
  );

  // Function to approve an item inline
  const approveItem = (category: keyof CurrentState, key: string) => {
    onCurrentStateChange({
      ...currentState,
      [category]: {
        ...currentState[category],
        [key]: {
          ...currentState[category][key],
          status: "approved",
        },
      },
    });
  };

  // Send transcript to backend
  const sendTranscript = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch(TRANSCRIPT_PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          transcript_si: transcriptText,
          current_state: currentState,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to process transcript");
      }

      const data: BackendResponse = await response.json();
      setBackendResponse(data);
      onCurrentStateChange(data.updated_state);
      setLastTranslated(data.translated_text);
      onUpdateSummary(data);
      resetTranscript();
    } catch (error) {
      console.error("Error processing transcript:", error);
      toast.error("Extraction Synthesis Refused");
    } finally {
      setIsProcessing(false);
    }
  };

  // Schedule API call with delay
  const scheduleApiCall = (transcriptText: string) => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
    }
    delayTimerRef.current = setTimeout(() => {
      sendTranscript(transcriptText);
    }, 2500);
  };

  // Handle when listening starts — skip during video call (VideoCallModal manages its own)
  useEffect(() => {
    if (showVideoCall) return;
    if (listening) {
      resetTranscript();
      const timer = setTimeout(() => {
        if (transcript) {
          scheduleApiCall(transcript);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [listening, showVideoCall]);

  // Handle when listening stops — skip during video call
  const handleStopListening = () => {
    if (showVideoCall) return;
    SpeechRecognition.stopListening();
    if (transcript) {
      scheduleApiCall(transcript);
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
      }
    };
  }, []);

  // When entering video call mode, stop react-speech-recognition completely
  // so it doesn't hold the browser's single SpeechRecognition slot
  useEffect(() => {
    if (showVideoCall) {
      SpeechRecognition.abortListening();
      resetTranscript();
    }
  }, [showVideoCall]);

  const toggleListening = () => {
    if (listening) {
      handleStopListening();
    } else {
      SpeechRecognition.startListening({
        continuous: true,
        language: "si-LK",
      });
      toast.info("Neural Gateway Active: Capturing Sinhala Stream");
    }
  };

  // Helper to count items in a category
  const countItems = (items: Record<string, SymptomData>) =>
    Object.keys(items).length;
  const countPending = (items: Record<string, SymptomData>) =>
    Object.values(items).filter((v) => v.status !== "approved").length;
  const countApproved = (items: Record<string, SymptomData>) =>
    Object.values(items).filter((v) => v.status === "approved").length;

  // Extract approved items as arrays for summary
  const getApprovedSummary = (state: CurrentState) => ({
    symptoms: Object.values(state.symptoms)
      .filter((v) => v.status === "approved")
      .map((v) => v.value),
    medical_history: Object.values(state.medical_history)
      .filter((v) => v.status === "approved")
      .map((v) => v.value),
    allergies: Object.values(state.allergies)
      .filter((v) => v.status === "approved")
      .map((v) => v.value),
    risk_factors: Object.values(state.risk_factors)
      .filter((v) => v.status === "approved")
      .map((v) => v.value),
  });

  // Handle save from ApprovalEditor
  const handleSaveAndClose = (finalState: CurrentState) => {
    onCurrentStateChange(finalState);
    const summary = getApprovedSummary(finalState);
    onUpdateSummary({ updated_state: finalState, summary });
    try {
      localStorage.setItem("nlp.currentState", JSON.stringify(finalState));
      localStorage.setItem("nlp.summary", JSON.stringify(summary));
    } catch {}
    setShowEditor(false);
  };

  // Handle video call end — send merged transcript to NLP backend
  const handleVideoCallEnd = async (mergedTranscript: string) => {
    setShowVideoCall(false);
    if (!mergedTranscript.trim()) {
      toast.warning("No transcription captured during the call");
      return;
    }
    toast.info("Processing call transcription...");
    await sendTranscript(mergedTranscript);
    setShowEditor(true);
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="p-10 glass rounded-4xl text-center border-destructive/20 text-destructive underline">
        Critical: Browser Architecture lacks Neural Audio API Support.
      </div>
    );
  }

  return (
    <>
      {showVideoCall && (
        <VideoCallModal
          onCallEnd={handleVideoCallEnd}
          onClose={() => setShowVideoCall(false)}
        />
      )}
      {showEditor ? (
        // Full-screen Editor View (replaces main content)
        <div className="animate-in fade-in duration-300">
          <ApprovalEditor
            sessionId={sessionId}
            initialState={currentState}
            onStateChange={(next) => {
              onCurrentStateChange(next);
              try {
                localStorage.setItem("nlp.currentState", JSON.stringify(next));
              } catch {}
            }}
            onSave={handleSaveAndClose}
            onClose={() => setShowEditor(false)}
          />
        </div>
      ) : (
        // Main NLP Processor View
        <div className="flex flex-col gap-4 animate-in fade-in duration-700">
          <div className="grid gap-4 xl:grid-cols-[1.05fr_1.25fr]">
            <section className="glass relative overflow-hidden rounded-4xl border border-border/70 p-5 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-r from-primary/10 via-transparent to-accent/10" />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Live capture
                  </p>
                  <h3 className="mt-1 text-2xl font-black tracking-tight text-foreground">
                    Conversation stream
                  </h3>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-6">
                    Speak naturally. The system captures the transcript,
                    extracts clinical findings, and surfaces the next question
                    while the call is still happening.
                  </p>
                </div>
                <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${listening ? "bg-emerald-400 animate-pulse" : isProcessing ? "bg-amber-400 animate-pulse" : "bg-primary"}`}
                    />
                    {showVideoCall
                      ? "Video call"
                      : isProcessing
                        ? "Processing"
                        : listening
                          ? "Listening"
                          : "Ready"}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button
                      onClick={toggleListening}
                      disabled={isProcessing || showVideoCall}
                      className={`h-12 w-12 rounded-full border p-0 transition-all ${
                        listening
                          ? "border-destructive/30 bg-destructive/10 text-destructive shadow-[0_0_0_8px_rgba(239,68,68,0.08)] animate-pulse"
                          : "border-border/70 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105"
                      }`}
                      aria-label={
                        listening ? "Stop voice capture" : "Start voice capture"
                      }
                    >
                      {listening ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </Button>

                    <Button
                      onClick={() => setShowVideoCall(true)}
                      disabled={isProcessing || listening}
                      className="h-11 rounded-full border border-violet-500/20 bg-violet-600 px-4 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 hover:scale-[1.02]"
                      title="Start Video Call"
                    >
                      <Video className="mr-1.5 h-4 w-4" />
                      Video
                    </Button>

                    <Button
                      onClick={() => {
                        try {
                          localStorage.setItem("nlp.sessionId", sessionId);
                          localStorage.setItem(
                            "nlp.currentState",
                            JSON.stringify(currentState),
                          );
                        } catch (e) {
                          console.error("Failed to persist to localStorage", e);
                        }
                        setShowEditor(true);
                      }}
                      className="h-11 rounded-full border border-border/70 bg-card px-4 text-xs font-black uppercase tracking-[0.16em] text-foreground shadow-sm transition-all hover:bg-muted/60"
                    >
                      <Edit3 className="mr-1.5 h-4 w-4" />
                      Review
                    </Button>
                  </div>

                  {isProcessing && (
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                      <Activity className="h-3.5 w-3.5 animate-pulse" />
                      Processing voice input
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-border/60 bg-card/75 p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    Approved summary
                  </p>
                  <div className="mt-3 min-h-44 rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={
                          totalApproved || (listening ? "listening" : "idle")
                        }
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-3"
                      >
                        {totalApproved > 0 ? (
                          <div className="space-y-3">
                            {extractionSections
                              .filter((section) => section.approved.length > 0)
                              .map((section) => (
                                <div key={section.key} className="space-y-1.5">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                    {section.label}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {section.approved
                                      .slice(0, 4)
                                      .map(([key, data]) => (
                                        <span
                                          key={key}
                                          className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"
                                        >
                                          {data.value}
                                        </span>
                                      ))}
                                    {section.approved.length > 4 && (
                                      <span className="rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        +{section.approved.length - 4} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-foreground/85">
                              No approved findings yet.
                            </p>
                            <p className="text-xs leading-6 text-muted-foreground">
                              Confirmed symptoms and clinical facts will appear
                              here as soon as they are approved.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-3xl border border-border/60 bg-card/75 p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                      Latest synthesis
                    </p>
                    <p className="mt-3 text-sm leading-6 text-foreground">
                      {lastTranslated || "Waiting for the first extraction."}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/60 bg-card/75 p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                      Extraction status
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                        {totalApproved} approved
                      </span>
                      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-500">
                        {totalPending} pending
                      </span>
                      <span className="rounded-full bg-muted/60 px-3 py-1 text-[11px] font-bold text-muted-foreground">
                        {currentState.symptoms &&
                          Object.keys(currentState.symptoms).length +
                            Object.keys(currentState.medical_history).length +
                            Object.keys(currentState.allergies).length +
                            Object.keys(currentState.risk_factors).length}{" "}
                        total items
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="glass rounded-4xl border border-border/70 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Next question
                  </p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-foreground">
                    Ask before the next pause
                  </h3>
                </div>
                <div className="rounded-full bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Guided prompt
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-border/60 bg-muted/20 p-4">
                <p className="text-base font-semibold leading-7 text-foreground">
                  {guidance.primary}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {guidance.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {backendResponse && (
                <div className="mt-4 rounded-3xl border border-border/60 bg-card/75 p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    Clarify these
                  </p>
                  <div className="mt-3 space-y-3">
                    {backendResponse.missing_critical.symptoms?.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">
                          <span className="h-2 w-2 rounded-full bg-orange-400" />{" "}
                          Symptoms
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {backendResponse.missing_critical.symptoms.map(
                            (s) => (
                              <span
                                key={s}
                                className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[11px] font-bold text-orange-600"
                              >
                                {s}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {backendResponse.missing_critical.risk_factors?.length >
                      0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-500">
                          <span className="h-2 w-2 rounded-full bg-rose-400" />{" "}
                          Risk factors
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {backendResponse.missing_critical.risk_factors.map(
                            (r) => (
                              <span
                                key={r}
                                className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-600"
                              >
                                {r}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {extractionSections.map((section) => {
              const Icon = section.icon;

              const accentClasses =
                section.accent === "orange"
                  ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                  : section.accent === "blue"
                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    : section.accent === "red"
                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      : "bg-primary/10 text-primary border-primary/20";

              return (
                <section
                  key={section.key}
                  className="glass rounded-4xl border border-border/70 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${accentClasses}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground">
                          {section.label}
                        </h4>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                        {section.approved.length} confirmed
                      </span>
                      {section.pending.length > 0 && (
                        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">
                          {section.pending.length} pending
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {section.pending.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                          Needs review
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <AnimatePresence initial={false} mode="popLayout">
                            {section.pending.map(([key, data], index) => (
                              <motion.button
                                layout
                                key={key}
                                type="button"
                                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                transition={{
                                  duration: 0.2,
                                  delay: index * 0.03,
                                }}
                                onClick={() =>
                                  data.status !== "approved" &&
                                  approveItem(section.key, key)
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 transition-colors hover:bg-amber-500/20"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                {data.value}
                              </motion.button>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {section.approved.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                          Captured
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <AnimatePresence initial={false} mode="popLayout">
                            {section.approved.map(([key, data], index) => (
                              <motion.span
                                layout
                                key={key}
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                transition={{
                                  duration: 0.22,
                                  delay: index * 0.02,
                                }}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                                  section.accent === "orange"
                                    ? "border-orange-500/20 bg-orange-500/5 text-orange-700"
                                    : section.accent === "blue"
                                      ? "border-blue-500/20 bg-blue-500/5 text-blue-700"
                                      : section.accent === "red"
                                        ? "border-rose-500/20 bg-rose-500/5 text-rose-700"
                                        : "border-primary/20 bg-primary/5 text-primary"
                                }`}
                              >
                                <Check className="h-3 w-3" />
                                {data.value}
                              </motion.span>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {section.total === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                        {section.empty}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
