export type PatientSeverityLevel = "critical" | "high" | "moderate" | "stable";

export type SeverityFilterState = Record<PatientSeverityLevel, boolean>;

export const DEFAULT_SEVERITY_FILTERS: SeverityFilterState = {
  critical: true,
  high: true,
  moderate: true,
  stable: false,
};

export const MONITOR_FILTERS_STORAGE_KEY = "doctor-monitor-filters-v1";
export const MONITOR_PINS_STORAGE_KEY = "doctor-monitor-pins-v1";

interface DiagnosisHistoryItem {
  summary?: string;
  date?: string;
  type?: string;
}

interface ClinicalDiagnosisItem {
  condition?: string;
  date?: string;
}

interface PatientMedicalData {
  symptoms?: string[];
  riskFactors?: string[];
  diagnosisHistory?: ClinicalDiagnosisItem[];
}

export interface DoctorPatientRecord {
  _id: string;
  fullName: string;
  patientId: string;
  age?: number;
  gender?: string;
  profileImage?: string;
  imageUrl?: string;
  avatarUrl?: string;
  updatedAt?: string;
  medicalData?: PatientMedicalData;
  diagnosticHistory?: DiagnosisHistoryItem[];
}

const CRITICAL_KEYWORDS = [
  "myocardial infarction",
  "st elevation",
  "stemi",
  "cardiac arrest",
  "ventricular tachycardia",
  "ventricular fibrillation",
  "shock",
  "acute heart failure",
  "severe ischemia",
  "critical",
  "unstable",
];

const HIGH_KEYWORDS = [
  "arrhythmia",
  "atrial fibrillation",
  "ischemia",
  "hypertensive crisis",
  "decompensation",
  "worsening",
  "elevated troponin",
  "high risk",
  "urgent",
];

const MODERATE_KEYWORDS = [
  "hypertension",
  "tachycardia",
  "bradycardia",
  "abnormal",
  "follow-up",
  "moderate",
  "risk",
];

export function getLatestDiagnosisText(patient: DoctorPatientRecord): string {
  const diagnosticCandidates = [...(patient.diagnosticHistory ?? [])]
    .filter((item) => item.summary || item.type)
    .sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

  if (diagnosticCandidates.length > 0) {
    const top = diagnosticCandidates[0];
    return top.summary ?? top.type ?? "Diagnosis recorded";
  }

  const clinicalCandidates = [...(patient.medicalData?.diagnosisHistory ?? [])]
    .filter((item) => item.condition)
    .sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

  if (clinicalCandidates.length > 0) {
    return clinicalCandidates[0].condition ?? "Diagnosis recorded";
  }

  return "No diagnosis history yet";
}

export function getPatientSeverity(
  patient: DoctorPatientRecord,
): PatientSeverityLevel {
  const diagnosisText = getLatestDiagnosisText(patient).toLowerCase();

  if (CRITICAL_KEYWORDS.some((keyword) => diagnosisText.includes(keyword))) {
    return "critical";
  }

  if (HIGH_KEYWORDS.some((keyword) => diagnosisText.includes(keyword))) {
    return "high";
  }

  if (MODERATE_KEYWORDS.some((keyword) => diagnosisText.includes(keyword))) {
    return "moderate";
  }

  return "stable";
}

export function getSeverityScore(level: PatientSeverityLevel): number {
  switch (level) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

export function getSeverityClasses(level: PatientSeverityLevel) {
  if (level === "critical") {
    return {
      border: "border-rose-400/50 hover:border-rose-400/70",
      badge: "bg-rose-500/15 text-rose-600 border-rose-400/30",
      dot: "bg-rose-500",
      label: "Critical",
    };
  }

  if (level === "high") {
    return {
      border: "border-amber-400/50 hover:border-amber-400/70",
      badge: "bg-amber-500/15 text-amber-700 border-amber-400/40",
      dot: "bg-amber-500",
      label: "High",
    };
  }

  if (level === "moderate") {
    return {
      border: "border-sky-400/45 hover:border-sky-400/60",
      badge: "bg-sky-500/15 text-sky-700 border-sky-400/35",
      dot: "bg-sky-500",
      label: "Moderate",
    };
  }

  return {
    border: "border-emerald-400/40 hover:border-emerald-400/55",
    badge: "bg-emerald-500/15 text-emerald-700 border-emerald-400/30",
    dot: "bg-emerald-500",
    label: "Stable",
  };
}

export function sortPatientsBySeverity(patients: DoctorPatientRecord[]) {
  return [...patients].sort((a, b) => {
    const severityDelta =
      getSeverityScore(getPatientSeverity(b)) -
      getSeverityScore(getPatientSeverity(a));
    if (severityDelta !== 0) return severityDelta;

    const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bUpdated - aUpdated;
  });
}
