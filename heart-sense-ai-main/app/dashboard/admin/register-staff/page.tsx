"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Stethoscope, 
  ShieldCheck, 
  UserPlus, 
  Mail, 
  Lock, 
  Fingerprint 
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Suspense } from "react";

function RegisterStaffContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roleFromUrl = searchParams.get("role") as "doctor" | "admin" || "doctor";
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    identifier: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/register-on-behalf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          role: roleFromUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      toast.success("Staff Enrolled", {
        description: `Successfully registered ${formData.firstName} as ${roleFromUrl}.`,
      });
      router.push("/dashboard/admin");
    } catch (error: any) {
      toast.error("Enrollment Failed", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8 flex-center flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.7_0.15_180/0.05)_0%,transparent_80%)] -z-10"></div>
      
      <div className="w-full max-w-xl space-y-8">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group">
           <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
           <span className="text-sm font-medium">Return to Dashboard</span>
        </Link>

        <Card className="glass border-white/10 shadow-2xl rounded-[2.5rem] overflow-hidden">
          <div className={`h-2 w-full bg-primary ${roleFromUrl === "admin" ? "bg-white/20" : "bg-primary/50"}`}></div>
          
          <CardHeader className="text-center pt-10">
            <div className={`mx-auto p-4 rounded-2xl w-fit mb-4 ${roleFromUrl === "admin" ? "bg-white/5 text-white" : "bg-primary/10 text-primary"}`}>
              {roleFromUrl === "admin" ? <ShieldCheck className="h-8 w-8" /> : <Stethoscope className="h-8 w-8" />}
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              Enroll New {roleFromUrl.charAt(0).toUpperCase() + roleFromUrl.slice(1)}
            </CardTitle>
            <CardDescription>
              Authorize internal access for a medical professional or administrator.
            </CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-6 px-10 pb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">First Name</Label>
                  <Input id="firstName" placeholder="Aruna" required value={formData.firstName} onChange={handleChange} className="bg-white/5 border-white/10 h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Last Name</Label>
                  <Input id="lastName" placeholder="Perera" required value={formData.lastName} onChange={handleChange} className="bg-white/5 border-white/10 h-12 rounded-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Work Email Binding</Label>
                <div className="relative">
                  <Input id="email" type="email" placeholder="dr.aruna@hospital.lk" required value={formData.email} onChange={handleChange} className="bg-white/5 border-white/10 h-12 pl-12 rounded-xl" />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">
                  {roleFromUrl === "doctor" ? "SLMC License Number" : "HS-Staff Identifier"}
                </Label>
                <div className="relative">
                  <Input id="identifier" placeholder={roleFromUrl === "doctor" ? "SLMC-12345" : "HS-ADMIN-00X"} required value={formData.identifier} onChange={handleChange} className="bg-white/5 border-white/10 h-12 pl-12 rounded-xl" />
                  <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Initial Temporary Access Key</Label>
                <div className="relative">
                  <Input id="password" type="password" required value={formData.password} onChange={handleChange} className="bg-white/5 border-white/10 h-12 pl-12 rounded-xl" />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>

            <CardFooter className="px-10 pb-10">
              <Button className="w-full h-16 rounded-2xl text-lg font-bold bg-primary text-primary-foreground glow-primary border-none flex items-center justify-center gap-3 transition-all hover:scale-[1.02]" type="submit" disabled={isLoading}>
                {isLoading ? "Synchronizing Professional Profile..." : (
                  <>
                    Confirm Enrollment
                    <UserPlus className="h-6 w-6" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterStaffPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex-center bg-background text-primary animate-pulse">Initializing Security Protocol...</div>}>
      <RegisterStaffContent />
    </Suspense>
  );
}
