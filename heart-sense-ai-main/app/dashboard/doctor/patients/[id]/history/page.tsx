"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import { WorkflowService } from "@/services/WorkflowService";
import type {
  PatientDiagnosisRecord,
  PatientHistorySummary,
  PatientHistoryStatus,
} from "@/services/WorkflowService";

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
  const PatientHistory = dynamic(() => import("@/components/PatientHistory"), {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl border border-border/30 bg-card/60 p-8 animate-pulse">
        <div className="h-6 w-40 rounded-full bg-muted/20 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 rounded-2xl bg-muted/10" />
          ))}
        </div>
      </div>
    ),
  });




export default function PatientHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [diagnosisHistory, setDiagnosisHistory] = useState<PatientDiagnosisRecord[]>([]);
  const [historySummary, setHistorySummary] = useState<PatientHistorySummary | null>(null);
  const [labHistory, setLabHistory] = useState<LabHistoryEntry[]>([]);
  const [historyStatus, setHistoryStatus] = useState<PatientHistoryStatus | "unknown">("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [deletingPayloadId, setDeletingPayloadId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          setCurrentUser(await res.json());
        }
      } catch {}
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!patientId) return;

    const fetchAll = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [patientRes, historyRes, labRes] = await Promise.allSettled([
          fetch(`/api/doctor/patients/${encodeURIComponent(patientId)}`),
          WorkflowService.getPatientHistory(patientId),
          fetch(`/api/lab/patient-history?patient_id=${encodeURIComponent(patientId)}`),
        ]);

        if (patientRes.status === "fulfilled") {
          if (patientRes.value.ok) {
            setPatient(await patientRes.value.json());
          } else {
            setPatient({ _id: patientId, fullName: "Unknown Patient", patientId });
          }
        } else {
          console.warn("Failed to fetch patient info:", patientRes.reason);
          setPatient({ _id: patientId, fullName: "Unknown Patient", patientId });
        }

        if (historyRes.status === "fulfilled") {
          setDiagnosisHistory(historyRes.value.records || []);
          setHistorySummary(historyRes.value.summary || null);
          setHistoryStatus(historyRes.value.supabase_status ?? "ok");
        } else {
          console.warn("Failed to fetch diagnosis history:", historyRes.reason);
          setDiagnosisHistory([]);
          setHistorySummary(null);
          setHistoryStatus("unreachable");
        }

        if (labRes.status === "fulfilled") {
          if (labRes.value.ok) {
            const labData = await labRes.value.json();
            setLabHistory(Array.isArray(labData) ? labData : labData.records || []);
          } else {
            setLabHistory([]);
          }
        } else {
          console.warn("Failed to fetch lab history:", labRes.reason);
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

  const handleDeleteHistoryEntry = async (payloadId: string) => {
    const previousHistory = diagnosisHistory;
    const previousSummary = historySummary;

    // Optimistic UI: remove immediately from timeline.
    setDiagnosisHistory((prev) => prev.filter((record) => record.payload_id !== payloadId));
    if (historySummary) {
      setHistorySummary({
        ...historySummary,
        visit_count: Math.max(0, historySummary.visit_count - 1),
      });
    }
    setDeletingPayloadId(payloadId);

    try {
      await WorkflowService.deleteHistoryEntry(payloadId);
      toast.success("History entry deleted");

      // Resync from backend to keep summary/top conditions exact.
      const refreshed = await WorkflowService.getPatientHistory(patientId);
      setDiagnosisHistory(refreshed.records || []);
      setHistorySummary(refreshed.summary || null);
      setHistoryStatus(refreshed.supabase_status ?? "ok");
    } catch (err: unknown) {
      setDiagnosisHistory(previousHistory);
      setHistorySummary(previousSummary);
      const msg = err instanceof Error ? err.message : "Failed to delete history entry";
      toast.error(msg);
    } finally {
      setDeletingPayloadId(null);
    }
  };

  return (
    <>
      <DashboardHeader
        title="Patient History"
        icon={<History className="h-8 w-8" />}
        doctorName={currentUser?.fullName ?? ""}
      />

      <div className="p-12 flex-1 overflow-y-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/doctor")}
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

        {historyStatus === "unreachable" && !isLoading && !error && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="text-sm">
              Patient history is temporarily unavailable (Supabase timeout). Please try again later.
            </div>
          </div>
        )}

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
            onDeleteHistoryEntry={handleDeleteHistoryEntry}
            deletingPayloadId={deletingPayloadId}
          />
        ) : null}
      </div>
    </>
  );
}
