"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import type SimplePeerType from "simple-peer";
import {
  Mic,
  MicOff,
  PhoneOff,
  Loader2,
  Heart,
} from "lucide-react";

const POLL_INTERVAL = 1500;

export default function PatientCallPage() {
  const { callId } = useParams();

  const [connectionState, setConnectionState] = useState<
    "joining" | "connecting" | "connected" | "ended"
  >("joining");
  const [isListening, setIsListening] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [currentSpeechText, setCurrentSpeechText] = useState("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<SimplePeerType.Instance | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check SR support
  const hasSR = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (connectionState === "connected" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [connectionState, remoteStream]);

  useEffect(() => {
    if (callId) joinCall();
    return () => cleanupAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  function cleanupAll() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    stopRecognition();
  }

  // --- Simple Speech Recognition (NO auto-restart) ---
  function startRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    stopRecognition();

    try {
      const rec = new SR() as SpeechRecognition;
      rec.lang = "si-LK";
      rec.continuous = true;
      rec.interimResults = true;

      let accumulated = "";

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let newFinal = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const txt = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newFinal += txt;
          } else {
            interim += txt;
          }
        }

        if (newFinal) {
          accumulated += (accumulated ? " " : "") + newFinal.trim();
          const full = accumulated.trim();
          // Send to doctor via data channel
          if (full && peerRef.current) {
            try {
              peerRef.current.send(JSON.stringify({ type: "transcript", text: full }));
            } catch {}
          }
        }
        setCurrentSpeechText(accumulated + (interim ? " " + interim : ""));
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn("Patient SR error:", e.error);
      };

      rec.onend = () => {
        // NO auto-restart — user can manually toggle mic
        console.log("Patient SR ended naturally");
        setIsListening(false);
        setCurrentSpeechText("");
      };

      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
      console.log("Patient speech recognition started ✓");
    } catch (err) {
      console.error("Failed to start Patient SR:", err);
    }
  }

  function stopRecognition() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setCurrentSpeechText("");
  }

  async function joinCall() {
    try {
      const SimplePeer = (await import("simple-peer")).default;

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const peer = new SimplePeer({ initiator: false, trickle: true, stream });

      peer.on("signal", async (sig: unknown) => {
        await fetch("/api/call/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId, role: "patient", signal: sig }),
        });
      });

      peer.on("stream", (s: MediaStream) => setRemoteStream(s));

      peer.on("connect", () => {
        setConnectionState("connected");
        // Start speech recognition directly 
        startRecognition();
      });

      peer.on("close", () => {
        setConnectionState("ended");
        stopRecognition();
      });

      peer.on("error", (err: Error) => {
        console.error("Patient peer error:", err);
      });

      peerRef.current = peer;

      setConnectionState("connecting");
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/call/signal?callId=${callId}&role=patient`);
          const { signals } = await res.json();
          if (signals?.length > 0) {
            for (const s of signals) peer.signal(s);
          }
        } catch {}
      }, POLL_INTERVAL);
    } catch (error) {
      console.error("Failed to join call:", error);
    }
  }

  const leaveCall = () => {
    cleanupAll();
    setConnectionState("ended");
  };

  const remoteVideoCallbackRef = useCallback(
    (node: HTMLVideoElement | null) => {
      (remoteVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      if (node && remoteStream) node.srcObject = remoteStream;
    },
    [remoteStream]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col text-white">
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
            <Heart className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight">HeartSense AI</h1>
            <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Telemedicine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${
            connectionState === "connected" ? "bg-emerald-500 animate-pulse"
              : connectionState === "connecting" ? "bg-yellow-500 animate-pulse"
              : connectionState === "ended" ? "bg-red-500"
              : "bg-white/20"
          }`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
            {connectionState === "joining" && "Joining..."}
            {connectionState === "connecting" && "Connecting..."}
            {connectionState === "connected" && "Connected"}
            {connectionState === "ended" && "Call Ended"}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {connectionState === "ended" ? (
          <div className="text-center space-y-4">
            <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mx-auto">
              <PhoneOff className="h-8 w-8 text-white/30" />
            </div>
            <h2 className="text-xl font-black">Consultation Ended</h2>
            <p className="text-sm text-white/50 max-w-xs">You may close this window.</p>
          </div>
        ) : (
          <>
            <div className="w-full max-w-4xl grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-[10px] font-bold uppercase tracking-wider">You (Patient)</div>
                {isListening && (
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold flex items-center gap-1.5 animate-pulse">
                    <Mic className="h-3 w-3" /> Listening
                  </div>
                )}
              </div>
              <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl">
                <video ref={remoteVideoCallbackRef} autoPlay playsInline className={`w-full h-full object-cover ${!remoteStream ? "hidden" : ""}`} />
                {!remoteStream && (
                  <div className="w-full h-full flex items-center justify-center absolute inset-0">
                    <div className="text-center"><Loader2 className="h-12 w-12 text-white/10 animate-spin mx-auto mb-4" /><p className="text-xs text-white/30 font-bold">Connecting...</p></div>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-[10px] font-bold uppercase tracking-wider">Doctor</div>
              </div>
            </div>

            {currentSpeechText && (
              <div className="w-full max-w-2xl rounded-xl border border-white/10 p-4 bg-black/40">
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Your speech (Sinhala)</p>
                <p className="text-sm text-white/70 leading-relaxed">{currentSpeechText}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => isListening ? stopRecognition() : startRecognition()}
                className={`h-14 w-14 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? "bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400"
                    : "bg-white/10 border-2 border-white/10 text-white/50 hover:bg-white/20"
                }`}
              >
                {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button onClick={leaveCall} className="h-14 px-8 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-red-600/20">
                <PhoneOff className="h-4 w-4" /> Leave Call
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
