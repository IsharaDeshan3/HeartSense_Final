"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  UserCheck, 
  UserX, 
  Search, 
  Stethoscope,
  ShieldCheck,
  RefreshCw,
  Mail,
  Fingerprint,
  CheckCircle2,
  XCircle,
  Eye,
  FileBadge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Staff {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  identifier: string;
  role: string;
  isApproved: boolean;
  createdAt: string;
  verificationIdBase64?: string;
  verificationLicenseBase64?: string;
}

export default function AdminStaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);
  const [isNightMode, setIsNightMode] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("clinical-night-mode") === "true";
    setIsNightMode(savedMode);
  }, []);

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/staff");
      if (!response.ok) throw new Error("Failed to sync staff registry");
      const data = await response.json();
      setStaff(data);
    } catch (error: any) {
      toast.error("Registry Sync Error", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleToggleApproval = async (userId: string, currentStatus: boolean) => {
    setIsProcessing(userId);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isApproved: !currentStatus }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      toast.success(currentStatus ? "Access Revoked" : "Doctor Authorized", {
        description: `${data.user.firstName} ${data.user.lastName} updated successfully.`
      });

      // Update local state
      setStaff(prev => prev.map(s => s._id === userId ? { ...s, isApproved: !currentStatus } : s));
    } catch (error: any) {
      toast.error("Operation Failed", { description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  const filteredStaff = staff.filter(s => 
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = staff.filter(s => !s.isApproved).length;

  return (
    <div className={`min-h-screen bg-background p-8 flex flex-col items-center relative overflow-hidden clinical-access ${isNightMode ? "night-mode" : ""}`}>
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] -z-10"></div>
      
      <div className="w-full max-w-6xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group mb-2 text-xs font-bold uppercase tracking-widest leading-none">
               <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
               Dashboard
            </Link>
            <h1 className="text-4xl font-bold tracking-tight text-gradient flex items-center gap-4">
              <ShieldCheck className="h-9 w-9 text-primary" />
              Staff Management
            </h1>
          </div>

          <div className="flex items-center gap-3">
             {pendingCount > 0 && (
               <div className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-2 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-accent"></div>
                  <span className="text-xs font-bold text-accent uppercase tracking-wider">{pendingCount} Verification Pending</span>
               </div>
             )}
             <Button variant="outline" className="rounded-xl border-white/10 glass" onClick={fetchStaff} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Sync
             </Button>
          </div>
        </div>

        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="Filter by Name, License, or Email..." 
            className="pl-12 h-14 bg-white/5 border-white/10 rounded-2xl focus:border-primary/50 transition-all shadow-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 glass rounded-3xl border-white/5 bg-white/5"></div>
            ))}
          </div>
        ) : filteredStaff.length > 0 ? (
          <div className="space-y-4">
            {filteredStaff.map(member => (
              <Card key={member._id} className={`glass border-white/5 hover:border-primary/20 transition-all duration-300 rounded-[2rem] overflow-hidden ${!member.isApproved ? "bg-accent/5 border-accent/10" : ""}`}>
                <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
                  <div className={`h-16 w-16 rounded-2xl flex-center font-bold text-xl relative ${member.isApproved ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
                    <Stethoscope className="h-8 w-8" />
                    {member.isApproved && <CheckCircle2 className="absolute -top-1 -right-1 h-5 w-5 fill-background" />}
                  </div>
                  
                  <div className="flex-1 text-center md:text-left space-y-1">
                    <div className="flex items-center justify-center md:justify-start gap-3">
                      <h3 className="text-xl font-bold tracking-tight">{member.firstName} {member.lastName}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${member.isApproved ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
                        {member.isApproved ? "Authorized" : "Awaiting Audit"}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {member.email}</div>
                      <div className="flex items-center gap-2 font-mono text-xs uppercase"><Fingerprint className="h-3.5 w-3.5" /> {member.identifier}</div>
                    </div>
                  </div>

                   <div className="flex items-center gap-3">
                    {!member.isApproved && member.verificationIdBase64 && (
                       <Button 
                        variant="secondary" 
                        className="h-12 px-6 rounded-xl font-bold flex items-center gap-2 border border-border"
                        onClick={() => setViewingStaff(member)}
                       >
                         <Eye className="h-4 w-4" /> Audit Docs
                       </Button>
                    )}
                    <Button 
                      variant={member.isApproved ? "outline" : "default"}
                      className={`min-w-[140px] h-12 rounded-xl font-bold transition-all ${
                        member.isApproved 
                          ? "border-border hover:border-red-500/50 hover:text-red-500" 
                          : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-none hover:scale-[1.02]"
                      }`}
                      onClick={() => handleToggleApproval(member._id, member.isApproved)}
                      disabled={isProcessing === member._id}
                    >
                      {isProcessing === member._id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : member.isApproved ? (
                        <><UserX className="h-4 w-4 mr-2" /> Revoke Access</>
                      ) : (
                        <><UserCheck className="h-4 w-4 mr-2" /> Verify Identity</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center glass rounded-[3rem] border-white/5 bg-white/5">
             <Stethoscope className="h-16 w-16 text-muted-foreground/10 mx-auto mb-4" />
             <h2 className="text-xl font-bold text-muted-foreground">Staff registry is empty</h2>
             <p className="text-sm text-muted-foreground/50">No medical professionals match your current query.</p>
          </div>
        )}
      </div>

      {/* Verification Modal */}
      <Dialog open={!!viewingStaff} onOpenChange={(open: boolean) => !open && setViewingStaff(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto clinical-access p-0 border-none rounded-[3rem] shadow-2xl">
          <div className="p-10 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tight italic flex items-center gap-4">
                <FileBadge className="h-8 w-8 text-primary" />
                Clinical Audit: {viewingStaff?.firstName} {viewingStaff?.lastName}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground font-medium">
                Review uploaded research-grade credentials before authorizing clinical access.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary/60 px-2">National Identity Card</h4>
                <div className="aspect-[3/2] rounded-[2rem] overflow-hidden border border-border bg-secondary flex-center">
                  <img src={viewingStaff?.verificationIdBase64} alt="ID" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary/60 px-2">Medical Practice License</h4>
                <div className="aspect-[3/2] rounded-[2rem] overflow-hidden border border-border bg-secondary flex-center">
                  <img src={viewingStaff?.verificationLicenseBase64} alt="License" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button 
                className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-black text-lg shadow-xl shadow-primary/20"
                onClick={() => {
                  if (viewingStaff) handleToggleApproval(viewingStaff._id, false);
                  setViewingStaff(null);
                }}
              >
                Approve & Authorize Practitioner
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
