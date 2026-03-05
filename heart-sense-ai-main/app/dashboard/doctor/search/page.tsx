"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Search, 
  User, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Lock, 
  Unlock,
  ChevronRight,
  Send,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/ui/DashboardHeader";

interface PatientResult {
  _id: string;
  fullName: string;
  patientId: string;
  age: number;
  gender: string;
}

export default function DoctorPatientSearch() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{ type: "assigned" | "unassigned"; patient: PatientResult } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setIsSearching(true);
    setResult(null);
    try {
      const response = await fetch(`/api/doctor/patients/search?id=${query}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.message);
      setResult(data);
    } catch (error: any) {
      toast.error("Database Lookup Failed", { description: error.message });
    } finally {
      setIsSearching(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!result || !requestReason) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/doctor/patients/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientDbId: result.patient._id,
          reason: requestReason
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      toast.success("Request Transmitted", {
        description: "Administrative council will review your access request shortly."
      });
      setResult(null);
      setQuery("");
      setRequestReason("");
    } catch (error: any) {
      toast.error("Transmission Failed", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <DashboardHeader 
        title="Patient Identification"
        icon={<Search className="h-8 w-8" />}
      >
        <Link href="/dashboard/doctor" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group text-xs font-bold uppercase tracking-widest leading-none">
           <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
           Clinical Workspace
        </Link>
      </DashboardHeader>

      <div className="p-8 flex flex-col items-center flex-1 overflow-y-auto w-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,oklch(0.7_0.15_180/0.05)_0%,transparent_70%)] -z-10"></div>

      <div className="w-full max-w-4xl space-y-8">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Query the national medical registry to identify patients and request clinical clearance.</p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
             <Input
               placeholder="Enter NIC number or Passport Identifier..."
               className="pl-12 h-16 bg-white/5 border-white/10 rounded-2xl focus:border-primary/50 transition-all text-lg shadow-2xl"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
             />
           </div>
           <Button type="submit" disabled={isSearching} className="h-16 px-10 rounded-2xl bg-primary text-primary-foreground font-bold text-lg glow-primary border-none transition-all hover:scale-[1.02]">
              {isSearching ? <Loader2 className="h-6 w-6 animate-spin" /> : "Identify Subject"}
           </Button>
        </form>

        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {result.type === "assigned" ? (
               <Card className="glass border-primary/20 bg-primary/5 rounded-[2.5rem] overflow-hidden">
                  <CardHeader className="text-center pb-2">
                     <div className="h-16 w-16 rounded-2xl bg-primary/20 flex-center text-primary mx-auto mb-4 glow-primary">
                        <ShieldCheck className="h-8 w-8" />
                     </div>
                     <CardTitle className="text-2xl font-bold">Authorized Access Verified</CardTitle>
                     <CardDescription>This patient is already assigned to your workspace.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-10 flex flex-col items-center space-y-8">
                     <div className="w-full flex justify-between items-center p-6 bg-white/5 rounded-3xl border border-white/5">
                        <div className="flex gap-4 items-center">
                           <div className="h-12 w-12 rounded-xl bg-primary/10 flex-center text-primary font-bold">
                              {result.patient.fullName.charAt(0)}
                           </div>
                           <div className="space-y-1">
                              <h3 className="font-bold text-lg">{result.patient.fullName}</h3>
                              <p className="text-xs font-mono text-muted-foreground uppercase">{result.patient.patientId}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Biological Identity</div>
                           <div className="text-sm font-medium">{result.patient.age}Y | {result.patient.gender.toUpperCase()}</div>
                        </div>
                     </div>
                     
                     <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button className="h-14 rounded-xl bg-primary border-none glow-primary font-bold flex items-center justify-center gap-3" asChild>
                           <Link href={`/dashboard/doctor/patients/${result.patient._id}`}>
                              Open Full Medical Record <Unlock className="h-4 w-4" />
                           </Link>
                        </Button>
                        <Button variant="outline" className="h-14 rounded-xl border-white/10 glass font-bold">
                           Request Recent Tests
                        </Button>
                     </div>
                  </CardContent>
               </Card>
             ) : (
               <Card className="glass border-accent/20 bg-accent/[0.02] rounded-[2.5rem] overflow-hidden">
                  <CardHeader className="text-center pb-2">
                     <div className="h-16 w-16 rounded-2xl bg-accent/10 flex-center text-accent mx-auto mb-4">
                        <ShieldAlert className="h-8 w-8" />
                     </div>
                     <CardTitle className="text-2xl font-bold">Subject Identified</CardTitle>
                     <CardDescription>Patient found in registry, but clinical clearance is required.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-10 space-y-8">
                     <div className="flex justify-between items-center p-6 bg-white/5 rounded-3xl border border-white/5">
                        <div className="flex gap-4 items-center">
                           <div className="h-12 w-12 rounded-xl bg-accent/10 flex-center text-accent font-bold">
                              {result.patient.fullName.charAt(0)}
                           </div>
                           <div className="space-y-1">
                              <h3 className="font-bold text-lg">{result.patient.fullName}</h3>
                              <p className="text-xs font-mono text-muted-foreground uppercase">{result.patient.patientId}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <Lock className="h-5 w-5 text-accent/50 ml-auto mb-2" />
                           <div className="text-[10px] font-bold text-accent uppercase tracking-widest">Confidential Record Restricted</div>
                        </div>
                     </div>

                     <div className="space-y-4">
                        <div className="space-y-2">
                           <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Reason for Access Request</Label>
                           <Input 
                             placeholder="E.g., Emergency consultation, Referral following screening..."
                             className="bg-white/5 border-white/10 rounded-xl h-14"
                             value={requestReason}
                             onChange={(e) => setRequestReason(e.target.value)}
                           />
                        </div>
                        <div className="p-4 rounded-xl bg-accent/5 flex items-start gap-3 border border-accent/10">
                           <AlertCircle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                           <p className="text-xs text-accent/80 leading-relaxed">
                              Administrative approval is required to view full clinical details. Your request will be audited by the HeartSense Security Council.
                           </p>
                        </div>
                        <Button 
                          className="w-full h-16 rounded-2xl bg-accent text-accent-foreground font-bold text-lg border-none hover:scale-[1.01] transition-all"
                          onClick={handleRequestAccess}
                          disabled={!requestReason || isSubmitting}
                        >
                           {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Send className="h-5 w-5 mr-3" /> Transmit Access Request</>}
                        </Button>
                     </div>
                  </CardContent>
               </Card>
             )}
          </div>
        )}

        {!result && !isSearching && query && (
           <div className="py-20 text-center glass rounded-[3rem] border-dashed border-white/5 animate-in fade-in zoom-in duration-300">
              <Activity className="h-16 w-16 text-muted-foreground/10 mx-auto mb-4" />
              <p className="text-muted-foreground">Search to identify a patient profile.</p>
           </div>
        )}
        </div>
      </div>
    </div>
  );
}
