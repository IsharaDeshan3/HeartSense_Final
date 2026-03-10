const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const useProxy = true;

export interface GeminiResponse {
  isMedical: boolean;
  error?: string;
  patientInfo: {
    age: number | null;
    gender: string | null;
  };
  labComparison: any[];
  extractedJsonGroup1: any;
  extractedJsonGroup2: any;
  summary: string;
  recommendedTests: string[];
}

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// ─── helpers ──────────────────────────────────────────────────────────────────

function getAuth(): { userId: string; accessToken: string } | null {
  if (typeof window === "undefined") {
    console.log("[PatientService] getAuth called on server side");
    return null;
  }

  const userId = localStorage.getItem("user_id");
  const accessToken = localStorage.getItem("access_token");

  console.log("[PatientService] getAuth check:", {
    hasUserId: !!userId,
    hasAccessToken: !!accessToken,
  });

  if (!userId || !accessToken) return null;
  return { userId, accessToken };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ─── service ──────────────────────────────────────────────────────────────────

export const PatientService = {
  // ── Transcript processing ──────────────────────────────────────────────────
  async sendTranscript(
    transcriptSi: string,
    currentState: any,
    onUpdate: (data: any) => void,
  ) {
    if (!transcriptSi.trim()) return;

    const safeState = {
      symptoms: currentState.symptoms || [],
      medical_history: currentState.medical_history || [],
      allergies: currentState.allergies || [],
      risk_factors: currentState.risk_factors || [],
    };

    const res = await fetch(`${baseUrl}/process-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_si: transcriptSi,
        current_state: safeState,
      }),
    });

    if (!res.ok) {
      console.error("Backend error:", await res.text());
      return;
    }

    onUpdate(await res.json());
  },

  // ── Item status update ─────────────────────────────────────────────────────
  async updateItemStatus(
    sessionId: string,
    category: string,
    item: string,
    status: "accepted" | "rejected",
  ) {
    const res = await fetch(`${baseUrl}/update-item-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, category, item, status }),
    });
    if (!res.ok) throw new Error("Backend error");
    return res.json();
  },

  // ── Gemini image analysis ──────────────────────────────────────────────────
  async analyzeMedicalImage(
    uploadedFile: File,
    prompt: string,
  ): Promise<GeminiResponse> {
    if (!GEMINI_API_KEY) throw new Error("Gemini API key is missing.");

    const base64Image = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve((fr.result as string).split(",")[1]);
      fr.onerror = reject;
      fr.readAsDataURL(uploadedFile);
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: uploadedFile.type,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty AI response");

    return JSON.parse(
      rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim(),
    );
  },

  // ── Fetch patient history ──────────────────────────────────────────────────
  async fetchPatientHistory(patientId?: string): Promise<any[]> {
    const auth = getAuth();
    if (!auth) {
      console.log(
        "[PatientService] fetchPatientHistory: No auth, returning empty array",
      );
      return [];
    }

    const targetId = patientId || auth.userId;
    console.log("[PatientService] fetchPatientHistory for:", targetId);

    // Use Next.js proxy to avoid cross-auth issues
    const url = `/api/proxy/patient-history?user_id=${targetId}&skip=0&limit=100`;
    console.log("[PatientService] fetchPatientHistory URL:", url);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      console.log(
        "[PatientService] fetchPatientHistory response status:",
        res.status,
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error(
          "[PatientService] fetchPatientHistory failed:",
          res.status,
          errorText,
        );
        return [];
      }

      const data = await res.json();
      console.log("[PatientService] fetchPatientHistory data:", data);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(
        "[PatientService] fetchPatientHistory network error:",
        error,
      );
      return [];
    }
  },

  // ── Fetch doctor recommendations ─────────────────────────────────────────────
  async fetchDoctorRecommendations(patientId?: string): Promise<any[]> {
    const auth = getAuth();
    if (!auth) return [];

    const url = `${baseUrl}/api/recommendations/`;
    console.log("[PatientService] fetchDoctorRecommendations URL:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error("fetchDoctorRecommendations failed:", res.status);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  // ── Save patient history ───────────────────────────────────────────────────
  async savePatientHistory(payload: {
    userId?: string;
    user_id?: string;
    patientId?: string;
    extractedJsonGroup1?: any;
    extractedJsonGroup2?: any;
    isMedical?: boolean;
    labComparison?: any[];
    patientInfo?: any;
    recommendedTests?: string[];
    summary?: string;
  }) {
    const auth = getAuth();
    if (!auth) {
      console.error(
        "[PatientService] savePatientHistory: No auth - cannot save",
      );
      return null;
    }

    const targetUserId =
      payload.patientId ?? payload.userId ?? payload.user_id ?? auth.userId;

    const body = {
      userId: targetUserId,
      extractedJsonGroup1: payload.extractedJsonGroup1 || {},
      extractedJsonGroup2: payload.extractedJsonGroup2 || {},
      isMedical: payload.isMedical ?? true,
      labComparison: payload.labComparison || [],
      patientInfo: payload.patientInfo || {},
      recommendedTests: payload.recommendedTests || [],
      summary: payload.summary || "",
    };

    // Use Next.js proxy
    const url = `/api/proxy/patient-history`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return null;
      }

      const result = await res.json().catch(() => ({ success: true }));
      return result;
    } catch (error) {
      return null;
    }
  },

  // ── Diabetic API ───────────────────────────────────────────────────────────
  async sendDiabeticData(extractedJsonGroup1: any, patientId?: string) {
    const auth = getAuth();
    if (!auth) {
      console.warn("[PatientService] sendDiabeticData: No auth");
      return null;
    }

    const targetId = patientId || auth.userId;

    const diabeticData = {
      userId: targetId,
      Age: extractedJsonGroup1?.Age ?? null,
      BMI: extractedJsonGroup1?.BMI ?? null,
      BUN: extractedJsonGroup1?.BUN ?? null,
      Chol: extractedJsonGroup1?.Chol ?? null,
      Cr: extractedJsonGroup1?.Cr ?? null,
      Gender: extractedJsonGroup1?.Gender ?? null,
      HDL: extractedJsonGroup1?.HDL ?? null,
      LDL: extractedJsonGroup1?.LDL ?? null,
      TG: extractedJsonGroup1?.TG ?? null,
    };

    // Remove undefined values but keep null values (matching reference)
    const filteredData = Object.fromEntries(
      Object.entries(diabeticData).filter(([_, v]) => v !== undefined),
    );

    const res = await fetch(`${baseUrl}/api/diabetic/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filteredData),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        "[PatientService] sendDiabeticData failed:",
        res.status,
        errorText,
      );
      return null;
    }

    const result = await res.json();
    console.log("[PatientService] sendDiabeticData result:", result);
    return result;
  },

  // ── Get Diabetic Data by User ID ───────────────────────────────────────────
  async getDiabeticData(patientId?: string) {
    const auth = getAuth();
    if (!auth) return null;

    const targetId = patientId || auth.userId;

    const res = await fetch(`${baseUrl}/api/diabetic/user/${targetId}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });

    if (!res.ok) {
      console.error("getDiabeticData failed:", res.status);
      return null;
    }

    return res.json().catch(() => null);
  },

  // ── Heart API ──────────────────────────────────────────────────────────────
  async sendHeartData(extractedJsonGroup2: any, patientId?: string) {
    const auth = getAuth();
    if (!auth) {
      console.warn("[PatientService] sendHeartData: No auth");
      return null;
    }

    const targetId = patientId || auth.userId;

    const heartData = {
      userId: targetId,
      age: extractedJsonGroup2?.age ?? null,
      ca: extractedJsonGroup2?.ca ?? null,
      chol: extractedJsonGroup2?.chol ?? null,
      cp: extractedJsonGroup2?.cp ?? null,
      exang: extractedJsonGroup2?.exang ?? null,
      fbs: extractedJsonGroup2?.fbs ?? null,
      oldpeak: extractedJsonGroup2?.oldpeak ?? null,
      restecg: extractedJsonGroup2?.restecg ?? null,
      sex: extractedJsonGroup2?.sex ?? null,
      slope: extractedJsonGroup2?.slope ?? null,
      thal: extractedJsonGroup2?.thal ?? null,
      thalach: extractedJsonGroup2?.thalach ?? null,
      trestbps: extractedJsonGroup2?.trestbps ?? null,
    };

    // Remove undefined values but keep null values (matching reference)
    const filteredHeartData = Object.fromEntries(
      Object.entries(heartData).filter(([_, v]) => v !== undefined),
    );

    console.log("[PatientService] sendHeartData:", filteredHeartData);

    const res = await fetch(`${baseUrl}/api/heart/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filteredHeartData),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        "[PatientService] sendHeartData failed:",
        res.status,
        errorText,
      );
      return null;
    }

    const result = await res.json();
    console.log("[PatientService] sendHeartData result:", result);
    return result;
  },

  // ── Get Heart Data by User ID ──────────────────────────────────────────────
  async getHeartData(patientId?: string) {
    const auth = getAuth();
    if (!auth) return null;

    const targetId = patientId || auth.userId;

    const res = await fetch(`${baseUrl}/api/heart/user/${targetId}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });

    if (!res.ok) {
      console.error("getHeartData failed:", res.status);
      return null;
    }

    return res.json().catch(() => null);
  },

  // ── Create Recommendation ──────────────────────────────────────────────────
  async createRecommendation(data: {
    patient_id: string;
    patient_name: string;
    recommendation: string;
  }) {
    const auth = getAuth();
    if (!auth) return null;

    const res = await fetch(`${baseUrl}/api/recommendations/`, {
      method: "POST",
      headers: authHeaders(auth.accessToken),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      console.error("createRecommendation failed:", res.status);
      return null;
    }

    return res.json().catch(() => null);
  },

  // ── Get All Patients (for doctors) ─────────────────────────────────────────
  async getAllPatients(skip = 0, limit = 100) {
    const auth = getAuth();
    if (!auth) return [];

    const res = await fetch(
      `${baseUrl}/api/patients/?skip=${skip}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );

    if (!res.ok) {
      console.error("getAllPatients failed:", res.status);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  // ── Get Current User Info ──────────────────────────────────────────────────
  async getCurrentUser() {
    const auth = getAuth();
    if (!auth) return null;

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });

    if (!res.ok) {
      console.error("getCurrentUser failed:", res.status);
      return null;
    }

    return res.json().catch(() => null);
  },

  // ── Get My Patient Info (for patients) ────────────────────────────────────
  async getMyPatientInfo() {
    const auth = getAuth();
    if (!auth) return null;

    const res = await fetch(`${baseUrl}/api/patients/me`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });

    if (!res.ok) {
      console.error("getMyPatientInfo failed:", res.status);
      return null;
    }

    return res.json().catch(() => null);
  },

  // ── Lab Report Series API ──────────────────────────────────────────────────

  /** Save a single lab report into the patient's longitudinal series. */
  async saveLabReport(payload: {
    patientId: string;
    reportDate?: string | null;
    reportLabel?: string;
    extractedJsonGroup1?: Record<string, any>;
    extractedJsonGroup2?: Record<string, any>;
    labComparison?: any[];
    summary: string;
    recommendedTests?: string[];
    dailyHealthAdvice?: string[];
    patientInfo?: Record<string, any>;
  }): Promise<any> {
    const body = {
      patientId: payload.patientId,
      reportDate: payload.reportDate ?? null,
      reportLabel: payload.reportLabel ?? undefined,
      extractedJsonGroup1: payload.extractedJsonGroup1 ?? {},
      extractedJsonGroup2: payload.extractedJsonGroup2 ?? {},
      labComparison: payload.labComparison ?? [],
      summary: payload.summary,
      recommendedTests: payload.recommendedTests ?? [],
      dailyHealthAdvice: payload.dailyHealthAdvice ?? [],
      patientInfo: payload.patientInfo ?? {},
    };

    try {
      const res = await fetch(`${baseUrl}/api/lab-reports/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error(
          "[PatientService] saveLabReport failed:",
          res.status,
          await res.text(),
        );
        return null;
      }
      return res.json().catch(() => null);
    } catch (err) {
      console.error("[PatientService] saveLabReport network error:", err);
      return null;
    }
  },

  /** Fetch all lab reports for a patient, sorted chronologically. */
  async fetchLabReports(patientId: string): Promise<any[]> {
    try {
      const res = await fetch(
        `${baseUrl}/api/lab-reports/patient/${patientId}`,
      );
      if (!res.ok) {
        console.error("[PatientService] fetchLabReports failed:", res.status);
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("[PatientService] fetchLabReports network error:", err);
      return [];
    }
  },

  /** Delete a single lab report by its backend id. */
  async deleteLabReport(reportId: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/lab-reports/${reportId}`, {
        method: "DELETE",
      });
      return res.status === 204;
    } catch (err) {
      console.error("[PatientService] deleteLabReport network error:", err);
      return false;
    }
  },
};
