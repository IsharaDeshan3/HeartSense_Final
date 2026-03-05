"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle,
  User,
  Activity,
  UserCheck,
  RefreshCw,
  Mail,
  Fingerprint
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/ui/DashboardHeader";

interface AccessRequest {
  _id: string;
  patientId: {
    _id: string;
    fullName: string;
    patientId: string;
  };
  doctorId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    identifier: string;
  };
  reason: string;
  status: string;
  createdAt: string;
}

export default function AdminAccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/access-requests");
      if (!response.ok) throw new Error("Failed to fetch requests");
      const data = await response.json();
      setRequests(data);
    } catch (error: any) {
      toast.error("Registry Error", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (requestId: string, status: "approved" | "rejected") => {
    setIsProcessing(requestId);
    try {
      const response = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      toast.success(`Request ${status === "approved" ? "Authorized" : "Denied"}`, {
        description: "The clinician's access has been updated."
      });

      setRequests(prev => prev.filter(r => r._id !== requestId));
    } catch (error: any) {
      toast.error("Process Error", { description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <DashboardHeader 
        title="Access Authorizations"
        icon={<ShieldCheck className="h-8 w-8" />}
      >
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group text-xs font-bold uppercase tracking-widest leading-none">
           <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
           Dashboard
        </Link>
        <Button variant="outline" className="rounded-xl border-white/10 glass" onClick={fetchRequests} disabled={isLoading}>
           <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
           Refresh List
        </Button>
      </DashboardHeader>

      <div className="p-8 flex flex-col items-center flex-1 overflow-y-auto w-full">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10"></div>
        
        <div className="w-full max-w-6xl space-y-8">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">Review clinical requests for sensitive patient data access.</p>
          </div>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 glass rounded-[2.5rem] bg-white/5"></div>
            ))}
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-6">
            {requests.map(req => (
              <Card key={req._id} className="glass border-white/5 bg-white/[0.02] hover:border-white/10 transition-all duration-300 rounded-[2.5rem] overflow-hidden">
                <CardContent className="p-8">
                  <div className="flex flex-col lg:flex-row gap-8 items-center">
                    {/* Doctor Info */}
                    <div className="flex-1 flex gap-4 items-start w-full">
                       <div className="h-12 w-12 rounded-2xl bg-primary/10 flex-center text-primary shrink-0">
                          <User className="h-6 w-6" />
                       </div>
                       <div className="space-y-1">
                          <h3 className="font-bold text-lg text-white">Dr. {req.doctorId.firstName} {req.doctorId.lastName}</h3>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                             <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {req.doctorId.email}</span>
                             <span className="flex items-center gap-1.5 font-mono"><Fingerprint className="h-3.5 w-3.5" /> {req.doctorId.identifier}</span>
                          </div>
                          <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/5 italic text-sm text-muted-foreground">
                             &quot;{req.reason || "No specific reason provided."}&quot;
                          </div>
                       </div>
                    </div>

                    <div className="hidden lg:block w-px h-24 bg-white/5"></div>

                    {/* Patient Info */}
                    <div className="flex-1 flex gap-4 items-start w-full">
                       <div className="h-12 w-12 rounded-2xl bg-accent/10 flex-center text-accent shrink-0">
                          <Activity className="h-6 w-6" />
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none mb-2">Requesting Access For:</p>
                          <h4 className="font-bold text-lg text-white">{req.patientId.fullName}</h4>
                          <p className="text-xs font-mono text-muted-foreground uppercase">{req.patientId.patientId}</p>
                          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                             <Clock className="h-3 h-3" />
                             Requested: {new Date(req.createdAt).toLocaleString()}
                          </div>
                       </div>
                    </div>

                    {/* Actions */}
                    <div className="flex lg:flex-col gap-3 w-full lg:w-auto shrink-0">
                       <Button 
                         className="flex-1 lg:w-40 h-12 rounded-xl bg-primary text-primary-foreground font-bold border-none glow-primary hover:scale-[1.02] transition-all"
                         onClick={() => handleAction(req._id, "approved")}
                         disabled={isProcessing === req._id}
                       >
                         {isProcessing === req._id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Authorize</>}
                       </Button>
                       <Button 
                         variant="outline"
                         className="flex-1 lg:w-40 h-12 rounded-xl border-white/10 glass text-muted-foreground hover:text-red-500 hover:border-red-500/50"
                         onClick={() => handleAction(req._id, "rejected")}
                         disabled={isProcessing === req._id}
                       >
                         <XCircle className="h-4 w-4 mr-2" /> Reject
                       </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center glass rounded-[3rem] border-white/5">
             <ShieldCheck className="h-16 w-16 text-muted-foreground/10 mx-auto mb-6" />
             <h2 className="text-2xl font-bold tracking-tight text-muted-foreground">No pending authorizations</h2>
             <p className="text-sm text-muted-foreground/50">All clinical access requests have been processed.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
