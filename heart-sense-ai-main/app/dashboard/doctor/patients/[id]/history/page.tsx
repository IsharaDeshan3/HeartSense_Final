"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  History,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { toast } from "sonner";
import PatientHistory from "@/components/PatientHistory";
import { WorkflowService } from "@/services/WorkflowService";
import type {
  PatientDiagnosisRecord,
  PatientHistorySummary,
} from "@/services/WorkflowService";

const LAB_BACKEND_URL = "http://localhost:8000";

interface PatientInfo {
  _id: string;
  fullName: string;
  patientId: string;
  age?: number;
  gender?: string;
}

interface LabHistoryEntry {
  _id: string;
  testDate?: string;
  labComparison?: Array<{
    test: string;
    actualValue: string | number;
    normalRange: string;
    status: string;
  }>;
}

export default function PatientHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [diagnosisHistory, setDiagnosisHistory] = useState<PatientDiagnosisRecord[]>([]);
  const [historySummary, setHistorySummary] = useState<PatientHistorySummary | null>(null);
  const [labHistory, setLabHistory] = useState<LabHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;

    const fetchAll = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch patient info from lab_backend (MongoDB)
        const patientRes = await fetch(`/api/doctor/patients`);
        if (patientRes.ok) {
          const patients = await patientRes.json();
          const found = patients.find(
            (p: PatientInfo) => p._id === patientId || p.patientId === patientId
          );
          if (found) setPatient(found);
          else setPatient({ _id: patientId, fullName: "Unknown Patient", patientId });
        }

        // Fetch diagnosis history from analysis_flow (Supabase)
        try {
          const historyRes = await WorkflowService.getPatientHistory(patientId);
          setDiagnosisHistory(historyRes.records || []);
          setHistorySummary(historyRes.summary || null);
        } catch (e) {
          console.warn("Failed to fetch diagnosis history:", e);
          setDiagnosisHistory([]);
          setHistorySummary(null);
        }

        // Fetch lab test history from lab_backend
        try {
          const labRes = await fetch(
            `${LAB_BACKEND_URL}/api/patient-history?patient_id=${patientId}`
          );
          if (labRes.ok) {
            const labData = await labRes.json();
            setLabHistory(Array.isArray(labData) ? labData : labData.records || []);
          }
        } catch (e) {
          console.warn("Failed to fetch lab history:", e);
          setLabHistory([]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load patient data";
        setError(msg);
        toast.error("Failed to load patient data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [patientId]);

  const handleStartDiagnosis = () => {
    router.push(`/dashboard/doctor/workspace/${patientId}`);
  };

  return (
    <>
      <DashboardHeader
        title="Patient History"
        icon={<History className="h-8 w-8" />}
      />

      <div className="p-12 flex-1 overflow-y-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/doctor/patients")}
            className="rounded-xl gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>

          <Button
            onClick={handleStartDiagnosis}
            className="h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg border-none text-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start New Diagnosis
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-80">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
            <p className="text-sm text-rose-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="border-rose-500/20 text-rose-400"
            >
              Retry
            </Button>
          </div>
        ) : patient ? (
          <PatientHistory
            patient={patient}
            diagnosisHistory={diagnosisHistory}
            historySummary={historySummary}
            labHistory={labHistory}
          />
        ) : null}
      </div>
    </>
  );
}
