export interface LabAgentJobResponse {
  id: string;
  patientId: string;
  reportIds: string[];
  status: string;
  stage: string;
  architectureVersion: string;
  reportCountAtCreation: number;
  minReportsForTrend: number;
  nextAction: string;
}

export interface LabAgentResultResponse {
  id: string;
  jobId: string;
  patientId: string;
  status: string;
  summary: string;
  patientCategory: {
    label?: string;
    reason?: string;
    [key: string]: unknown;
  };
  findings: Array<Record<string, unknown>>;
  recommendedActions: string[];
  trendSummary?: string;
  trendPatterns?: Array<Record<string, unknown>>;
  evidenceUsedCount?: number;
}

export interface OcrJobResponse {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  patientId?: string;
  fileName?: string;
  mimeType?: string;
  error?: string | null;
  extractedText?: string | null;
  charCount?: number;
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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const payload = raw.includes(",") ? raw.split(",", 2)[1] : raw;
      resolve(payload);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const LabAgentService = {
  async createJob(
    patientId: string,
    reportIds: string[],
    options?: { minReportsForTrend?: number; notes?: string },
  ): Promise<LabAgentJobResponse> {
    const res = await fetch("/api/lab-agent/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        reportIds,
        minReportsForTrend: options?.minReportsForTrend ?? 2,
        notes: options?.notes,
      }),
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to create lab-agent job"));
    }

    return res.json();
  },

  async analyzeJob(
    jobId: string,
    options?: { evidenceSourceIds?: string[]; topK?: number; force?: boolean },
  ): Promise<LabAgentResultResponse> {
    const res = await fetch(`/api/lab-agent/jobs/${encodeURIComponent(jobId)}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evidenceSourceIds: options?.evidenceSourceIds ?? [],
        topK: options?.topK,
        force: options?.force ?? false,
      }),
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to run lab-agent analysis"));
    }

    return res.json();
  },

  async getJobResult(jobId: string): Promise<LabAgentResultResponse> {
    const res = await fetch(`/api/lab-agent/jobs/${encodeURIComponent(jobId)}/result`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to fetch lab-agent result"));
    }

    return res.json();
  },

  async createOcrJob(payload: {
    patientId?: string;
    fileName?: string;
    mimeType?: string;
    contentBase64: string;
  }): Promise<OcrJobResponse> {
    const res = await fetch("/api/lab-agent/ocr/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to create OCR job"));
    }

    return res.json();
  },

  async getOcrJob(jobId: string): Promise<OcrJobResponse> {
    const res = await fetch(`/api/lab-agent/ocr/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Failed to fetch OCR job"));
    }

    return res.json();
  },

  async waitForOcrCompletion(
    jobId: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<OcrJobResponse> {
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 1_500;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const status = await this.getOcrJob(jobId);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("OCR wait timed out");
  },

  async submitOcrFromFile(file: File, patientId?: string): Promise<OcrJobResponse> {
    const contentBase64 = await fileToBase64(file);
    const created = await this.createOcrJob({
      patientId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64,
    });

    return this.waitForOcrCompletion(created.id);
  },

  async runFullAnalysis(payload: {
    patientId: string;
    reportIds: string[];
    minReportsForTrend?: number;
    evidenceSourceIds?: string[];
    topK?: number;
    force?: boolean;
    notes?: string;
  }): Promise<{ job: LabAgentJobResponse; result: LabAgentResultResponse }> {
    const job = await this.createJob(payload.patientId, payload.reportIds, {
      minReportsForTrend: payload.minReportsForTrend ?? 2,
      notes: payload.notes,
    });

    const result = await this.analyzeJob(job.id, {
      evidenceSourceIds: payload.evidenceSourceIds ?? [],
      topK: payload.topK,
      force: payload.force ?? false,
    });

    return { job, result };
  },
};
