"use client";

import { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface DashboardHeaderProps {
  title: string;
  badge?: string;
  badgeVariant?: "primary" | "accent";
  stats?: {
    label: string;
    value: string;
  };
  icon?: ReactNode;
  children?: ReactNode;
}

export function DashboardHeader({
  title,
  badge,
  badgeVariant = "primary",
  stats,
  icon,
  children
}: DashboardHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out successfully");
      router.push("/");
    } catch {
      toast.error("Logout failed");
    }
  };

  const badgeColors = {
    primary: "bg-primary/10 border-primary/30 text-primary",
    accent: "bg-accent/10 border-accent/30 text-accent",
  };

  return (
    <header className="h-24 border-b border-border/40 flex items-center justify-between px-12 glass z-10 shrink-0">
      <div className="flex items-center gap-6">
        <h1 className="text-3xl font-black tracking-tight leading-none whitespace-nowrap">{title}</h1>
        {badge && (
          <div className={`px-4 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-[0.2em] shadow-sm ${badgeColors[badgeVariant]}`}>
            {badge}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {children}

        {/* Logout Button — red with glow on hover */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-12 w-12 rounded-2xl text-red-500 border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] group relative overflow-hidden"
          title="Sign Out"
        >
          <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <LogOut className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          <span className="sr-only">Sign Out</span>
        </Button>

        <ThemeToggle />

        {stats && (
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-primary tracking-[0.2em] uppercase mb-1">{stats.label}</p>
            <p className="text-[11px] text-muted-foreground font-bold">{stats.value}</p>
          </div>
        )}
        {icon && (
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/30 flex-center text-primary futuristic-glow shrink-0">
            {icon}
          </div>
        )}
      </div>
    </header>
  );
}
