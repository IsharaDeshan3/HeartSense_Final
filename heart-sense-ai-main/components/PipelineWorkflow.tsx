"use client";

import { useState, useEffect, useRef } from "react";
import {
    Database,
    BrainCircuit,
    Sparkles,
    Server,
    CheckCircle2,
    XCircle,
    Loader2,
    Wifi,
    WifiOff,
} from "lucide-react";
import { DiagnosticService, type HealthResponse } from "@/services/DiagnosticService";

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeStatus = "idle" | "checking" | "online" | "offline" | "active" | "done" | "error";

interface PipelineNode {
    id: string;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    status: NodeStatus;
    detail?: string;
}

interface PipelineWorkflowProps {
    isRunning: boolean;
    currentStep?: string;
    completedSteps?: string[];
}

// ─── Status colors & animations ─────────────────────────────────────────────

const STATUS_CONFIG: Record<NodeStatus, { color: string; ring: string; bg: string; pulse: boolean; icon?: React.ReactNode }> = {
    idle: { color: "text-muted-foreground/40", ring: "border-white/10", bg: "bg-white/[0.02]", pulse: false },
    checking: { color: "text-amber-400", ring: "border-amber-500/30", bg: "bg-amber-500/5", pulse: true, icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    online: { color: "text-emerald-400", ring: "border-emerald-500/30", bg: "bg-emerald-500/5", pulse: false, icon: <CheckCircle2 className="h-3 w-3" /> },
    offline: { color: "text-rose-400", ring: "border-rose-500/30", bg: "bg-rose-500/5", pulse: false, icon: <XCircle className="h-3 w-3" /> },
    active: { color: "text-primary", ring: "border-primary/50", bg: "bg-primary/10", pulse: true, icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    done: { color: "text-emerald-400", ring: "border-emerald-500/40", bg: "bg-emerald-500/10", pulse: false, icon: <CheckCircle2 className="h-3 w-3" /> },
    error: { color: "text-rose-400", ring: "border-rose-500/40", bg: "bg-rose-500/10", pulse: false, icon: <XCircle className="h-3 w-3" /> },
};

// Map pipeline step keys to node IDs
const STEP_TO_NODE: Record<string, string> = {
    session_init: "backend",
    faiss_search: "backend",
    rare_case_search: "backend",
    supabase_save_payload: "supabase",
    kra_analysis: "kra",
    supabase_save_kra: "supabase",
    ora_refinement: "ora",
    supabase_save_ora: "supabase",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function PipelineWorkflow({ isRunning, currentStep, completedSteps = [] }: PipelineWorkflowProps) {
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const pulseRef = useRef<number>(0);

    // Animate the data flow pulse
    useEffect(() => {
        if (isRunning) {
            const id = window.setInterval(() => {
                pulseRef.current = (pulseRef.current + 1) % 100;
            }, 50);
            return () => clearInterval(id);
        }
    }, [isRunning]);

    // Run health check on mount
    useEffect(() => {
        const check = async () => {
            setIsChecking(true);
            try {
                const h = await DiagnosticService.checkHealth();
                setHealth(h);
            } catch {
                setHealth(null);
            } finally {
                setIsChecking(false);
            }
        };
        check();
    }, []);

    // Derive node statuses
    const getNodeStatus = (nodeId: string): NodeStatus => {
        if (isChecking) return "checking";

        // When running, check pipeline progress
        if (isRunning) {
            const nodeSteps = Object.entries(STEP_TO_NODE)
                .filter(([, nid]) => nid === nodeId)
                .map(([step]) => step);

            const isActive = currentStep && STEP_TO_NODE[currentStep] === nodeId;
            const isDone = nodeSteps.length > 0 && nodeSteps.every(s => completedSteps.includes(s));
            const hasCompleted = nodeSteps.some(s => completedSteps.includes(s));

            if (isActive) return "active";
            if (isDone) return "done";
            if (hasCompleted) return "active"; // partially done
            return "idle";
        }

        // Idle state — show health check results
        if (!health) return "offline";

        switch (nodeId) {
            case "backend":
                return health.status === "ok" || health.status === "degraded" ? "online" : "offline";
            case "supabase":
                return health.supabase_ready ? "online" : "offline";
            case "kra":
                return health.kra_endpoint && health.kra_endpoint !== "unknown" && health.kra_endpoint !== "" ? "online" : "offline";
            case "ora":
                return health.ora_endpoint && health.ora_endpoint !== "unknown" && health.ora_endpoint !== "" ? "online" : "offline";
            default:
                return "idle";
        }
    };

    const getNodeDetail = (nodeId: string): string => {
        if (isChecking) return "Checking...";

        if (isRunning) {
            const nodeSteps = Object.entries(STEP_TO_NODE)
                .filter(([, nid]) => nid === nodeId)
                .map(([step]) => step);

            if (currentStep && STEP_TO_NODE[currentStep] === nodeId) {
                const labels: Record<string, string> = {
                    session_init: "Initializing session",
                    faiss_search: "Searching knowledge base",
                    rare_case_search: "Checking rare cases",
                    supabase_save_payload: "Saving payload",
                    kra_analysis: "Running reasoning engine",
                    supabase_save_kra: "Saving KRA output",
                    ora_refinement: "Refining for clinician",
                    supabase_save_ora: "Saving final output",
                };
                return labels[currentStep] || "Processing...";
            }

            const allDone = nodeSteps.every(s => completedSteps.includes(s));
            if (allDone && nodeSteps.length > 0) return "Complete";

            return "Waiting...";
        }

        if (!health) return "Unreachable";

        switch (nodeId) {
            case "backend":
                return health.faiss_ready ? "FAISS loaded" : "FAISS not ready";
            case "supabase":
                return health.supabase_ready ? "Connected" : "Not connected";
            case "kra":
                return health.kra_endpoint && health.kra_endpoint !== "unknown" ? "Space reachable" : "Space unreachable";
            case "ora":
                return health.ora_endpoint && health.ora_endpoint !== "unknown" ? "Space reachable" : "Space unreachable";
            default:
                return "";
        }
    };

    const nodes: PipelineNode[] = [
        {
            id: "backend",
            label: "Analysis Engine",
            sublabel: "localhost:8080",
            icon: <Server className="h-5 w-5" />,
            status: getNodeStatus("backend"),
            detail: getNodeDetail("backend"),
        },
        {
            id: "supabase",
            label: "Supabase",
            sublabel: "Data Relay",
            icon: <Database className="h-5 w-5" />,
            status: getNodeStatus("supabase"),
            detail: getNodeDetail("supabase"),
        },
        {
            id: "kra",
            label: "KRA Agent",
            sublabel: "DeepSeek-R1 8B",
            icon: <BrainCircuit className="h-5 w-5" />,
            status: getNodeStatus("kra"),
            detail: getNodeDetail("kra"),
        },
        {
            id: "ora",
            label: "ORA Agent",
            sublabel: "OpenChat-3.5",
            icon: <Sparkles className="h-5 w-5" />,
            status: getNodeStatus("ora"),
            detail: getNodeDetail("ora"),
        },
    ];

    const allOnline = nodes.every(n => n.status === "online" || n.status === "done");
    const anyOffline = nodes.some(n => n.status === "offline" || n.status === "error");

    return (
        <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${isRunning ? "bg-primary animate-pulse" :
                            allOnline ? "bg-emerald-400" :
                                anyOffline ? "bg-rose-400 animate-pulse" :
                                    "bg-amber-400 animate-pulse"
                        }`} />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Pipeline Infrastructure
                    </h4>
                </div>
                <div className="flex items-center gap-2">
                    {isRunning ? (
                        <span className="text-[9px] font-bold text-primary uppercase tracking-widest animate-pulse">
                            Processing...
                        </span>
                    ) : allOnline ? (
                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                            <Wifi className="h-3 w-3" /> All Systems Online
                        </span>
                    ) : anyOffline ? (
                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-rose-400 uppercase tracking-widest">
                            <WifiOff className="h-3 w-3" /> Connectivity Issue
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-amber-400 uppercase tracking-widest">
                            <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                        </span>
                    )}
                    {!isRunning && !isChecking && (
                        <button
                            onClick={async () => {
                                setIsChecking(true);
                                try {
                                    const h = await DiagnosticService.checkHealth();
                                    setHealth(h);
                                } catch {
                                    setHealth(null);
                                } finally {
                                    setIsChecking(false);
                                }
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-white"
                            title="Refresh health check"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Pipeline Nodes */}
            <div className="flex items-stretch gap-0">
                {nodes.map((node, idx) => {
                    const cfg = STATUS_CONFIG[node.status];
                    return (
                        <div key={node.id} className="flex items-center flex-1 min-w-0">
                            {/* Node */}
                            <div
                                className={`relative flex-1 min-w-0 rounded-xl border-2 ${cfg.ring} ${cfg.bg} p-3 transition-all duration-500 group ${node.status === "active" ? "scale-[1.02] shadow-lg shadow-primary/10" : ""
                                    }`}
                            >
                                {/* Active glow */}
                                {node.status === "active" && (
                                    <div className="absolute inset-0 rounded-xl bg-primary/5 animate-pulse" />
                                )}

                                <div className="relative z-10">
                                    {/* Icon + Status badge */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.color} transition-all duration-500`}>
                                            {node.icon}
                                        </div>
                                        <div className={`flex items-center gap-1 ${cfg.color}`}>
                                            {cfg.icon}
                                        </div>
                                    </div>

                                    {/* Labels */}
                                    <p className={`text-xs font-bold truncate ${cfg.color} transition-colors duration-500`}>
                                        {node.label}
                                    </p>
                                    <p className="text-[8px] text-muted-foreground/50 font-bold uppercase tracking-wider truncate">
                                        {node.sublabel}
                                    </p>

                                    {/* Detail */}
                                    <p className={`text-[9px] mt-1.5 truncate ${node.status === "online" || node.status === "done" ? "text-emerald-400/70" :
                                            node.status === "offline" || node.status === "error" ? "text-rose-400/70" :
                                                node.status === "active" ? "text-primary/70" :
                                                    "text-muted-foreground/40"
                                        } font-medium`}>
                                        {node.detail}
                                    </p>
                                </div>
                            </div>

                            {/* Connector arrow */}
                            {idx < nodes.length - 1 && (
                                <div className="flex items-center px-1 shrink-0">
                                    <div className="relative w-8 h-[2px]">
                                        {/* Base line */}
                                        <div className={`absolute inset-0 rounded-full transition-colors duration-500 ${(nodes[idx].status === "done" || nodes[idx].status === "online") &&
                                                (nodes[idx + 1].status === "done" || nodes[idx + 1].status === "online" || nodes[idx + 1].status === "active")
                                                ? "bg-emerald-500/30"
                                                : "bg-white/10"
                                            }`} />

                                        {/* Animated data pulse */}
                                        {isRunning && nodes[idx].status === "done" && nodes[idx + 1].status === "active" && (
                                            <div className="absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shadow-lg shadow-primary/50 animate-[flow_1s_ease-in-out_infinite]" />
                                        )}

                                        {/* Arrow head */}
                                        <svg className={`absolute -right-1 top-1/2 -translate-y-1/2 h-2 w-2 transition-colors duration-500 ${(nodes[idx].status === "done" || nodes[idx].status === "online") ? "text-emerald-500/40" : "text-white/10"
                                            }`} viewBox="0 0 6 6" fill="currentColor">
                                            <path d="M0 0 L6 3 L0 6 Z" />
                                        </svg>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pipeline step progress (when running) */}
            {isRunning && currentStep && (
                <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-primary/5 border border-primary/10">
                    <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
                    <p className="text-[10px] font-bold text-primary/80 uppercase tracking-widest truncate">
                        {(() => {
                            const labels: Record<string, string> = {
                                session_init: "Initializing session...",
                                faiss_search: "Retrieving knowledge from FAISS...",
                                rare_case_search: "Checking for rare case matches...",
                                supabase_save_payload: "Saving patient data to Supabase...",
                                kra_analysis: "KRA reasoning engine processing (this may take 1-3 min)...",
                                supabase_save_kra: "Saving KRA output to Supabase...",
                                ora_refinement: "ORA refining output for clinician...",
                                supabase_save_ora: "Finalizing and saving results...",
                            };
                            return labels[currentStep] || currentStep;
                        })()}
                    </p>
                    <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                        {completedSteps.length}/{Object.keys(STEP_TO_NODE).length} steps
                    </span>
                </div>
            )}
        </div>
    );
}
