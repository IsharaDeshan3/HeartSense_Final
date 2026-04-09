"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, Plus, History, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { toast } from "sonner";
import { WorkflowService } from "@/services/WorkflowService";
import type {
  PatientDiagnosisRecord,
  PatientHistorySummary,
  PatientHistoryStatus,
  WorkflowSession,
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

function mapWorkflowStateToResumeLabel(state: string) {
  if (state === "EXTRACTION_DONE") return "Symptoms saved - continue at ECG";
  if (state === "ECG_DONE") return "ECG saved - continue at Lab";
  if (state === "LAB_DONE" || state === "ANALYSIS_RUNNING") {
    return "Lab saved - continue at Analysis";
  }
  return "Continue diagnosis";
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
  const [diagnosisHistory, setDiagnosisHistory] = useState<
    PatientDiagnosisRecord[]
  >([]);
  const [historySummary, setHistorySummary] =
    useState<PatientHistorySummary | null>(null);
  const [labHistory, setLabHistory] = useState<LabHistoryEntry[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    PatientHistoryStatus | "unknown"
  >("unknown");
  const [inProgressSessions, setInProgressSessions] = useState<
    WorkflowSession[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingActiveSessions, setDeletingActiveSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [deletingPayloadId, setDeletingPayloadId] = useState<string | null>(
    null,
  );

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
        const [patientRes, historyRes, labRes, sessionsRes] =
          await Promise.allSettled([
            fetch(`/api/doctor/patients/${encodeURIComponent(patientId)}`),
            WorkflowService.getPatientHistory(patientId),
            fetch(
              `/api/lab/patient-history?patient_id=${encodeURIComponent(patientId)}`,
            ),
            WorkflowService.listPatientSessions(patientId, {
              includeCompleted: false,
              limit: 25,
            }),
          ]);

        if (patientRes.status === "fulfilled") {
          if (patientRes.value.ok) {
            setPatient(await patientRes.value.json());
          } else {
            setPatient({
              _id: patientId,
              fullName: "Unknown Patient",
              patientId,
            });
          }
        } else {
          console.warn("Failed to fetch patient info:", patientRes.reason);
          setPatient({
            _id: patientId,
            fullName: "Unknown Patient",
            patientId,
          });
        }

        if (historyRes.status === "fulfilled") {
          setDiagnosisHistory(historyRes.value.records || []);
          setHistorySummary(historyRes.value.summary || null);
          const derivedStatus = historyRes.value.supabase_health?.connected
            ? (historyRes.value.supabase_status ?? "ok")
            : "unreachable";
          setHistoryStatus(derivedStatus);
        } else {
          console.warn("Failed to fetch diagnosis history:", historyRes.reason);
          setDiagnosisHistory([]);
          setHistorySummary(null);
          setHistoryStatus("unreachable");
        }

        if (labRes.status === "fulfilled") {
          if (labRes.value.ok) {
            const labData = await labRes.value.json();
            setLabHistory(
              Array.isArray(labData) ? labData : labData.records || [],
            );
          } else {
            setLabHistory([]);
          }
        } else {
          console.warn("Failed to fetch lab history:", labRes.reason);
          setLabHistory([]);
        }

        if (sessionsRes.status === "fulfilled") {
          const sessions = Array.isArray(sessionsRes.value.sessions)
            ? sessionsRes.value.sessions
            : [];
          setInProgressSessions(
            sessions.filter(
              (session) => session.current_state !== "SESSION_CREATED",
            ),
          );
        } else {
          console.warn(
            "Failed to fetch workflow sessions:",
            sessionsRes.reason,
          );
          setInProgressSessions([]);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load patient data";
        setError(msg);
        toast.error("Failed to load patient data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [patientId]);

  const handleStartDiagnosis = () => {
    router.push(`/dashboard/doctor/workspace/${patientId}?new=1`);
  };

  const handleContinueDiagnosis = (sessionId: string) => {
    router.push(
      `/dashboard/doctor/workspace/${patientId}?resume_session_id=${encodeURIComponent(sessionId)}`,
    );
  };

  const handleDeleteActiveSessions = async () => {
    if (
      !patientId ||
      deletingActiveSessions ||
      inProgressSessions.length === 0
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${inProgressSessions.length} active session${inProgressSessions.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingActiveSessions(true);
    try {
      const result =
        await WorkflowService.deleteActivePatientSessions(patientId);
      toast.success(
        `Deleted ${result.deleted_count} active session${result.deleted_count === 1 ? "" : "s"}`,
      );
      setInProgressSessions([]);
      if (historyStatus !== "unreachable") {
        const refreshed = await WorkflowService.getPatientHistory(patientId);
        setDiagnosisHistory(refreshed.records || []);
        setHistorySummary(refreshed.summary || null);
        const derivedStatus = refreshed.supabase_health?.connected
          ? (refreshed.supabase_status ?? "ok")
          : "unreachable";
        setHistoryStatus(derivedStatus);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete active sessions";
      toast.error(msg);
    } finally {
      setDeletingActiveSessions(false);
    }
  };

  const handleDeleteHistoryEntry = async (payloadId: string) => {
    const previousHistory = diagnosisHistory;
    const previousSummary = historySummary;

    // Optimistic UI: remove immediately from timeline.
    setDiagnosisHistory((prev) =>
      prev.filter((record) => record.payload_id !== payloadId),
    );
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
      const msg =
        err instanceof Error ? err.message : "Failed to delete history entry";
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
        showSessionControls={false}
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
              Patient history is unavailable right now. Showing the rest of the
              patient record.
            </div>
          </div>
        )}

        {/* Content */}
        {!isLoading && inProgressSessions.length > 0 && (
          <div className="rounded-2xl border border-primary/20 bg-primary/4 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-black uppercase tracking-wider text-primary/80">
                In-Progress Diagnoses
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {inProgressSessions.length} active session
                  {inProgressSessions.length === 1 ? "" : "s"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteActiveSessions}
                  disabled={deletingActiveSessions}
                  className="h-8 rounded-lg border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                >
                  {deletingActiveSessions
                    ? "Deleting..."
                    : "Delete Active Sessions"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {inProgressSessions.map((session) => (
                <div
                  key={session.session_id}
                  className="rounded-xl border border-white/10 bg-white/2 p-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold">
                      {mapWorkflowStateToResumeLabel(session.current_state)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      State: {session.current_state} - Updated:{" "}
                      {new Date(session.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleContinueDiagnosis(session.session_id)}
                    size="sm"
                    className="rounded-lg"
                  >
                    Continue
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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
