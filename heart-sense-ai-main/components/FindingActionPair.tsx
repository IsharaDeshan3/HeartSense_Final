"use client";

import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface FindingActionPairProps {
  finding: string;
  recommendation: string;
  severity?: "critical" | "severe" | "moderate" | "mild";
  index?: number;
}

/**
 * Displays a waveform abnormality paired with its clinical action/recommendation.
 * Each pair shows the finding with a severity-colored left border,
 * followed by the related recommendation below.
 */
export function FindingActionPair({
  finding,
  recommendation,
  severity = "moderate",
  index = 0,
}: FindingActionPairProps) {
  const getSeverityColor = () => {
    switch (severity.toLowerCase()) {
      case "critical":
      case "severe":
        return {
          border: "border-l-4 border-destructive",
          bg: "bg-destructive/5",
          icon: "text-destructive",
          label: "bg-destructive/10 text-destructive",
        };
      case "moderate":
        return {
          border: "border-l-4 border-orange-500",
          bg: "bg-orange-500/5",
          icon: "text-orange-500",
          label: "bg-orange-500/10 text-orange-500",
        };
      case "mild":
        return {
          border: "border-l-4 border-yellow-500",
          bg: "bg-yellow-500/5",
          icon: "text-yellow-500",
          label: "bg-yellow-500/10 text-yellow-500",
        };
      default:
        return {
          border: "border-l-4 border-blue-500",
          bg: "bg-blue-500/5",
          icon: "text-blue-500",
          label: "bg-blue-500/10 text-blue-500",
        };
    }
  };

  const colors = getSeverityColor();

  return (
    <div
      className="space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Finding Card */}
      <Card
        className={`${colors.border} ${colors.bg} border border-white/10 rounded-2xl shadow-sm`}
      >
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div
              className={`h-8 w-8 rounded-lg ${colors.label} flex items-center justify-center shrink-0 mt-1`}
            >
              <AlertCircle className={`h-4 w-4 ${colors.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base lg:text-lg font-bold text-foreground leading-snug">
                {finding}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Arrow connector */}
      <div className="flex justify-center py-1">
        <ArrowRight className="h-5 w-5 text-muted-foreground/40 rotate-90" />
      </div>

      {/* Recommendation Card */}
      <Card className="border-l-4 border-green-500 bg-green-500/5 border-t border-green-500/20 rounded-2xl shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center shrink-0 mt-1">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base lg:text-lg font-semibold text-foreground/85 leading-snug">
                {recommendation}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
