"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HeartPulse,
  ShieldCheck,
  ArrowRight,
  Dna,
  Lock,
  UserRound,
  Mail,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
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

  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

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
    <div className="min-h-screen grid place-items-center bg-background selection:bg-primary/20 relative overflow-hidden p-4 md:p-6">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-44 right-0 h-136 w-xl rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-100 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-4xl border border-border/70 bg-card/80 backdrop-blur-xl shadow-2xl lg:grid-cols-[1.05fr_0.95fr]"
      >
        <motion.section
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex flex-col justify-between border-r border-border/60 bg-linear-to-br from-primary/8 via-background to-accent/8 p-10"
        >
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-3 text-foreground"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                <HeartPulse className="h-5 w-5" />
              </span>
              <span className="text-xl font-semibold tracking-tight">
                HeartSense AI
              </span>
            </Link>

            <div className="mt-16 space-y-6">
              <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">
                Clinician Registration
              </p>
              <h2 className="text-4xl font-semibold leading-tight text-foreground">
                Create your professional identity for pilot access
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground max-w-lg">
                Join the HeartSense research ecosystem with verified clinical
                credentials and gain staged access to doctor-facing diagnostic
                tools.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: "Credential-aware onboarding" },
              { icon: BadgeCheck, text: "Verification-first access control" },
              { icon: Dna, text: "Research-grade clinical platform" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3"
              >
                <item.icon className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground/90">{item.text}</span>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="p-6 sm:p-8 lg:p-10"
        >
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-foreground"
              >
                <HeartPulse className="h-7 w-7 text-primary" />
                <span className="text-lg font-semibold">HeartSense AI</span>
              </Link>
            </div>

            <header className="mb-8 space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">
                Professional Sign Up
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Clinician registration
              </h1>
              <p className="text-sm text-muted-foreground">
                Set up your account to request pilot workspace access.
              </p>
            </header>

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="firstName"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    First Name
                  </Label>
                  <div className="relative">
                    <Input
                      id="firstName"
                      placeholder="John"
                      required
                      value={formData.firstName}
                      onChange={handleChange}
                      className="h-11 rounded-xl border-border/80 bg-background/80 pl-10"
                    />
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="lastName"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="h-11 rounded-xl border-border/80 bg-background/80"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Work Email
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@hospital.lk"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="h-11 rounded-xl border-border/80 bg-background/80 pl-10"
                  />
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="identifier"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  SLMC License Number
                </Label>
                <Input
                  id="identifier"
                  placeholder="SLMC-XXXXX"
                  required
                  value={formData.identifier}
                  onChange={handleChange}
                  className="h-11 rounded-xl border-border/80 bg-background/80"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="h-11 rounded-xl border-border/80 bg-background/80 pl-10"
                    />
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Confirm
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="h-11 rounded-xl border-border/80 bg-background/80 pl-10"
                    />
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>

              <Button
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg transition-all hover:opacity-95"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  "Creating Profile..."
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Create Clinician Profile
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <p className="pt-1 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-primary hover:text-accent"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}
