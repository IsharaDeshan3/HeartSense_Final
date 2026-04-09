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
  doctorName?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function DashboardHeader({
  title,
  badge,
  badgeVariant = "primary",
  stats,
  doctorName,
  icon,
  children,
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
    primary: "bg-primary/10 border-primary/20 text-primary",
    accent: "bg-accent/10 border-accent/20 text-accent",
  };

  return (
    <header className="h-24 border-b border-border/60 flex items-center justify-between px-8 md:px-12 bg-background/80 backdrop-blur-xl z-10 shrink-0">
      <div className="flex items-center gap-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-none whitespace-nowrap">
          {title}
        </h1>
        {badge && (
          <div
            className={`px-4 py-1.5 rounded-full border text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeColors[badgeVariant]}`}
          >
            {badge}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />

        {doctorName ? (
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-muted-foreground tracking-[0.18em] uppercase mb-1">
              Doctor
            </p>
            <p className="text-sm text-foreground font-medium">{doctorName}</p>
          </div>
        ) : (
          stats && (
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-muted-foreground tracking-[0.18em] uppercase mb-1">
                {stats.label}
              </p>
              <p className="text-sm text-foreground font-medium">
                {stats.value}
              </p>
            </div>
          )
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-11 w-11 rounded-xl text-muted-foreground border border-border/60 bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Sign Out"
        >
          <LogOut className="h-5 w-5" />
          <span className="sr-only">Sign Out</span>
        </Button>

        {children}

        {icon && (
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex-center text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
    </header>
  );
}
