
"use client";

import { useState, useEffect, useRef } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, MicOff, Activity, AlertCircle, History, Check, Shield, Edit3, Heart, Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ApprovalEditor, { CurrentState, SymptomData } from "./ApprovalEditor";
import VideoCallModal from "./VideoCallModal";

interface NlpProcessorProps {
  readonly onUpdateSummary: (extractedData: any) => void;
}

interface BackendResponse {
  updated_state: CurrentState;
  missing_critical: {
    symptoms: string[];
    risk_factors: string[];
  };
  translated_text: string;
}

const BACKEND_URL = "http://localhost:8001";

export default function NlpProcessor({ onUpdateSummary }: NlpProcessorProps) {
  const [sessionId] = useState(`session_${Date.now()}`);
  const [currentState, setCurrentState] = useState<CurrentState>({
    symptoms: {},
    medical_history: {},
    allergies: {},
    risk_factors: {},
  });
  const [backendResponse, setBackendResponse] = useState<BackendResponse | null>(null);
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

  // Function to approve an item inline
  const approveItem = (category: keyof CurrentState, key: string) => {
    setCurrentState((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: {
          ...prev[category][key],
          status: "approved",
        },
      },
    }));
  };

  // Send transcript to backend
  const sendTranscript = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/process-transcript`, {
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
      setCurrentState(data.updated_state);
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
    }, 5000);
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
      }, 3000);
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
  const countItems = (items: Record<string, SymptomData>) => Object.keys(items).length;
  const countPending = (items: Record<string, SymptomData>) => 
    Object.values(items).filter(v => v.status !== "approved").length;
  const countApproved = (items: Record<string, SymptomData>) => 
    Object.values(items).filter(v => v.status === "approved").length;

  // Extract approved items as arrays for summary
  const getApprovedSummary = (state: CurrentState) => ({
    symptoms: Object.values(state.symptoms).filter(v => v.status === "approved").map(v => v.value),
    medical_history: Object.values(state.medical_history).filter(v => v.status === "approved").map(v => v.value),
    allergies: Object.values(state.allergies).filter(v => v.status === "approved").map(v => v.value),
    risk_factors: Object.values(state.risk_factors).filter(v => v.status === "approved").map(v => v.value),
  });

  // Handle save from ApprovalEditor
  const handleSaveAndClose = (finalState: CurrentState) => {
    setCurrentState(finalState);
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
      <div className="p-10 glass rounded-[2rem] text-center border-destructive/20 text-destructive underline">
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
              setCurrentState(next);
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-in fade-in duration-700">
        {/* 🎙️ NEURAL GATEWAY / RECORDER */}
        <div className="flex flex-col gap-3">
          <div className={`relative glass rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all duration-1000 border-2 ${listening ? 'border-primary/40 shadow-[0_0_50px_rgba(var(--primary-rgb),0.1)]' : 'border-white/5'
            }`}>
            {/* Pulsing Core */}
            <div className={`h-14 w-14 rounded-full flex-center mb-3 relative ${listening ? 'bg-primary/20 animate-pulse' : 'bg-white/5'
              }`}>
              {listening && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-20"></div>
                  <div className="absolute -inset-4 rounded-full border border-primary/10 animate-pulse"></div>
                </>
              )}
              {listening ? <Mic className="h-6 w-6 text-primary" /> : <MicOff className="h-6 w-6 text-muted-foreground opacity-20" />}
            </div>

            <h3 className="text-sm font-black tracking-tight mb-0.5">
              {listening ? "Capturing Voice..." : "AI Voice Recognition is Active"}
            </h3>
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold opacity-60 mb-3 max-w-[220px]">
              {listening ? "Listening to patient conversation in Sinhala" : "Tap the button below to start capturing"}
            </p>

            <div className="flex items-center gap-3">
              <Button
                onClick={toggleListening}
                disabled={isProcessing}
                className={`h-10 px-6 rounded-lg font-black uppercase tracking-[0.12em] transition-all text-xs ${listening
                  ? 'bg-destructive/10 text-destructive border-2 border-destructive/20 hover:bg-destructive/20'
                  : 'bg-primary text-primary-foreground shadow-lg glow-primary border-none hover:scale-105'
                  }`}
              >
                {listening ? "Stop Capture" : "Start Voice Capture"}
              </Button>

              <Button
                onClick={() => setShowVideoCall(true)}
                disabled={isProcessing || listening}
                className="h-10 w-10 p-0 rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/20 transition-all hover:scale-105"
                title="Start Video Call"
              >
                <Video className="h-4 w-4" />
              </Button>
            </div>

            {isProcessing && (
              <div className="absolute bottom-3 flex items-center gap-2 text-[9px] font-black text-primary animate-pulse">
                <Activity className="h-3 w-3" /> Processing voice input...
              </div>
            )}
          </div>

          {/* Translation Preview */}
          {lastTranslated && (
            <Card className="glass border-white/5 bg-white/[0.01] rounded-xl overflow-hidden transition-all animate-in slide-in-from-left-4">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-3 w-3 text-primary opacity-50" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Translated Text (English)</span>
                </div>
                <p className="text-xs italic text-foreground/70 leading-relaxed">&quot;{lastTranslated}&quot;</p>
              </CardContent>
            </Card>
          )}

          {/* Missing Critical Information */}
          {backendResponse && (
            (backendResponse.missing_critical.symptoms?.length > 0 || 
             backendResponse.missing_critical.risk_factors?.length > 0) && (
            <Card className="glass border-destructive/20 bg-destructive/5 rounded-xl overflow-hidden animate-in slide-in-from-left-4">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-destructive">Missing Critical Info</span>
                </div>
                
                {backendResponse.missing_critical.symptoms?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[8px] font-bold text-destructive/70 mb-1">Symptoms to Check:</p>
                    <div className="flex flex-wrap gap-1">
                      {backendResponse.missing_critical.symptoms.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[9px] font-bold border border-destructive/20">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {backendResponse.missing_critical.risk_factors?.length > 0 && (
                  <div>
                    <p className="text-[8px] font-bold text-destructive/70 mb-1">Risk Factors to Check:</p>
                    <div className="flex flex-wrap gap-1">
                      {backendResponse.missing_critical.risk_factors.map((r) => (
                        <span key={r} className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[9px] font-bold border border-destructive/20">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 📊 EXTRACTED DATA PANEL */}
        <div className="space-y-1">
          {/* Identified Symptoms */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2rem] shadow-xl overflow-hidden hover:border-primary/20 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex-center text-orange-500">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest">Active Symptoms</h4>
                </div>
                <div className="flex items-center gap-2">
                  {countPending(currentState.symptoms) > 0 && (
                    <span className="text-[9px] font-bold text-yellow-400 px-2 py-0.5 bg-yellow-500/10 rounded-lg">
                      {countPending(currentState.symptoms)} pending
                    </span>
                  )}
                  <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 bg-white/5 rounded-lg uppercase">
                    {countApproved(currentState.symptoms)} approved
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {countItems(currentState.symptoms) > 0 ? (
                  Object.entries(currentState.symptoms).map(([key, data]) => (
                    <button 
                      key={key}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-[10px] font-black border animate-in zoom-in-95 duration-300 flex items-center gap-1.5 ${
                        data.status === "approved" 
                          ? "bg-orange-500/5 text-orange-400 border-orange-500/10" 
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20"
                      }`}
                      onClick={() => data.status !== "approved" && approveItem("symptoms", key)}
                      disabled={data.status === "approved"}
                    >
                      {data.status === "approved" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <span className="text-[8px]">⏳</span>
                      )}
                      {data.value.toUpperCase()}
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] italic text-muted-foreground/30 py-2">Awaiting symptom extraction from stream...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Medical History */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2rem] shadow-xl overflow-hidden hover:border-primary/20 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex-center text-blue-500">
                    <History className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest">Medical History</h4>
                </div>
                {countItems(currentState.medical_history) > 0 && (
                  <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 bg-white/5 rounded-lg uppercase">
                    {countApproved(currentState.medical_history)} items
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {countItems(currentState.medical_history) > 0 ? (
                  Object.entries(currentState.medical_history).map(([key, data]) => (
                    <button 
                      key={key}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-[10px] font-black border animate-in zoom-in-95 duration-300 flex items-center gap-1.5 ${
                        data.status === "approved" 
                          ? "bg-blue-500/5 text-blue-400 border-blue-500/10" 
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20"
                      }`}
                      onClick={() => data.status !== "approved" && approveItem("medical_history", key)}
                      disabled={data.status === "approved"}
                    >
                      {data.status === "approved" ? <Check className="h-3 w-3" /> : <span className="text-[8px]">⏳</span>}
                      {data.value.toUpperCase()}
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] italic text-muted-foreground/30 py-2">No medical history captured yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Allergies */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2rem] shadow-xl overflow-hidden hover:border-primary/20 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex-center text-red-500">
                    <Heart className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest">Allergies</h4>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {countItems(currentState.allergies) > 0 ? (
                  Object.entries(currentState.allergies).map(([key, data]) => (
                    <button 
                      key={key}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-[10px] font-black border animate-in zoom-in-95 duration-300 flex items-center gap-1.5 ${
                        data.status === "approved" 
                          ? "bg-red-500/5 text-red-400 border-red-500/10" 
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20"
                      }`}
                      onClick={() => data.status !== "approved" && approveItem("allergies", key)}
                      disabled={data.status === "approved"}
                    >
                      {data.status === "approved" ? <Check className="h-3 w-3" /> : <span className="text-[8px]">⏳</span>}
                      {data.value.toUpperCase()}
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] italic text-muted-foreground/30 py-2">No allergies identified.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Risk Factors */}
          <Card className="glass border-white/5 bg-white/[0.02] rounded-[2rem] shadow-xl overflow-hidden hover:border-primary/20 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex-center text-primary">
                    <Shield className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest">Cardiac Risk Factors</h4>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {countItems(currentState.risk_factors) > 0 ? (
                  Object.entries(currentState.risk_factors).map(([key, data]) => (
                    <button 
                      key={key}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-[10px] font-black border animate-in zoom-in-95 duration-300 flex items-center gap-1.5 ${
                        data.status === "approved" 
                          ? "bg-primary/5 text-primary border-primary/10" 
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20"
                      }`}
                      onClick={() => data.status !== "approved" && approveItem("risk_factors", key)}
                      disabled={data.status === "approved"}
                    >
                      {data.status === "approved" ? <Check className="h-3 w-3" /> : <span className="text-[8px]">⏳</span>}
                      {data.value.toUpperCase()}
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] italic text-muted-foreground/30 py-2">No risk factors identified in current context.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Edit/Review Button */}
          <Button
            onClick={() => {
              try {
                localStorage.setItem("nlp.sessionId", sessionId);
                localStorage.setItem("nlp.currentState", JSON.stringify(currentState));
              } catch (e) {
                console.error("Failed to persist to localStorage", e);
              }
              setShowEditor(true);
            }}
            className="w-full h-10 rounded-xl font-black uppercase tracking-wider text-xs mt-2 bg-indigo-600 hover:bg-indigo-700"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Review & Edit Extracted Data
          </Button>
        </div>
        </div>
      )}
    </>
  );
}
