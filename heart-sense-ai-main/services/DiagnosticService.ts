// ─── Shared analysis types ─────────────────────────────────────────────────

export interface SymptomsPayload {
  text: string;
  age?: number;
  sex?: string;
  chief_complaint?: string;
  additional?: Record<string, any>;
}

export interface ECGPayload {
  status: "present" | "skipped" | "error";
  skip_reason?: string;
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
  skip_reason?: string;
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

