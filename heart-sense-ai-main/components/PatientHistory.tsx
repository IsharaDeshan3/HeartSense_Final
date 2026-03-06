"use client";

import { useState } from "react";
import {
  Clock,
  Activity,
  Microscope,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  PatientDiagnosisRecord,
  PatientHistorySummary,
} from "@/services/WorkflowService";

// ─── Types ────────────────────────────────────────────────────────────

interface PatientInfo {
  _id: string;
  fullName: string;
  patientId: string;
  age?: number;
  gender?: string;
  email?: string;
  phone?: string;
}

interface LabHistoryEntry {
  _id: string;
  testDate?: string;
  labComparison?: Array<{
    test: string;
    actualValue: string | number;
    normalRange: string;
    status: string;
  }>;
  extractedJsonGroup1?: Record<string, unknown>;
  extractedJsonGroup2?: Record<string, unknown>;
}

interface PatientHistoryProps {
  patient: PatientInfo;
  diagnosisHistory: PatientDiagnosisRecord[];
  historySummary?: PatientHistorySummary | null;
  labHistory: LabHistoryEntry[];
  isLoading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown date";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function extractSymptomsSummary(symptomsJson: Record<string, unknown> | null): string {
  if (!symptomsJson) return "No symptoms recorded";
  const text = symptomsJson.text as string | undefined;
  if (text) return text.length > 200 ? text.slice(0, 200) + "…" : text;
  const chief = symptomsJson.chief_complaint as string | undefined;
  if (chief) return chief;
  return "Symptoms data available";
}

function extractEcgSummary(ecgJson: Record<string, unknown> | null): string {
  if (!ecgJson) return "Not performed";
  const status = ecgJson.status as string | undefined;
  if (status === "skipped") return "Skipped";
  const parts: string[] = [];
  if (ecgJson.rhythm) parts.push(`Rhythm: ${ecgJson.rhythm}`);
  if (ecgJson.heart_rate) parts.push(`HR: ${ecgJson.heart_rate} bpm`);
  if (ecgJson.interpretation) parts.push(String(ecgJson.interpretation));
  return parts.length > 0 ? parts.join(" • ") : "ECG data available";
}

function extractLabSummary(labsJson: Record<string, unknown> | null): string {
  if (!labsJson) return "Not performed";
  const status = labsJson.status as string | undefined;
  if (status === "skipped") return "Skipped";
  const parts: string[] = [];
  for (const key of ["troponin", "ldh", "bnp", "creatinine", "hemoglobin"]) {
    const val = labsJson[key];
    if (val !== null && val !== undefined) {
      parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}`);
    }
  }
  return parts.length > 0 ? parts.join(" • ") : "Lab data available";
}

// ─── Component ────────────────────────────────────────────────────────

export default function PatientHistory({
  patient,
  diagnosisHistory,
  historySummary,
  labHistory,
  isLoading = false,
}: PatientHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLabId, setExpandedLabId] = useState<string | null>(null);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));
  const toggleLabExpand = (id: string) =>
    setExpandedLabId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-8">
      {/* ─── Patient Info Card ─────────────────────────────────── */}
      <Card className="glass border-border/30 rounded-[2rem] overflow-hidden">
        <CardContent className="p-8">
          <div className="flex items-center gap-6">
            <div className="h-16 w-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center text-primary font-black text-2xl border border-primary/20">
              {patient.fullName?.charAt(0) || "?"}
            </div>
            <div className="space-y-1 flex-1">
              <h2 className="text-2xl font-black tracking-tight">
                {patient.fullName}
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {patient.patientId}
              </p>
              <div className="flex gap-4 mt-2">
                {patient.age && (
                  <Badge variant="outline" className="text-xs">
                    {patient.age} years
                  </Badge>
                )}
                {patient.gender && (
                  <Badge variant="outline" className="text-xs">
                    {patient.gender}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-border/30 rounded-[2rem] overflow-hidden">
        <CardContent className="p-8 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-muted-foreground">
                Longitudinal Summary
              </p>
              <h3 className="text-lg font-black tracking-tight mt-2">
                Prior AI history for KRA reasoning
              </h3>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {historySummary?.visit_count ?? diagnosisHistory.length} visit{(historySummary?.visit_count ?? diagnosisHistory.length) !== 1 ? "s" : ""}
            </Badge>
          </div>

          <div className="rounded-2xl border border-border/20 bg-white/[0.02] p-5">
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {historySummary?.summary_text || "No prior AI diagnosis or lab history available."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/20 bg-white/[0.02] p-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Top Prior Conditions
              </p>
              <div className="flex flex-wrap gap-2">
                {(historySummary?.top_conditions?.length ? historySummary.top_conditions : ["No recurrent conditions captured yet"]).map((condition) => (
                  <Badge key={condition} variant="outline" className="text-[10px]">
                    {condition}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/20 bg-white/[0.02] p-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Key Prior Lab Findings
              </p>
              <div className="flex flex-wrap gap-2">
                {(historySummary?.key_lab_findings?.length ? historySummary.key_lab_findings : ["No persistent lab abnormalities captured yet"]).map((finding) => (
                  <Badge key={finding} variant="outline" className="text-[10px]">
                    {finding}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Diagnosis History Timeline ───────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <BrainCircuit className="h-4 w-4" />
          Diagnosis History
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {diagnosisHistory.length} record{diagnosisHistory.length !== 1 ? "s" : ""}
          </Badge>
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : diagnosisHistory.length === 0 ? (
          <Card className="glass border-border/20 border-dashed rounded-[2rem]">
            <CardContent className="p-12 text-center">
              <div className="h-16 w-16 rounded-[1.25rem] bg-muted/10 flex items-center justify-center mx-auto mb-4">
                <Stethoscope className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h4 className="text-lg font-bold text-muted-foreground mb-2">
                No Previous Diagnoses
              </h4>
              <p className="text-sm text-muted-foreground/60">
                This patient has no AI diagnostic records yet. Start a new
                diagnosis to begin building their clinical history.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {diagnosisHistory.map((record) => (
              <Card
                key={record.payload_id}
                className="glass border-border/20 rounded-[1.5rem] overflow-hidden hover:border-primary/30 transition-all"
              >
                <CardContent className="p-0">
                  {/* Summary Row (always visible) */}
                  <button
                    onClick={() => toggleExpand(record.payload_id)}
                    className="w-full flex items-center gap-4 p-6 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-bold">
                          {formatDate(record.created_at)}
                        </span>
                        <Badge
                          className={
                            record.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]"
                              : record.status === "processing"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px]"
                                : "bg-muted/10 text-muted-foreground border-muted/20 text-[9px]"
                          }
                        >
                          {record.status || "unknown"}
                        </Badge>
                        {record.experience_level && (
                          <Badge variant="outline" className="text-[9px]">
                            {record.experience_level}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {extractSymptomsSummary(record.symptoms_json)}
                      </p>
                    </div>
                    {expandedId === record.payload_id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Expanded Details */}
                  {expandedId === record.payload_id && (
                    <div className="border-t border-border/10 p-6 space-y-4 bg-white/[0.01]">
                      {/* Symptoms */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          <FileText className="h-3.5 w-3.5" />
                          Symptoms
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                          {extractSymptomsSummary(record.symptoms_json)}
                        </p>
                      </div>

                      {/* ECG Summary */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          <Activity className="h-3.5 w-3.5" />
                          ECG
                        </div>
                        <p className="text-sm text-foreground/80">
                          {extractEcgSummary(record.ecg_json)}
                        </p>
                      </div>

                      {/* Lab Summary */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          <Microscope className="h-3.5 w-3.5" />
                          Lab Results
                        </div>
                        <p className="text-sm text-foreground/80">
                          {extractLabSummary(record.labs_json)}
                        </p>
                      </div>

                      {/* Diagnosis Result */}
                      {record.refined_output && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            <BrainCircuit className="h-3.5 w-3.5" />
                            AI Diagnosis
                          </div>
                          <div className="rounded-xl border border-border/20 bg-white/[0.02] p-4">
                            <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans">
                              {record.refined_output}
                            </pre>
                          </div>
                          {record.disclaimer && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                              <p className="text-[10px] text-amber-400/80 leading-relaxed">
                                {record.disclaimer}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── Lab Test History ──────────────────────────────────── */}
      {labHistory.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
            <Microscope className="h-4 w-4" />
            Lab Test History
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {labHistory.length} test{labHistory.length !== 1 ? "s" : ""}
            </Badge>
          </h3>

          <div className="space-y-3">
            {labHistory.map((lab) => (
              <Card
                key={lab._id}
                className="glass border-border/20 rounded-[1.5rem] overflow-hidden"
              >
                <CardContent className="p-0">
                  <button
                    onClick={() => toggleLabExpand(lab._id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Microscope className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold">
                        {lab.testDate ? formatDate(lab.testDate) : "Lab Test"}
                      </span>
                      {lab.labComparison && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lab.labComparison.length} markers tested
                        </p>
                      )}
                    </div>
                    {expandedLabId === lab._id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {expandedLabId === lab._id && lab.labComparison && (
                    <div className="border-t border-border/10 p-5 bg-white/[0.01]">
                      <div className="grid gap-2">
                        {lab.labComparison.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
                          >
                            <span className="text-xs font-bold">
                              {item.test}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {item.actualValue} ({item.normalRange})
                              </span>
                              <Badge
                                className={
                                  item.status === "Normal"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20 text-[9px]"
                                }
                              >
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
