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
  ArrowRight,
  Lock,
  Mail,
  ShieldCheck,
  Activity,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

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
    <div className="min-h-screen grid place-items-center bg-background selection:bg-primary/20 relative overflow-hidden p-4 md:p-6">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-128 w-240 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-[24rem] rounded-full bg-accent/15 blur-3xl" />
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
          className="hidden lg:flex flex-col justify-between border-r border-border/60 bg-linear-to-br from-primary/8 via-background to-accent/7 p-10"
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
                Clinician Workspace Access
              </p>
              <h2 className="text-4xl font-semibold leading-tight text-foreground">
                Secure sign-in for modern cardiac decision support
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground max-w-lg">
                Access your clinical workspace with protected role-based
                routing, structured patient context, and explainable
                AI-supported pathways.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: "Role-based clinical access" },
              { icon: Activity, text: "Unified ECG and lab workflows" },
              { icon: Stethoscope, text: "Doctor-focused AI guidance" },
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
                Professional Sign In
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to continue to your clinical workspace.
              </p>
            </header>

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ml-1"
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
                    className="h-12 rounded-xl border-border/80 bg-background/80 pl-11"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ml-1"
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
                    className="h-12 rounded-xl border-border/80 bg-background/80 pl-11"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <Button
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg transition-all hover:opacity-95"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  "Validating Session..."
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Access Workspace
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <p className="pt-1 text-center text-sm text-muted-foreground">
                New to HeartSense?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-primary hover:text-accent"
                >
                  Create clinician account
                </Link>
              </p>
            </form>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}
