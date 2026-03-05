"use client";

import { HeartPulse, Activity, Zap, ChevronRight } from "lucide-react";
import EcgInterpreter from "@/components/EcgInterpreter";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function DiagnosticsPage() {
  const [isNightMode, setIsNightMode] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("clinical-night-mode") === "true";
    setIsNightMode(savedMode);
  }, []);

  return (
    <div className={`min-h-screen bg-background text-foreground p-10 space-y-12 relative overflow-hidden clinical-access ${isNightMode ? "night-mode" : ""}`}>
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] -z-10"></div>
      
      {/* Breadcrumbs / Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 max-w-7xl mx-auto">
        <div className="space-y-2">
           <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Link href="/dashboard/doctor" className="hover:text-primary transition-colors">Workspace</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-primary">AI Diagnostics</span>
           </div>
           <h1 className="text-4xl font-extrabold tracking-tight italic">Diagnostic <span className="text-primary">Core</span></h1>
           <p className="text-muted-foreground text-sm max-w-lg">
             Leverage high-performance neural synthesis for noise-robust cardiac waveform interpretation.
           </p>
        </div>

        <div className="flex items-center gap-4 border border-border px-6 py-4 rounded-[2rem] bg-card shadow-sm">
           <ThemeToggle />
           <div className="text-right">
              <p className="text-xs font-bold text-accent tracking-widest uppercase italic">Neural Sync Active</p>
              <p className="text-[10px] text-muted-foreground uppercase opacity-50">HeartSense-v2.0 // Gemini-Flash</p>
           </div>
           <div className="h-12 w-12 rounded-2xl bg-accent/10 flex-center text-accent">
              <Zap className="h-6 w-6 animate-pulse" />
           </div>
        </div>
      </header>

      {/* Main Diagnostic Workspace */}
      <main className="max-w-7xl mx-auto">
         <div className="flex flex-col items-center justify-center">
            <div className="w-full space-y-6">
               <div className="flex items-center gap-4">
                  <div className="h-10 w-1 bg-primary rounded-full"></div>
                  <h2 className="text-xl font-bold tracking-tight">ECG Expert Interpreter</h2>
               </div>
               <EcgInterpreter />
            </div>
         </div>
      </main>

      {/* Footer / Status */}
      <footer className="max-w-7xl mx-auto pt-20 flex flex-col items-center opacity-30">
         <div className="flex items-center gap-4 mb-4">
            <HeartPulse className="h-5 w-5" />
            <Activity className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.5em]">HEARTSENSE AI RESEARCH</span>
         </div>
         <p className="text-[10px] text-center max-w-md leading-relaxed uppercase tracking-widest">
            Diagnostic engine 2.5. synchronized with global clinical patterns.
         </p>
      </footer>
    </div>
  );
}
