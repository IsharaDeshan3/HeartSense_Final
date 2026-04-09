"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-11 w-11 rounded-xl bg-muted border border-border/60 animate-pulse" />
    );
  }

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-11 w-11 rounded-xl border border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      title={isDark ? "Activate Solar Spectrum" : "Engage Deep Cosmic Mode"}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}

      <span className="sr-only">Toggle Theme</span>
    </Button>
  );
}
