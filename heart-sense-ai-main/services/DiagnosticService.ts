// ─── Types matching diagnostic_processor/backend/processing/schemas.py ──────

export interface SymptomsPayload {
  text: string;
  age?: number;
  sex?: string;
  chief_complaint?: string;
  additional?: Record<string, any>;
}

export interface ECGPayload {
  status: "present" | "skipped" | "error";
  rhythm?: string;
  heart_rate?: number;
  qrs_duration?: number;
  st_segment?: string;
  interpretation?: string;
  findings?: string[];
  raw?: Record<string, any>;
}

export interface LabPayload {
  status: "present" | "skipped" | "error";
  troponin?: number;
  ldh?: number;
  bnp?: number;
  creatinine?: number;
  hemoglobin?: number;
  findings?: string[];
  raw?: Record<string, any>;
}

export interface AnalyzeRequest {
  symptoms: SymptomsPayload;
  ecg?: ECGPayload;
  labs?: LabPayload;
  experience_level: "newbie" | "seasoned" | "expert";
}

export interface PipelineStep {
  step: string;
  status: string;
  duration_ms?: number;
  supabase_id?: string;
}

export interface RareCaseAlert {
  triggered: boolean;
  condition: string;
  similarity_score: number;
  source_pmcid?: string;
  source_url?: string;
  doi?: string;
  diseases: string[];
  year?: string;
  contradictions: string[];
  missing_data: string[];
  reasoning: string;
}

export interface AnalysisResponse {
  session_id: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  supabase_payload_id?: string;
  supabase_kra_id?: string;
  supabase_ora_id?: string;
  refined_output?: string;
  disclaimer?: string;
  kra_raw?: string;
  ora_outputs?: {
    newbie?: string;
    expert?: string;
  };
  ora_disclaimers?: {
    newbie?: string;
    expert?: string;
  };
  rare_case_alert?: RareCaseAlert;
  experience_level: string;
  processing_steps: PipelineStep[];
  total_duration_ms?: number;
  error?: string;
}

export interface HealthResponse {
  status: string;
  faiss_ready: boolean;
  rare_cases_ready?: boolean;
  supabase_ready: boolean;
  kra_endpoint: string;
  ora_endpoint: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const DiagnosticService = {
  /**
   * Run the full KRA → ORA diagnostic pipeline
   */
  async runDiagnosis(
    request: AnalyzeRequest,
    signal?: AbortSignal,
  ): Promise<AnalysisResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600_000); // 10 min

    // Allow external abort to propagate
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const res = await fetch("/api/diagnostic/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          err.message ||
            err.error ||
            `Diagnostic pipeline failed (${res.status})`,
        );
      }

      return res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Check pipeline component health
   */
  async checkHealth(): Promise<HealthResponse> {
    const res = await fetch("/api/diagnostic/health");
    if (!res.ok) {
      return {
        status: "offline",
        faiss_ready: false,
        supabase_ready: false,
        kra_endpoint: "unknown",
        ora_endpoint: "unknown",
      };
    }
    return res.json();
  },

  /**
   * Poll session status for a running analysis
   */
  async getSession(sessionId: string): Promise<any> {
    const res = await fetch(`/api/diagnostic/session/${sessionId}`);
    if (!res.ok) return null;
    return res.json();
  },
};
