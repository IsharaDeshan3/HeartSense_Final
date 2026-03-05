// Frontend-facing simple arrays
export interface MedicalState {
  symptoms: string[];
  medical_history: string[];
  allergies: string[];
  risk_factors: string[];
}

// Backend PatientState uses Dict[str, TrackedItem]
interface TrackedItem {
  value: string;
  status: string;
}
interface BackendPatientState {
  symptoms: Record<string, TrackedItem>;
  medical_history: Record<string, TrackedItem>;
  allergies: Record<string, TrackedItem>;
  risk_factors: Record<string, TrackedItem>;
}

export interface ExtractionResponse {
  updated_state: MedicalState;
  missing_critical: Record<string, string>;
  translated_text: string;
}

const BACKEND_URL = "http://localhost:8001";

/** Convert frontend string[] state → backend Dict[str, TrackedItem] state */
function toBackendState(state: MedicalState): BackendPatientState {
  const convert = (items: string[]): Record<string, TrackedItem> =>
    Object.fromEntries(
      items.map((item) => [item, { value: item, status: "pending" }]),
    );
  return {
    symptoms: convert(state.symptoms),
    medical_history: convert(state.medical_history),
    allergies: convert(state.allergies),
    risk_factors: convert(state.risk_factors),
  };
}

/** Convert backend Dict[str, TrackedItem] state → frontend string[] state */
function toFrontendState(state: BackendPatientState): MedicalState {
  const convert = (items: Record<string, TrackedItem>): string[] =>
    Object.values(items).map((t) => t.value);
  return {
    symptoms: convert(state.symptoms ?? {}),
    medical_history: convert(state.medical_history ?? {}),
    allergies: convert(state.allergies ?? {}),
    risk_factors: convert(state.risk_factors ?? {}),
  };
}

let _sessionId: string | null = null;

export const ExtractionService = {
  /**
   * Process a Sinhala transcript chunk and get updated medical state
   */
  async processTranscript(
    transcriptSi: string,
    currentState: MedicalState,
  ): Promise<ExtractionResponse | null> {
    if (!transcriptSi.trim()) return null;

    // Generate a session ID once per page load
    if (!_sessionId) {
      _sessionId = crypto.randomUUID();
    }

    try {
      const response = await fetch(`${BACKEND_URL}/process-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: _sessionId,
          transcript_si: transcriptSi,
          current_state: toBackendState(currentState),
        }),
      });

      if (!response.ok) {
        throw new Error(`Extraction Backend Error: ${response.statusText}`);
      }

      const raw = await response.json();
      // Convert backend PatientState (Dict[str, TrackedItem]) → frontend MedicalState (string[])
      return {
        updated_state: toFrontendState(raw.updated_state),
        missing_critical: raw.missing_critical,
        translated_text: raw.translated_text,
      } as ExtractionResponse;
    } catch (error) {
      console.error("Failed to process clinical transcript:", error);
      return null;
    }
  },

  /**
   * Manual override or acceptance of an item
   */
  async updateItemStatus(
    item: string,
    category: string,
    status: "accepted" | "rejected",
  ) {
    try {
      const response = await fetch(`${BACKEND_URL}/update-item-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, category, status }),
      });
      return await response.json();
    } catch (error) {
      console.error("Failed to update item status:", error);
      return null;
    }
  },
};
