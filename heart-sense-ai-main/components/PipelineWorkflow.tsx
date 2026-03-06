"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  Server,
  Sparkles,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

import { DiagnosticService, type HealthResponse } from "@/services/DiagnosticService";

type NodeStatus = "idle" | "checking" | "online" | "offline" | "active" | "done";

interface PipelineNode {
  id: string;
  label: string;
  sublabel: string;
  detail: string;
  icon: React.ReactNode;
  status: NodeStatus;
}

interface PipelineWorkflowProps {
  isRunning: boolean;
  currentStep?: string;
  completedSteps?: string[];
}

const STEP_TO_NODE: Record<string, string> = {
  session_init: "backend",
  faiss_search: "knowledge",
  rare_case_search: "knowledge",
  supabase_save_payload: "supabase",
  kra_analysis: "kra",
  supabase_save_kra: "supabase",
  ora_refinement: "ora",
  supabase_save_ora: "supabase",
};

const STEP_LABELS: Record<string, string> = {
  session_init: "Initializing workflow session...",
  faiss_search: "Searching textbook knowledge index...",
  rare_case_search: "Scanning rare-case FAISS index...",
  supabase_save_payload: "Saving structured payload to Supabase...",
  kra_analysis: "Running KRA on DeepSeek-R1 GPU...",
  supabase_save_kra: "Saving KRA output...",
  ora_refinement: "Running ORA on Phi-3.5-mini CPU...",
  supabase_save_ora: "Saving final ORA report...",
};

const STATUS_CONFIG: Record<
  NodeStatus,
  { color: string; ring: string; bg: string; icon?: React.ReactNode }
> = {
  idle: {
    color: "text-muted-foreground/40",
    ring: "border-white/10",
    bg: "bg-white/[0.02]",
  },
  checking: {
    color: "text-amber-400",
    ring: "border-amber-500/30",
    bg: "bg-amber-500/5",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  online: {
    color: "text-emerald-400",
    ring: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  offline: {
    color: "text-rose-400",
    ring: "border-rose-500/30",
    bg: "bg-rose-500/5",
    icon: <XCircle className="h-3 w-3" />,
  },
  active: {
    color: "text-primary",
    ring: "border-primary/50",
    bg: "bg-primary/10",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  done: {
    color: "text-emerald-400",
    ring: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

export default function PipelineWorkflow({
  isRunning,
  currentStep,
  completedSteps = [],
}: PipelineWorkflowProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const refreshHealth = async () => {
    setIsChecking(true);
    try {
      const next = await DiagnosticService.checkHealth();
      setHealth(next);
    } catch {
      setHealth(null);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  const getNodeStatus = (nodeId: string): NodeStatus => {
    if (isChecking) return "checking";

    if (isRunning) {
      const nodeSteps = Object.entries(STEP_TO_NODE)
        .filter(([, mapped]) => mapped === nodeId)
        .map(([step]) => step);

      if (currentStep && STEP_TO_NODE[currentStep] === nodeId) return "active";
      if (nodeSteps.length > 0 && nodeSteps.every((step) => completedSteps.includes(step))) {
        return "done";
      }
      if (nodeSteps.some((step) => completedSteps.includes(step))) return "active";
      return "idle";
    }

    if (!health) return "offline";

    switch (nodeId) {
      case "backend":
        return health.status === "ok" || health.status === "degraded" ? "online" : "offline";
      case "knowledge":
        return health.faiss_ready ? "online" : "offline";
      case "supabase":
        return health.supabase_ready ? "online" : "offline";
      case "kra":
        return health.kra_model_loaded ? "online" : "offline";
      case "ora":
        return health.ora_model_loaded ? "online" : "offline";
      default:
        return "idle";
    }
  };

  const getNodeDetail = (nodeId: string): string => {
    if (isChecking) return "Checking...";

    if (isRunning) {
      const nodeSteps = Object.entries(STEP_TO_NODE)
        .filter(([, mapped]) => mapped === nodeId)
        .map(([step]) => step);

      if (currentStep && STEP_TO_NODE[currentStep] === nodeId) {
        return STEP_LABELS[currentStep] ?? "Processing...";
      }
      if (nodeSteps.length > 0 && nodeSteps.every((step) => completedSteps.includes(step))) {
        return "Complete";
      }
      return "Waiting...";
    }

    if (!health) return "Unreachable";

    switch (nodeId) {
      case "backend":
        return health.status === "ok"
          ? "Workflow backend ready"
          : "Backend reachable with degraded services";
      case "knowledge":
        if (!health.faiss_ready) return "Knowledge indexes not ready";
        return health.rare_cases_ready
          ? "Textbook + rare-case indexes loaded"
          : "Textbook ready · rare-case warming up";
      case "supabase":
        return health.supabase_ready ? "Connected and writable" : "Supabase offline";
      case "kra":
        return health.kra_model_loaded ? "DeepSeek-R1 loaded in GPU memory" : "Model not loaded yet";
      case "ora":
        return health.ora_model_loaded ? "Phi-3.5-mini loaded in CPU memory" : "Model not loaded yet";
      default:
        return "";
    }
  };

  const nodes: PipelineNode[] = [
    {
      id: "backend",
      label: "Workflow Engine",
      sublabel: "FastAPI · localhost:8080",
      detail: getNodeDetail("backend"),
      icon: <Server className="h-5 w-5" />,
      status: getNodeStatus("backend"),
    },
    {
      id: "knowledge",
      label: "Knowledge Retrieval",
      sublabel: "FAISS · Rare Cases",
      detail: getNodeDetail("knowledge"),
      icon: <BookOpen className="h-5 w-5" />,
      status: getNodeStatus("knowledge"),
    },
    {
      id: "supabase",
      label: "Supabase",
      sublabel: "Payload + KRA + ORA rows",
      detail: getNodeDetail("supabase"),
      icon: <Database className="h-5 w-5" />,
      status: getNodeStatus("supabase"),
    },
    {
      id: "kra",
      label: "KRA Agent",
      sublabel: "DeepSeek-R1 8B · GPU",
      detail: getNodeDetail("kra"),
      icon: <BrainCircuit className="h-5 w-5" />,
      status: getNodeStatus("kra"),
    },
    {
      id: "ora",
      label: "ORA Agent",
      sublabel: "Phi-3.5-mini · CPU",
      detail: getNodeDetail("ora"),
      icon: <Sparkles className="h-5 w-5" />,
      status: getNodeStatus("ora"),
    },
  ];

  const allOnline = nodes.every((node) => node.status === "online" || node.status === "done");
  const anyOffline = nodes.some((node) => node.status === "offline");
  const modelsMissing = !!health && (!health.kra_model_loaded || !health.ora_model_loaded);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-2 w-2 rounded-full ${
              isRunning
                ? "bg-primary animate-pulse"
                : allOnline
                  ? "bg-emerald-400"
                  : anyOffline
                    ? "bg-rose-400 animate-pulse"
                    : "bg-amber-400 animate-pulse"
            }`}
          />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Local Pipeline Infrastructure
          </h4>
          <span className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-primary/70">
            <Cpu className="h-2.5 w-2.5" />
            Local LLM
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="text-[9px] font-bold uppercase tracking-widest text-primary animate-pulse">
              Processing...
            </span>
          ) : allOnline ? (
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
              <Wifi className="h-3 w-3" />
              All Systems Online
            </span>
          ) : anyOffline ? (
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-rose-400">
              <WifiOff className="h-3 w-3" />
              Attention Needed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking...
            </span>
          )}

          {!isRunning && !isChecking && (
            <button
              onClick={refreshHealth}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
              title="Refresh health check"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!isRunning && modelsMissing && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Model warm-up in progress
          </p>
          <p className="mt-1 text-[9px] text-amber-300/70">
            {!health?.kra_model_loaded && "KRA DeepSeek-R1 GPU model pending. "}
            {!health?.ora_model_loaded && "ORA Phi-3.5-mini CPU model pending. "}
            The new local pipeline becomes fully ready as soon as both models finish loading.
          </p>
        </div>
      )}

      <div className="flex items-stretch gap-0">
        {nodes.map((node, index) => {
          const cfg = STATUS_CONFIG[node.status];

          return (
            <div key={node.id} className="flex min-w-0 flex-1 items-center">
              <div
                className={`relative min-w-0 flex-1 rounded-xl border-2 p-3 transition-all duration-500 ${cfg.ring} ${cfg.bg} ${
                  node.status === "active" ? "scale-[1.02] shadow-lg shadow-primary/10" : ""
                }`}
              >
                {node.status === "active" && (
                  <div className="absolute inset-0 rounded-xl bg-primary/5 animate-pulse" />
                )}

                <div className="relative z-10">
                  <div className="mb-2 flex items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color}`}>
                      {node.icon}
                    </div>
                    <div className={cfg.color}>{cfg.icon}</div>
                  </div>

                  <p className={`truncate text-xs font-bold ${cfg.color}`}>{node.label}</p>
                  <p className="truncate text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    {node.sublabel}
                  </p>
                  <p
                    className={`mt-1.5 truncate text-[9px] font-medium ${
                      node.status === "online" || node.status === "done"
                        ? "text-emerald-400/70"
                        : node.status === "offline"
                          ? "text-rose-400/70"
                          : node.status === "active"
                            ? "text-primary/70"
                            : "text-muted-foreground/40"
                    }`}
                  >
                    {node.detail}
                  </p>
                </div>
              </div>

              {index < nodes.length - 1 && (
                <div className="flex shrink-0 items-center px-1">
                  <div className="relative h-[2px] w-6">
                    <div
                      className={`absolute inset-0 rounded-full ${
                        (nodes[index].status === "done" || nodes[index].status === "online") &&
                        (nodes[index + 1].status === "done" ||
                          nodes[index + 1].status === "online" ||
                          nodes[index + 1].status === "active")
                          ? "bg-emerald-500/30"
                          : "bg-white/10"
                      }`}
                    />
                    {isRunning &&
                      nodes[index].status === "done" &&
                      nodes[index + 1].status === "active" && (
                        <div className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary shadow-lg shadow-primary/50 animate-[flow_1s_ease-in-out_infinite]" />
                      )}
                    <svg
                      className={`absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 ${
                        nodes[index].status === "done" || nodes[index].status === "online"
                          ? "text-emerald-500/40"
                          : "text-white/10"
                      }`}
                      viewBox="0 0 6 6"
                      fill="currentColor"
                    >
                      <path d="M0 0 L6 3 L0 6 Z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isRunning && currentStep && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/10 bg-primary/5 px-3 py-2.5">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-primary/80">
            {STEP_LABELS[currentStep] ?? currentStep}
          </p>
          <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
            {completedSteps.length}/{Object.keys(STEP_TO_NODE).length} steps
          </span>
        </div>
      )}
    </div>
  );
}
