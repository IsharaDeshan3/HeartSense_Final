"use client";

import { HeartPulse, Activity, Zap, ChevronRight } from "lucide-react";
import LabSuggester from "@/components/LabSuggester";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import Link from "next/link";
import { useState, useEffect } from "react";
import DiagnosticButtons from "@/components/DiagnosticButtons";

export default function LabAnalysisPage() {
	const [isNightMode, setIsNightMode] = useState(false);
	const [extractedGroup1, setExtractedGroup1] = useState<Record<string, any> | undefined>(undefined);
	const [extractedGroup2, setExtractedGroup2] = useState<Record<string, any> | undefined>(undefined);
	const [labExtracted, setLabExtracted] = useState(false);

	useEffect(() => {
		const savedMode = localStorage.getItem("clinical-night-mode") === "true";
		setIsNightMode(savedMode);
	}, []);

	// Set labExtracted when either group is filled
	useEffect(() => {
		if (extractedGroup1 || extractedGroup2) {
			setLabExtracted(true);
		} else {
			setLabExtracted(false);
		}
	}, [extractedGroup1, extractedGroup2]);

	return (
		<div className={`min-h-screen bg-background text-foreground p-10 space-y-12 relative min-h-0 flex-1 overflow-y-auto clinical-access ${isNightMode ? "night-mode" : ""}`}>
			{/* Background Ambience */}
			<div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] -z-10"></div>
			{/* Breadcrumbs / Header */}
			<header className="flex flex-col md:flex-row md:items-center justify-between gap-6 max-w-7xl mx-auto">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						<Link href="/dashboard/doctor" className="hover:text-primary transition-colors">Workspace</Link>
						<ChevronRight className="h-3 w-3" />
						<span className="text-primary">Lab Analysis</span>
					</div>
					<h1 className="text-4xl font-extrabold tracking-tight italic">Lab <span className="text-primary">Analysis</span></h1>
					<p className="text-muted-foreground text-sm max-w-lg">
						AI-powered extraction and comparison of patient lab reports. Upload, analyze, and get recommended follow-up tests instantly.
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

			{/* Main Lab Analysis Workspace */}
			<main className="max-w-7xl mx-auto">
				<div className="flex flex-col items-center justify-center">
					<div className="w-full space-y-6">
						<div className="flex items-center gap-4">
							<div className="h-10 w-1 bg-primary rounded-full"></div>
							<h2 className="text-xl font-bold tracking-tight">Lab Report Analyzer</h2>
						</div>
							{/* Only show DiagnosticButtons after extraction */}
						{labExtracted && (
							<DiagnosticButtons extractedGroup1={extractedGroup1} extractedGroup2={extractedGroup2}/>
						)}
						<LabSuggester
							// Pass handler to update parent state with extracted groups
							onAnalysisComplete={res => {
								setExtractedGroup1(res.extractedJsonGroup1);
								setExtractedGroup2(res.extractedJsonGroup2);
							}}
						/>
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
					Lab engine 2.5. synchronized with global clinical patterns.
				</p>
			</footer>
		</div>
	);
}
