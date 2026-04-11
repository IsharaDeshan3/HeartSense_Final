"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Microscope,
  Plus,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import {
  PatientCard,
  type DoctorPatientCardData,
} from "@/components/doctor/PatientCard";
import { sortPatientsBySeverity } from "@/components/doctor/patientSeverity";

const VerificationPortal = dynamic(
  () =>
    import("@/components/ui/VerificationPortal").then(
      (mod) => mod.VerificationPortal,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[2.5rem] border border-border/30 bg-card/70 p-10 animate-pulse">
        <div className="h-8 w-80 rounded-full bg-muted/20 mb-4" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-48 rounded-4xl bg-muted/10" />
          <div className="h-48 rounded-4xl bg-muted/10" />
        </div>
      </div>
    ),
  },
);

type LookupResult =
  | { type: "assigned"; patient: DoctorPatientCardData }
  | {
      type: "unassigned";
      patient: {
        _id: string;
        fullName: string;
        patientId: string;
        age?: number;
        gender?: string;
      };
    };

export default function DoctorDashboard() {
  const router = useRouter();
  const [patients, setPatients] = useState<DoctorPatientCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [registryQuery, setRegistryQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const deferredRegistryQuery = useDeferredValue(registryQuery);

  const filteredPatients = useMemo(() => {
    const query = deferredRegistryQuery.toLowerCase().trim();
    const rankedPatients = sortPatientsBySeverity(patients);
    if (!query) return rankedPatients;

    return rankedPatients.filter((patient) => {
      return (
        patient.fullName?.toLowerCase().includes(query) ||
        patient.patientId?.toLowerCase().includes(query)
      );
    });
  }, [patients, deferredRegistryQuery]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profRes, patRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/doctor/patients"),
      ]);

      if (profRes.ok) {
        const prof = await profRes.json();
        setCurrentUser(prof);
      }

      if (patRes.ok) {
        setPatients(await patRes.json());
      }
    } catch {
      console.error("Failed to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegistryLookup = async () => {
    const query = registryQuery.trim();
    if (!query) {
      toast.error("Enter a patient identifier to search the full registry.");
      return;
    }

    setLookupError(null);
    setLookupResult(null);
    setIsLookupLoading(true);

    try {
      const response = await fetch(
        `/api/doctor/patients/search?id=${encodeURIComponent(query)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registry search failed");
      }

      setLookupResult(data);
      if (data.type === "assigned") {
        toast.success("Assigned patient found in your workspace.");
      }
    } catch (error: any) {
      setLookupError(error.message || "Registry search failed");
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!lookupResult || lookupResult.type !== "unassigned") return;
    if (!requestReason.trim()) {
      toast.error("Please provide a reason for access.");
      return;
    }

    setIsRequestSubmitting(true);
    try {
      const response = await fetch("/api/doctor/patients/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientDbId: lookupResult.patient._id,
          reason: requestReason.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Request failed");
      }

      toast.success("Access request transmitted to administrative council.");
      setRequestReason("");
    } catch (error: any) {
      toast.error(error.message || "Failed to transmit access request.");
    } finally {
      setIsRequestSubmitting(false);
    }
  };

  return (
    <>
      <DashboardHeader
        title="Clinical Workspace"
        doctorName={currentUser?.fullName ?? ""}
        showSessionControls={false}
      />

      <div className="p-8 md:p-12 flex-1 overflow-y-auto space-y-10">
        {!currentUser ? (
          <div className="h-96 flex-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
          </div>
        ) : !currentUser.isApproved ? (
          <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-destructive/5 border border-destructive/20 p-10 rounded-[3rem] flex items-center gap-10 shadow-xl futuristic-glow shadow-destructive/5">
              <div className="h-20 w-20 rounded-4xl bg-destructive/10 flex-center text-destructive">
                <ShieldAlert className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-destructive uppercase tracking-tight">
                  Access Pending Authorization
                </h2>
                <p className="text-base text-muted-foreground font-semibold">
                  Your clinical credentials are currently being verified by the
                  research team. This process ensures data integrity and patient
                  privacy.
                </p>
              </div>
            </div>

            {!currentUser.verificationIdBase64 ? (
              <VerificationPortal onComplete={fetchData} />
            ) : (
              <div className="glass border-border/40 p-16 rounded-[4rem] text-center space-y-8 futuristic-glow">
                <div className="h-24 w-24 rounded-full bg-primary/5 flex-center mx-auto text-primary relative">
                  <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
                  <Loader2 className="h-12 w-12 animate-spin opacity-20" />
                  <Microscope className="h-10 w-10 absolute text-primary" />
                </div>
                <h3 className="text-3xl font-black tracking-tight">
                  Verification in Progress
                </h3>
                <p className="text-lg text-muted-foreground max-w-lg mx-auto font-medium">
                  Our research administrators are cross-referencing your medical
                  license with national databases. You will gain full workspace
                  access shortly.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in duration-700">
            <Card className="glass border-border shadow-xl rounded-[2.5rem] max-w-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
                  Active Registry
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-4">
                <div className="text-4xl md:text-5xl font-black tracking-tighter text-gradient">
                  {patients.length}
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full h-10 px-4 text-xs font-black uppercase tracking-[0.18em]"
                >
                  <Link href="/dashboard/doctor/patients">View Patients</Link>
                </Button>
              </CardContent>
            </Card>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-3xl font-black tracking-tight">
                    Clinical Registry
                  </h2>
                  <Button
                    type="button"
                    onClick={handleRegistryLookup}
                    disabled={isLookupLoading || !registryQuery.trim()}
                    className="rounded-full h-11 px-6 font-black text-xs uppercase tracking-[0.2em]"
                  >
                    {isLookupLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search Full Registry
                  </Button>
                </div>

                <div className="glass border border-border/30 rounded-4xl p-5 md:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">
                        Unified Search
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Search your assigned patients instantly, then search the
                        full registry for access requests.
                      </p>
                    </div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                      {filteredPatients.length} local result
                      {filteredPatients.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={registryQuery}
                      onChange={(event) => {
                        setRegistryQuery(event.target.value);
                        setLookupError(null);
                      }}
                      placeholder="Name, patient ID, or registry identifier"
                      className="h-14 rounded-2xl pl-12 bg-background/60 border-border/40"
                    />
                  </div>
                </div>

                {lookupError && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {lookupError}
                  </div>
                )}

                {lookupResult && (
                  <Card className="glass border-border/30 rounded-4xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Registry Match
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-2xl border border-border/40 bg-background/40 p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-black">
                            {lookupResult.patient.fullName}
                          </p>
                          <p className="text-xs font-mono text-muted-foreground uppercase">
                            {lookupResult.patient.patientId}
                          </p>
                        </div>
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                          {lookupResult.patient.age
                            ? `${lookupResult.patient.age}Y`
                            : "Age N/A"}{" "}
                          • {lookupResult.patient.gender ?? "Unknown"}
                        </div>
                      </div>

                      {lookupResult.type === "assigned" ? (
                        <Button
                          className="w-full rounded-xl"
                          onClick={() =>
                            router.push(
                              `/dashboard/doctor/patients/${lookupResult.patient._id}/history`,
                            )
                          }
                        >
                          Open Patient History
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          <Input
                            value={requestReason}
                            onChange={(event) =>
                              setRequestReason(event.target.value)
                            }
                            placeholder="Reason for access request"
                            className="h-12 rounded-xl"
                          />
                          <Button
                            className="w-full rounded-xl"
                            onClick={handleRequestAccess}
                            disabled={
                              !requestReason.trim() || isRequestSubmitting
                            }
                          >
                            {isRequestSubmitting ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Submit Access Request
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-4">
                  {isLoading ? (
                    <div className="h-40 glass animate-pulse rounded-4xl"></div>
                  ) : filteredPatients.length > 0 ? (
                    filteredPatients
                      .slice(0, 5)
                      .map((patient) => (
                        <PatientCard
                          key={patient._id}
                          patient={patient}
                          onOpen={(patientDbId) =>
                            router.push(
                              `/dashboard/doctor/patients/${patientDbId}/history`,
                            )
                          }
                        />
                      ))
                  ) : (
                    <div className="py-16 text-center glass rounded-[2.5rem] border-dashed border-primary/20 futuristic-glow shadow-primary/5">
                      <Users className="h-12 w-12 text-primary/20 mx-auto mb-4" />
                      <p className="text-muted-foreground text-sm font-black uppercase tracking-widest opacity-60">
                        {registryQuery
                          ? "No matching assigned patients"
                          : "No patients assigned yet"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <Card className="glass border-border/40 rounded-4xl">
                  <CardHeader>
                    <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                      Workspace Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-3">
                    <p>
                      Use one search bar for both tasks: local filtering of
                      assigned patients and full-registry lookups for access
                      requests.
                    </p>
                    <p>
                      Navigate to the full patient list for bulk review and
                      deletion controls. New Case, theme controls, and sign out
                      are now in the left navigation.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <Button
              asChild
              className="lg:hidden fixed bottom-5 right-5 z-40 h-12 rounded-full px-5 shadow-xl"
            >
              <Link href="/dashboard/doctor/new-case">
                <Plus className="h-4 w-4 mr-2" />
                New Case
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
