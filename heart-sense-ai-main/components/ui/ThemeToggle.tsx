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
      <div className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/10 animate-pulse" />
    );
  }

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/20 text-primary hover:bg-primary/10 hover:text-primary transition-all duration-500 shadow-xl group relative overflow-hidden futuristic-glow"
      title={isDark ? "Activate Solar Spectrum" : "Engage Deep Cosmic Mode"}
    >
      <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {isDark ? (
        <Sun className="h-6 w-6 transition-all duration-700 rotate-0 scale-100 group-hover:rotate-[15deg] group-hover:scale-110" />
      ) : (
        <Moon className="h-6 w-6 transition-all duration-700 rotate-0 scale-100 group-hover:rotate-[-15deg] group-hover:scale-110" />
      )}
      
      <span className="sr-only">Toggle Theme</span>
    </Button>
  );
}
