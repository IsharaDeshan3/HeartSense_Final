"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartPulse, UserCircle, BriefcaseMedical, ShieldCheck, ArrowRight, Dna, Lock } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const role = "doctor"; // Hardcoded for public route
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    identifier: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Password Mismatch", {
        description: "Please ensure both passwords are identical.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      toast.success("Identity Verified", {
        description: `Welcome to the HeartSense ecosystem, ${formData.firstName}.`,
      });
      
      // All public registered doctors go to waiting initially
      router.push("/dashboard/doctor/waiting");
    } catch (error: any) {
      toast.error("Registration Error", {
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

      <div className="w-full max-w-[1100px] grid lg:grid-cols-2 gap-0 overflow-hidden glass rounded-[2.5rem] shadow-2xl relative">
        {/* Left Side: Immersive Brand Info */}
        <div className="hidden lg:flex flex-col p-12 relative overflow-hidden bg-primary/5">
          <div className="absolute top-0 right-0 p-20 opacity-10 blur-3xl bg-primary rounded-full"></div>
          
          <Link href="/" className="relative z-10 flex items-center gap-2 mb-20 group">
             <HeartPulse className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
             <span className="text-xl font-bold tracking-tight text-gradient">HEARTSENSE AI</span>
          </Link>

          <div className="relative z-10">
            <h2 className="text-4xl font-bold leading-tight mb-6">Securing the future <br /> of <span className="text-primary">Human Hearts</span></h2>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              Integrate with an ethical AI collective designed to support clinical excellence and patient safety.
            </p>
            
            <div className="space-y-6">
               {[
                 { icon: <ShieldCheck />, text: "Regulatory Compliance" },
                 { icon: <Dna />, text: "Bioluminescent Optimization" },
                 { icon: <UserCircle />, text: "Professional Identity Verification" }
               ].map((item, i) => (
                 <div key={i} className="flex items-center gap-4 text-sm font-medium">
                   <div className="h-8 w-8 rounded-lg bg-primary/10 flex-center text-primary">{item.icon}</div>
                   {item.text}
                 </div>
               ))}
            </div>
          </div>

          <div className="mt-auto relative z-10 pt-10 border-t border-white/5">
             <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase mb-2">Sri Lankan Research Grade</p>
             <p className="text-xs text-muted-foreground">Approved for deployment in clinical environments 2026.</p>
          </div>
        </div>

        {/* Right Side: Centered Form */}
        <div className="p-8 md:p-12 flex flex-col justify-center relative bg-card/10">
          <div className="w-full max-w-md mx-auto">
            <header className="mb-8 text-center lg:text-left">
               <div className="lg:hidden flex justify-center mb-6">
                 <HeartPulse className="h-10 w-10 text-primary" />
               </div>
               <h1 className="text-3xl font-bold mb-2 tracking-tight">Clinician Registration</h1>
               <p className="text-muted-foreground text-sm">Create your professional profile to access diagnostic tools.</p>
            </header>

            <form onSubmit={onSubmit} className="space-y-5">

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">First Name</Label>
                    <Input id="firstName" placeholder="John" required value={formData.firstName} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-primary/50 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Last Name</Label>
                    <Input id="lastName" placeholder="Doe" required value={formData.lastName} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-primary/50 transition-all" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Work Email</Label>
                  <Input id="email" type="email" placeholder="name@hospital.lk" required value={formData.email} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-primary/50 transition-all" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="identifier" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    SLMC License Number
                  </Label>
                  <Input id="identifier" placeholder="SLMC-XXXXX" required value={formData.identifier} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-primary/50 transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</Label>
                    <div className="relative">
                      <Input id="password" type="password" required value={formData.password} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 pl-10 focus:border-primary/50 transition-all" />
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confirm</Label>
                    <div className="relative">
                      <Input id="confirmPassword" type="password" required value={formData.confirmPassword} onChange={handleChange} className="bg-white/5 border-white/10 rounded-xl h-11 pl-10 focus:border-primary/50 transition-all" />
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>

              <Button className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg glow-primary border-none hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group mt-2" type="submit" disabled={isLoading}>
                {isLoading ? "Synchronizing Identity..." : (
                  <>
                    Initialize Professional Profile <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already part of the ecosystem?{" "}
                <Link href="/login" className="text-primary hover:text-accent transition-colors font-bold">Sign in</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
