export type OrchestratorStepKey =
  | "ocr_extraction"
  | "risk_models"
  | "save_lab_reports"
  | "create_lab_agent_job"
  | "run_lab_agent_analysis";

export interface OrchestratorStepEvent {
  type: "step";
  step: OrchestratorStepKey;
  status: "running" | "completed";
  message?: string;
  timestamp?: number;
}

export interface OrchestratorErrorEvent {
  type: "error";
  status: "failed";
  message: string;
  timestamp?: number;
}

export interface OrchestratorReportEvent {
  type: "report_result";
  reportId: string;
  label: string;
  isMedical: boolean;
  ocrJobId: string | null;
}

export interface OrchestratorFinalReport {
  id: string;
  label: string;
  reportDate: string;
  analysis: {
    isMedical: boolean;
    summary: string;
    patientInfo?: { age?: number | null; gender?: string | null };
    labComparison: Array<{
      test: string;
      actualValue: number | string;
      normalRange: string;
      status: "Normal" | "High" | "Low";
    }>;
    recommendedTests: string[];
    extractedJsonGroup1?: Record<string, unknown>;
    extractedJsonGroup2?: Record<string, unknown>;
    dailyHealthAdvice?: string[];
    error?: string;
  };
  diabeticModelResult: unknown;
  heartModelResult: unknown;
  backendReportId: string | null;
  ocrJobId: string | null;
}

export interface OrchestratorFinalResult {
  status: "COMPLETED";
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  patientId: string;
  reports: OrchestratorFinalReport[];
  labAgent: {
    job: Record<string, unknown>;
    result: Record<string, unknown>;
  };
}

export interface OrchestrateInputReport {
  id: string;
  label: string;
  reportDate?: string;
  fileName?: string;
  mimeType: string;
  contentBase64: string;
}

export interface OrchestrateRequestBody {
  patientId: string;
  patientName?: string;
  reports: OrchestrateInputReport[];
  options?: {
    minReportsForTrend?: number;
    topK?: number;
    force?: boolean;
    notes?: string;
    evidenceSourceIds?: string[];
  };
}

export interface OrchestrateHandlers {
  onStep?: (event: OrchestratorStepEvent) => void;
  onReport?: (event: OrchestratorReportEvent) => void;
}

type StreamEvent =
  | OrchestratorStepEvent
  | OrchestratorErrorEvent
  | OrchestratorReportEvent
  | {
      type: "final";
      result: OrchestratorFinalResult;
    };

function parseEvent(line: string): StreamEvent {
  return JSON.parse(line) as StreamEvent;
}

export const LabOrchestratorService = {
  async run(
    body: OrchestrateRequestBody,
    handlers?: OrchestrateHandlers,
  ): Promise<OrchestratorFinalResult> {
    const response = await fetch("/api/lab-agent/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Orchestrator request failed (${response.status})`);
    }

    if (!response.body) {
      throw new Error("Orchestrator stream is unavailable");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: OrchestratorFinalResult | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const event = parseEvent(line);
        if (event.type === "step") {
          handlers?.onStep?.(event);
          continue;
        }
        if (event.type === "report_result") {
          handlers?.onReport?.(event);
          continue;
        }
        if (event.type === "error") {
          throw new Error(event.message || "Orchestration failed");
        }
        if (event.type === "final") {
          finalResult = event.result;
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const event = parseEvent(trailing);
      if (event.type === "step") {
        handlers?.onStep?.(event);
      } else if (event.type === "report_result") {
        handlers?.onReport?.(event);
      } else if (event.type === "error") {
        throw new Error(event.message || "Orchestration failed");
      } else if (event.type === "final") {
        finalResult = event.result;
      }
    }

    if (!finalResult) {
      throw new Error("Orchestrator did not return a final payload");
    }

    return finalResult;
  },
};
