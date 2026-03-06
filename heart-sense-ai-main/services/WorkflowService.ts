export type WorkflowState =
  | "SESSION_CREATED"
  | "EXTRACTION_DONE"
  | "ECG_DONE"
  | "LAB_DONE"
  | "ANALYSIS_RUNNING"
  | "ANALYSIS_DONE"
  | "FAILED";

export interface WorkflowSession {
  session_id: string;
  patient_id: string;
  doctor_id?: string;
  current_state: WorkflowState;
  created_at: string;
  updated_at: string;
  correlation_id: string;
  step_payloads?: Record<string, unknown>;
}

export interface PatientDiagnosisRecord {
  payload_id: string;
  patient_id: string;
  session_id: string;
  symptoms_json: Record<string, unknown> | null;
  ecg_json: Record<string, unknown> | null;
  labs_json: Record<string, unknown> | null;
  status: string;
  created_at: string;
  kra_id?: string;
  kra_output?: Record<string, unknown> | null;
  kra_raw_text?: string;
  ora_id?: string;
  experience_level?: string;
  refined_output?: string;
  disclaimer?: string;
}

export interface PatientHistorySummary {
  patient_id: string;
  visit_count: number;
  latest_visit_at?: string | null;
  top_conditions: string[];
  key_lab_findings: string[];
  summary_text: string;
}

export const WorkflowService = {
  async initSession(patientId: string, doctorId?: string) {
    const correlationId = crypto.randomUUID();
    const res = await fetch("/api/workflow/session/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patientId,
        doctor_id: doctorId,
        correlation_id: correlationId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || "Failed to initialize workflow session");
    }

    return res.json() as Promise<{ session_id: string; state: WorkflowState }>;
  },

  async getSession(sessionId: string) {
    const res = await fetch(`/api/workflow/session/${sessionId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || "Failed to fetch workflow session");
    }
    return res.json() as Promise<WorkflowSession>;
  },

  async saveExtraction(sessionId: string, payload: {
    symptoms: string[];
    risk_factors: string[];
    translated_text?: string;
    raw?: Record<string, unknown>;
  }) {
    return postStep(`/api/workflow/session/${sessionId}/extraction`, payload);
  },

  async saveEcg(sessionId: string, result: Record<string, unknown>) {
    return postStep(`/api/workflow/session/${sessionId}/ecg`, { result });
  },

  async saveLab(sessionId: string, result: Record<string, unknown>) {
    return postStep(`/api/workflow/session/${sessionId}/lab`, { result });
  },

  async runAnalysis(sessionId: string, experienceLevel: "newbie" | "seasoned") {
    const runAnalysisUrl = `/api/workflow/session/${sessionId}/analysis/run`;

    const res = await fetch(runAnalysisUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience_level: experienceLevel }),
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Workflow analysis failed"));
    }

    return res.json() as Promise<{
      session_id: string;
      status: "COMPLETED" | "PARTIAL" | "FAILED";
      experience_level: string;
      supabase_payload_id?: string;
      supabase_kra_id?: string;
      supabase_ora_id?: string;
      supabase_payload_url?: string;
      supabase_kra_url?: string;
      supabase_ora_url?: string;
      processing_steps: Array<{ step: string; status: string; duration_ms?: number; supabase_id?: string }>;
      kra_raw?: string;
      ora_outputs?: { newbie?: string; seasoned?: string };
      ora_disclaimers?: { newbie?: string; seasoned?: string };
      refined_output?: string;
      disclaimer?: string;
      rare_case_alert?: Record<string, unknown> | null;
      total_duration_ms?: number;
      context_preview?: string;
    }>;
  },

  async stopAnalysis(sessionId: string) {
    const stopAnalysisUrl = `/api/workflow/session/${sessionId}/analysis/stop`;

    const res = await fetch(stopAnalysisUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to stop workflow analysis"));
    }

    return res.json() as Promise<{
      session_id: string;
      state: WorkflowState;
      status: "CANCEL_REQUESTED";
    }>;
  },

  /**
   * Open an SSE stream that delivers real-time pipeline step events.
   *
   * Each `message` event carries a JSON payload:
   *   { step: string; status: "started" | "completed" | "error"; duration_ms?: number }
   *
   * The stream emits a terminal event `{ step: "analysis_done", status: "completed" }`
   * when the pipeline finishes, after which the backend closes the connection.
   *
   * **Call this BEFORE `/analysis/run`** to avoid missing early events.
   *
   * @example
   *   const es = WorkflowService.openAnalysisEventStream(sessionId);
   *   es.onmessage = (e) => { const event = JSON.parse(e.data); ... };
   *   es.onerror   = () => es.close();
   */
  openAnalysisEventStream(sessionId: string): EventSource {
    // Always route through the Next.js proxy so the browser never calls the
    // backend directly (avoids ERR_CONNECTION_REFUSED on localhost).
    return new EventSource(`/api/workflow/session/${sessionId}/analysis/events`);
  },

  /**
   * Fetch all past diagnosis records for a patient.
   * Returns an array of diagnosis history entries from Supabase.
   */
  async getPatientHistory(patientId: string): Promise<{
    patient_id: string;
    summary: PatientHistorySummary;
    records: PatientDiagnosisRecord[];
  }> {
    const res = await fetch(`/api/workflow/patient/${patientId}/history`);
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to fetch patient history"));
    }
    return res.json();
  },
};

async function postStep(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Workflow step save failed"));
  }

  return res.json() as Promise<{
    session_id: string;
    state: WorkflowState;
    saved_step: string;
    revision: number;
    updated_at: string;
  }>;
}

async function extractErrorMessage(res: Response, fallback: string) {
  const statusPrefix = `[${res.status}]`;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.detail || err?.error || err?.message;
    return detail ? `${statusPrefix} ${detail}` : `${statusPrefix} ${fallback}`;
  }

  const text = (await res.text().catch(() => "")).trim();
  return text ? `${statusPrefix} ${text}` : `${statusPrefix} ${fallback}`;
}
