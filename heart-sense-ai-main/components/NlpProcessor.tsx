
"use client";

import { useState, useEffect, useRef } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, MicOff, Activity, AlertCircle, History, Check, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExtractionService, MedicalState } from "@/services/ExtractionService";

interface NlpProcessorProps {
  onUpdateSummary: (extractedData: any) => void;
}

export default function NlpProcessor({ onUpdateSummary }: NlpProcessorProps) {
  const [medicalState, setMedicalState] = useState<MedicalState>({
    symptoms: [],
    medical_history: [],
    allergies: [],
    risk_factors: [],
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranslated, setLastTranslated] = useState("");

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const sendingRef = useRef(false);

  // 🔹 Auto-flush on silence
  useEffect(() => {
    if (!transcript) return;

    if (silenceTimer.current) clearTimeout(silenceTimer.current);

    silenceTimer.current = setTimeout(() => {
      handleExtraction(transcript);
    }, 2500);
  }, [transcript]);

  const handleExtraction = async (textChunk: string) => {
    if (!textChunk.trim() || sendingRef.current) return;

    sendingRef.current = true;
    setIsProcessing(true);

    try {
      const result = await ExtractionService.processTranscript(textChunk, medicalState);

      if (result) {
        setMedicalState(result.updated_state);
        setLastTranslated(result.translated_text);
        onUpdateSummary(result);
        resetTranscript();
      }
    } catch (error) {
      toast.error("Extraction Synthesis Refused");
    } finally {
      sendingRef.current = false;
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({
        continuous: true,
        language: "si-LK", // Capture in Sinhala
      });
      toast.info("Neural Gateway Active: Capturing Sinhala Stream");
    }
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="p-10 glass rounded-[2rem] text-center border-destructive/20 text-destructive underline">
        Critical: Browser Architecture lacks Neural Audio API Support.
      </div>
    );
  }

  return (
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

          <Button
            onClick={toggleListening}
            className={`h-10 px-6 rounded-lg font-black uppercase tracking-[0.12em] transition-all text-xs ${listening
              ? 'bg-destructive/10 text-destructive border-2 border-destructive/20 hover:bg-destructive/20'
              : 'bg-primary text-primary-foreground shadow-lg glow-primary border-none hover:scale-105'
              }`}
          >
            {listening ? "Stop Capture" : "Start Voice Capture"}
          </Button>

          {isProcessing && (
            <div className="absolute bottom-3 flex items-center gap-2 text-[9px] font-black text-primary animate-pulse">
              <Activity className="h-3 w-3" /> Processing voice input...
            </div>
          )}
        </div>

        {/* Translation Preview (Optional, helpful for the doctor to see the AI's internal Eng understanding) */}
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
              <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 bg-white/5 rounded-lg uppercase">Extracted</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {medicalState.symptoms.length > 0 ? medicalState.symptoms.map((tag, i) => (
                <div key={i} className="px-3 py-1 rounded-lg bg-orange-500/5 text-orange-400 text-[10px] font-black border border-orange-500/10 animate-in zoom-in-95 duration-300 flex items-center gap-1.5">
                  <Check className="h-3 w-3" /> {tag.toUpperCase()}
                </div>
              )) : (
                <p className="text-[10px] italic text-muted-foreground/30 py-2">Awaiting symptom extraction from stream...</p>
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
              {medicalState.risk_factors.length > 0 ? medicalState.risk_factors.map((tag, i) => (
                <div key={i} className="px-3 py-1 rounded-lg bg-primary/5 text-primary text-[10px] font-black border border-primary/10 animate-in zoom-in-95 duration-300">
                  {tag.toUpperCase()}
                </div>
              )) : (
                <p className="text-[10px] italic text-muted-foreground/30 py-2">No risk factors identified in current context.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
