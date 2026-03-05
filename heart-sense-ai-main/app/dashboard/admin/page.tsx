"use client";

import Link from "next/link";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Stethoscope,
  ChevronRight,
  ArrowRight,
  Unlock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardHeader } from "@/components/ui/DashboardHeader";

export default function AdminDashboard() {
  return (
    <>
      <DashboardHeader
        title="Administrative Control Tower"
        badge="Level 4 Access"
        badgeVariant="accent"
        stats={{ label: "RESEARCH ADMIN", value: "SECURED TERMINAL" }}
        icon={<ShieldCheck className="h-8 w-8" />}
      />

      <div className="p-12 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: <Stethoscope className="h-7 w-7" />,
              title: "Enroll Doctor",
              desc: "Authorize new clinical practitioners.",
              link: "/dashboard/admin/register-staff?role=doctor",
              color: "text-accent",
              theme: "bg-accent/10 hover:border-accent/50"
            },
            {
              icon: <ShieldCheck className="h-7 w-7" />,
              title: "System Admin",
              desc: "Grant administrative privileges.",
              link: "/dashboard/admin/register-staff?role=admin",
              color: "text-foreground",
              theme: "bg-white/5 hover:border-white/30"
            },
            {
              icon: <Unlock className="h-7 w-7" />,
              title: "Authorizations",
              desc: "Review clinical access requests.",
              link: "/dashboard/admin/access-requests",
              color: "text-primary",
              theme: "bg-primary/10 hover:border-primary/50"
            }
          ].map((action, i) => (
            <Card key={i} className={`glass border-border/40 overflow-hidden group transition-all p-2 rounded-[3rem] ${action.theme} futuristic-glow shadow-sm`}>
              <CardHeader className="pb-6 pt-10 px-8">
                <div className={`h-16 w-16 rounded-2xl bg-background/50 flex-center mb-6 ${action.color} shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                  {action.icon}
                </div>
                <CardTitle className="text-2xl font-black tracking-tight group-hover:text-glow transition-all">{action.title}</CardTitle>
                <CardDescription className="text-sm font-medium leading-relaxed opacity-80">{action.desc}</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                <Button asChild className={`w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${action.color} bg-background/40 hover:bg-background/80 border-none`}>
                  <Link href={action.link} className="flex items-center justify-between px-6">
                    <span>EXECUTE</span> <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-10">
          <header className="flex items-center justify-between">
            <h2 className="text-4xl font-black tracking-tight leading-none group cursor-pointer">
              Registry <span className="text-gradient">Highlights</span>
            </h2>
            <Button asChild variant="ghost" className="text-primary gap-3 font-black text-xs uppercase tracking-[0.2em] px-8 rounded-full h-14 hover:bg-primary/5">
              <Link href="/dashboard/admin/patients" className="flex items-center">
                EXPLORE FULL RECORD <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </header>

          <Card className="glass border-border/30 rounded-[4rem] p-4 futuristic-glow">
            <div className="p-24 text-center space-y-8 bg-background/20 rounded-[3.5rem] border border-dashed border-primary/20">
              <div className="h-24 w-24 rounded-[2rem] bg-primary/5 flex-center mx-auto text-primary/30">
                <Users className="h-12 w-12" />
              </div>
              <div className="space-y-3">
                <p className="text-2xl font-black text-foreground tracking-tight italic opacity-40 uppercase">Registry Synchronization Offline</p>
                <p className="text-muted-foreground font-medium max-w-md mx-auto">Click below to establish a real-time data tunnel with the clinical research database.</p>
              </div>
              <Button variant="outline" className="h-16 px-12 rounded-full border-primary/30 font-black text-base hover:bg-primary/10 transition-all text-primary" asChild>
                <Link href="/dashboard/admin/patients">INITIALIZE DATA TUNNEL</Link>
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </>

  );
}
