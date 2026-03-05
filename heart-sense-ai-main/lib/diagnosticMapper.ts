import type {
  SymptomsPayload,
  ECGPayload,
  LabPayload,
} from "@/services/DiagnosticService";
import type { LabAnalysisResult } from "@/components/LabSuggester";

// ─── ECG result shape coming from EcgInterpreter ────────────────────────────

export interface EcgResult {
  rhythm_analysis: {
    heart_rate: number;
    rhythm_type: string;
    regularity: string;
  };
  abnormalities: {
    abnormalities: string[];
    severity: string;
    affected_leads: string[];
  };
  diagnosis: {
    primary_diagnosis: string;
    differential_diagnoses: string[];
    recommendations: string[];
    urgency: string;
  };
  full_interpretation?: string;
  deterministic_metrics?: any;
  [key: string]: any;
}

// ─── Mappers ────────────────────────────────────────────────────────────────

/**
 * Build the SymptomsPayload from workspace state
 */
export function buildSymptomsPayload(
  symptoms: string[],
  riskFactors: string[],
  recentObservation: string,
  age?: number,
  gender?: string,
): SymptomsPayload {
  // Compose a descriptive clinical text blob
  const parts: string[] = [];

  if (recentObservation && recentObservation !== "Awaiting clinical input...") {
    parts.push(`Clinical observation: ${recentObservation}`);
  }

  if (symptoms.length > 0) {
    parts.push(`Presenting symptoms: ${symptoms.join(", ")}`);
  }

  if (riskFactors.length > 0) {
    parts.push(`Risk factors: ${riskFactors.join(", ")}`);
  }

  const text =
    parts.length > 0 ? parts.join(". ") + "." : "No symptoms recorded yet.";

  const chiefComplaint = symptoms.length > 0 ? symptoms[0] : undefined;

  return {
    text,
    age: age ?? undefined,
    sex: mapGenderToSex(gender),
    chief_complaint: chiefComplaint,
    additional: {
      symptom_count: symptoms.length,
      risk_factor_count: riskFactors.length,
    },
  };
}

/**
 * Map ECG analysis result to ECGPayload for the diagnostic processor
 */
export function buildECGPayload(
  ecgResult: EcgResult | null | undefined,
): ECGPayload | undefined {
  if (!ecgResult) return undefined;

  const { rhythm_analysis, abnormalities, diagnosis } = ecgResult;

  return {
    status: "present",
    rhythm: rhythm_analysis?.rhythm_type,
    heart_rate: rhythm_analysis?.heart_rate,
    st_segment: abnormalities?.abnormalities
      ?.find((a) => a.toLowerCase().includes("st"))
      ?.replace(/^ST\s*/i, ""),
    interpretation: diagnosis?.primary_diagnosis,
    findings: [
      ...(abnormalities?.abnormalities ?? []),
      ...(diagnosis?.differential_diagnoses ?? []),
      ...(diagnosis?.recommendations ?? []),
    ].filter(Boolean),
    raw: ecgResult,
  };
}

/**
 * Map LabSuggester result to LabPayload for the diagnostic processor
 */
export function buildLabPayload(
  labResult: LabAnalysisResult | null | undefined,
): LabPayload | undefined {
  if (!labResult) return undefined;

  const g1 = labResult.extractedJsonGroup1 ?? {};
  const g2 = labResult.extractedJsonGroup2 ?? {};

  // Map known lab fields
  const creatinine =
    parseFloat(g1.Cr) || parseFloat(g2.creatinine) || undefined;
  const hemoglobin = parseFloat(g1.Hemoglobin) || undefined;

  // Collect findings from the comparison table
  const findings = labResult.labComparison
    .filter((item) => item.status !== "Normal")
    .map(
      (item) =>
        `${item.test}: ${item.actualValue} (${item.status}, normal: ${item.normalRange})`,
    );

  return {
    status: "present",
    creatinine,
    hemoglobin,
    findings: findings.length > 0 ? findings : undefined,
    raw: {
      group1_diabetic: g1,
      group2_cardiac: g2,
      comparison: labResult.labComparison,
      summary: labResult.summary,
      recommendedTests: labResult.recommendedTests,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapGenderToSex(gender?: string): string | undefined {
  if (!gender) return undefined;
  const g = gender.toLowerCase().trim();
  if (g === "male" || g === "m") return "M";
  if (g === "female" || g === "f") return "F";
  return "Other";
}
