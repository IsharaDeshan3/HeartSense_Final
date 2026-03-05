"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  HeartPulse, 
  Clock, 
  ShieldCheck, 
  LogOut, 
  UserCheck, 
  FileText,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function WaitingDashboard() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      toast.success("Signed out successfully");
    } catch (error) {
      toast.error("Logout failed");
    }
  };

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      
      if (data.isApproved) {
        toast.success("Identity Authorized", {
          description: "Welcome to the neural workspace, Doctor.",
        });
        router.push("/dashboard/doctor");
      } else {
        toast.info("Audit Still Pending", {
          description: "Administrative verification is still in progress.",
        });
      }
    } catch (error) {
      toast.error("Sync Error", {
        description: "Failed to connect to the neural network.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex-center flex-col p-6 relative overflow-hidden">
      {/* Bioluminescent Background Ambience */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-2xl text-center space-y-8">
        <div className="flex-center flex-col gap-4">
          <div className="relative">
            <div className="h-24 w-24 rounded-3xl bg-primary/10 flex-center text-primary glow-primary animate-pulse">
              <Clock className="h-12 w-12" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-background border border-primary/20 flex-center text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gradient">Verification In Progress</h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto leading-relaxed">
            Your professional identity is currently being verified by the High-Level Administrative Council.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
          {[
            { 
              icon: <FileText className="h-5 w-5" />, 
              title: "Step 1", 
              desc: "License Verification",
              status: "Complete" 
            },
            { 
              icon: <ShieldCheck className="h-5 w-5" />, 
              title: "Step 2", 
              desc: "Security Audit",
              status: "In Progress" 
            },
            { 
              icon: <UserCheck className="h-5 w-5" />, 
              title: "Step 3", 
              desc: "Council Approval",
              status: "Pending" 
            }
          ].map((step, i) => (
            <div key={i} className="glass p-6 rounded-2xl border-white/5 space-y-3 relative overflow-hidden group">
               <div className="h-10 w-10 rounded-xl bg-white/5 flex-center text-primary mb-2 mx-auto">
                  {step.icon}
               </div>
               <h3 className="font-bold text-sm tracking-widest uppercase opacity-50">{step.title}</h3>
               <p className="font-medium text-sm">{step.desc}</p>
               <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit mx-auto ${
                 step.status === "Complete" ? "bg-primary/20 text-primary" : 
                 step.status === "In Progress" ? "bg-accent/20 text-accent animate-pulse" : 
                 "bg-white/5 text-muted-foreground"
               }`}>
                 {step.status}
               </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          <Button 
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg glow-primary border-none hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            onClick={checkStatus}
            disabled={isLoading}
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Synchronizing Status..." : "Check Verification Status"}
          </Button>
          
          <Button 
            variant="ghost" 
            className="w-full h-12 rounded-xl text-muted-foreground hover:text-white gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            Sign Out from Neural Network
          </Button>
        </div>

        <footer className="pt-12">
          <p className="text-[10px] text-muted-foreground font-bold tracking-[0.3em] uppercase opacity-40">
            Sri Lankan Research Grade Clinical Security Standard
          </p>
        </footer>
      </div>
    </div>
  );
}
