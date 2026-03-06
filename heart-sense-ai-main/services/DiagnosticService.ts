// ─── Shared analysis and health types ───────────────────────────────────────

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
    seasoned?: string;
  };
  ora_disclaimers?: {
    newbie?: string;
    seasoned?: string;
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
  /** True when DeepSeek-R1 8B GGUF is loaded in GPU memory */
  kra_model_loaded: boolean;
  /** True when Phi-3.5-mini GGUF is loaded in CPU memory */
  ora_model_loaded: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const DiagnosticService = {
  /**
   * Check pipeline component health
   */
  async checkHealth(): Promise<HealthResponse> {
    const res = await fetch("/api/diagnostic/health");
    if (!res.ok) {
      return {
        status: "offline",
        faiss_ready: false,
        rare_cases_ready: false,
        supabase_ready: false,
        kra_model_loaded: false,
        ora_model_loaded: false,
      };
    }
    return res.json();
  },
};
