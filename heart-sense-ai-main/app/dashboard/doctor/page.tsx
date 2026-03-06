"use client";

import { useState, useEffect } from "react";
import {
  Dna,
  Users,
  Activity,
  Search,
  Plus,
  ChevronRight,
  HeartPulse,
  Microscope,
  Stethoscope,
  ShieldAlert,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { VerificationPortal } from "@/components/ui/VerificationPortal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function DoctorDashboard() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profRes, patRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/doctor/patients")
      ]);

      if (profRes.ok) {
        const prof = await profRes.json();
        setCurrentUser(prof);
      }

      if (patRes.ok) {
        setPatients(await patRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <>
      <DashboardHeader
        title="Clinical Workspace"
        badge="Quantum Connection"
        stats={{ label: "Authenticated Clinician", value: "SLMC SECURED SESSION" }}
        icon={<Stethoscope className="h-8 w-8" />}
      />

      <div className="p-12 flex-1 overflow-y-auto space-y-12">
        {!currentUser ? (
          <div className="h-96 flex-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
          </div>
        ) : !currentUser.isApproved ? (
          <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-destructive/5 border border-destructive/20 p-10 rounded-[3rem] flex items-center gap-10 shadow-xl futuristic-glow shadow-destructive/5">
              <div className="h-20 w-20 rounded-[2rem] bg-destructive/10 flex-center text-destructive">
                <ShieldAlert className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-destructive uppercase tracking-tight">Access Pending Authorization</h2>
                <p className="text-base text-muted-foreground font-semibold">Your clinical credentials are currently being verified by the research team. This process ensures data integrity and patient privacy.</p>
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
                <h3 className="text-3xl font-black tracking-tight">Verification in Progress</h3>
                <p className="text-lg text-muted-foreground max-w-lg mx-auto font-medium">Our research administrators are cross-referencing your medical license with national databases. You will gain full workspace access shortly.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { label: "Active Registry", value: patients.length.toString(), icon: <Users className="w-7 h-7" />, color: "text-primary" },
                { label: "Patient Waitlist", value: "00", icon: <Activity className="w-7 h-7" />, color: "text-accent" },
                { label: "ECG Digitizations", value: "0", icon: <HeartPulse className="w-7 h-7" />, color: "text-primary" },
                { label: "Neural Reports", value: "0", icon: <Dna className="w-7 h-7" />, color: "text-primary" }
              ].map((stat, i) => (
                <Card key={i} className="glass border-border shadow-xl rounded-[2.5rem] hover:scale-[1.02] transition-all p-2">
                  <CardHeader className="flex flex-row items-center justify-between pb-6 px-8 pt-8">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</span>
                    <div className={`${stat.color} opacity-60`}>{stat.icon}</div>
                  </CardHeader>
                  <CardContent className="px-8 pb-8">
                    <div className="text-5xl font-black tracking-tighter text-gradient">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-12 mt-12">
              <div className="lg:col-span-2 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-black tracking-tight">Clinical Registry</h2>
                  <Button asChild variant="ghost" className="text-primary gap-2 font-black text-xs uppercase tracking-[0.2em] hover:bg-primary/5 px-6 rounded-full h-12">
                    <Link href="/dashboard/doctor/patients">
                      View Full Database <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="space-y-4">
                  {isLoading ? (
                    <div className="h-40 glass animate-pulse rounded-[3rem]"></div>
                  ) : patients.length > 0 ? (
                    patients.slice(0, 5).map(patient => (
                      <div
                        key={patient._id}
                        className="glass border-border/30 p-8 rounded-[2.5rem] flex items-center justify-between hover:border-primary/40 hover:shadow-2xl transition-all cursor-pointer group"
                        onClick={() => router.push(`/dashboard/doctor/patients/${patient._id}/history`)}
                      >
                        <div className="flex items-center gap-8">
                          <div className="h-16 w-16 rounded-[1.5rem] bg-secondary flex-center text-primary font-black text-2xl border border-border group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                            {patient.fullName.charAt(0)}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-black text-xl group-hover:text-glow group-hover:text-primary transition-all">{patient.fullName}</h4>
                            <p className="text-[11px] text-muted-foreground font-black tracking-[0.1em] uppercase opacity-70 italic">{patient.patientId}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 text-muted-foreground opacity-50">Status</div>
                            <div className="text-[11px] px-3 py-1 rounded-full bg-primary/10 text-primary font-black border border-primary/20">VERIFIED</div>
                          </div>
                          <div className="h-12 w-12 rounded-full glass border-border/50 flex-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                            <ChevronRight className="h-6 w-6" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center glass rounded-[4rem] border-dashed border-primary/20 futuristic-glow shadow-primary/5">
                      <Users className="h-16 w-16 text-primary/20 mx-auto mb-6" />
                      <p className="text-muted-foreground text-lg font-black uppercase tracking-widest italic opacity-40">No patients assigned yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                <h2 className="text-3xl font-black tracking-tight">Clinical Actions</h2>
                <div className="grid gap-6">
                  <Button
                    className="h-24 rounded-[2.1rem] bg-primary text-primary-foreground font-black text-xl futuristic-glow border-none flex items-center justify-center gap-6 hover:scale-[1.03] transition-all"
                    onClick={() => router.push("/dashboard/doctor/new-case")}
                  >
                    <Plus className="h-8 w-8" />
                    New Case
                  </Button>
                  <Button variant="outline" className="h-24 rounded-[2.1rem] border-border/50 glass font-black text-xl flex items-center justify-center gap-6 hover:bg-primary/5 transition-all" asChild>
                    <Link href="/dashboard/doctor/search">
                      <Search className="h-8 w-8 text-primary" />
                      Search Registry
                    </Link>
                  </Button>
                </div>

                <Card className="glass border-border/50 rounded-[3rem] overflow-hidden shadow-2xl p-2 futuristic-glow">
                  <CardHeader className="bg-primary/5 pb-8 border-b border-border/30 pt-10 px-10">
                    <CardTitle className="text-xs font-black uppercase tracking-[0.4em] text-primary">Neural Health Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-10 px-10 pb-12 space-y-6">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-black uppercase tracking-widest">Vector Sync</span>
                      <span className="text-primary font-black">100.0%</span>
                    </div>
                    <div className="h-3 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/5">
                      <div className="h-full w-full bg-primary shadow-[0_0_20px_var(--color-primary)]"></div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed font-semibold italic opacity-80">
                      HeartSense intelligence nodes are operational across all research clusters.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
