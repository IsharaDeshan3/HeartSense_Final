"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartPulse, ArrowRight, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      toast.success("Authentication Successful", {
        description: `Welcome back to HeartSense AI.`,
      });
      
      if (data.user.role === "admin") {
        router.push("/dashboard/admin");
      } else if (data.user.isApproved) {
        router.push("/dashboard/doctor");
      } else {
        router.push("/dashboard/doctor/waiting");
      }
    } catch (error: any) {
      toast.error("Authentication Error", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6 relative selection:bg-primary/20 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vw] h-[100vh] bg-[radial-gradient(circle_at_center,oklch(0.7_0.15_190/0.05)_0%,transparent_70%)] opacity-50"></div>
      </div>

      <div className="w-full max-w-md flex flex-col gap-6 relative">
        <Link href="/" className="flex items-center gap-2 self-center mb-4 group transition-all duration-300">
           <HeartPulse className="h-10 w-10 text-primary group-hover:scale-110 transition-transform" />
           <span className="text-2xl font-bold tracking-tight text-gradient">HEARTSENSE AI</span>
        </Link>
        
        <div className="glass p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative bg-card/10 overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 blur-2xl bg-primary rounded-full"></div>
          
          <header className="mb-8 text-center">
             <h1 className="text-3xl font-bold mb-2 tracking-tight">Professional Login</h1>
             <p className="text-muted-foreground text-sm">Enter your credentials to access the workspace.</p>
          </header>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Work Email</Label>
                <div className="relative">
                  <Input id="email" type="email" placeholder="name@hospital.lk" required value={formData.email} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-12 pl-12 focus:border-primary/50 transition-all" />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Secret Key</Label>
                <div className="relative">
                  <Input id="password" type="password" required value={formData.password} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-12 pl-12 focus:border-primary/50 transition-all" />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </div>

            <Button className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg glow-primary border-none hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group mt-2" type="submit" disabled={isLoading}>
              {isLoading ? "Validating Session..." : (
                <>
                  Connect to Workspace <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>

            <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
               <p>New to the ecosystem? <Link href="/register" className="text-primary hover:text-accent transition-colors font-bold">Register Profile</Link></p>
            </div>
          </form>
        </div>
        
        <footer className="text-center">
           <p className="text-[10px] text-muted-foreground font-bold tracking-[0.2em] uppercase opacity-50">Sri Lankan Clinical Grade Security</p>
        </footer>
      </div>
    </div>
  );
}
