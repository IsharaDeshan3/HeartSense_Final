"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Trash2, UserRound } from "lucide-react";
import { useMemo, useState, type KeyboardEventHandler } from "react";
import {
  getLatestDiagnosisText,
  getPatientSeverity,
  getSeverityClasses,
  type DoctorPatientRecord,
} from "@/components/doctor/patientSeverity";

export type DoctorPatientCardData = DoctorPatientRecord;

interface PatientCardProps {
  patient: DoctorPatientCardData;
  onOpen: (patientId: string) => void;
  onRequestDelete?: (patientId: string) => void;
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0] ?? "?").slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function formatRecentTime(value?: string) {
  if (!value) return "Recent activity unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent activity unavailable";

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) {
    return `Updated ${Math.max(1, diffHours)}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays}d ago`;
}

function getTags(patient: DoctorPatientCardData) {
  const symptoms = patient.medicalData?.symptoms ?? [];
  const risks = patient.medicalData?.riskFactors ?? [];
  return [...symptoms, ...risks].filter(Boolean).slice(0, 3);
}

function resolvePatientImage(patient: DoctorPatientCardData) {
  return (
    patient.profileImage?.trim() ||
    patient.imageUrl?.trim() ||
    patient.avatarUrl?.trim() ||
    ""
  );
}

export function PatientCard({
  patient,
  onOpen,
  onRequestDelete,
}: PatientCardProps) {
  const tags = getTags(patient);
  const diagnosisSummary = getLatestDiagnosisText(patient);
  const severity = getPatientSeverity(patient);
  const severityStyles = getSeverityClasses(severity);
  const genderLabel = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : "Unknown";
  const resolvedImage = useMemo(() => resolvePatientImage(patient), [patient]);
  const [hasImageError, setHasImageError] = useState(false);

  const handleOpen = () => {
    onOpen(patient._id);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <Card
      className={`glass py-0 gap-0 transition-all duration-300 group rounded-4xl overflow-hidden hover:shadow-2xl relative ${severityStyles.border}`}
    >
      <CardContent
        className="p-0 cursor-pointer focus-visible:outline-none"
        role="button"
        tabIndex={0}
        aria-label={`Open patient record for ${patient.fullName}`}
        onKeyDown={handleKeyDown}
        onClick={handleOpen}
      >
        <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
          <div className="opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-all duration-200 pointer-events-auto">
            <Button
              type="button"
              className="h-11 rounded-full px-6 bg-background/90 border border-border/50 text-foreground hover:bg-background"
              onClick={(event) => {
                event.stopPropagation();
                handleOpen();
              }}
            >
              Open Patient
            </Button>
          </div>
        </div>

        <div className="flex items-stretch">
          <div className="basis-1/4 min-w-24 max-w-36 shrink-0">
            <div className="h-full min-h-40 rounded-l-4xl rounded-r-none overflow-hidden border-r border-border/35 bg-primary/10">
              {resolvedImage && !hasImageError ? (
                <img
                  src={resolvedImage}
                  alt={`${patient.fullName} profile`}
                  className="h-full w-full object-cover"
                  onError={() => setHasImageError(true)}
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-primary">
                  <UserRound className="h-7 w-7 opacity-70" />
                  <span className="text-xs font-black uppercase tracking-wide opacity-80">
                    {getInitials(patient.fullName)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div>
                  <h3 className="text-base md:text-lg font-black tracking-tight text-foreground truncate">
                    {patient.fullName}
                  </h3>
                  <p className="text-xs text-foreground/75 font-mono uppercase tracking-wide truncate">
                    {patient.patientId}
                  </p>
                </div>

                <div className="text-xs text-foreground/75 font-semibold tracking-wide">
                  {patient.age ? `${patient.age} yrs` : "Age N/A"} •{" "}
                  {genderLabel}
                </div>
              </div>

              <span
                className={`text-xs uppercase tracking-wide px-2.5 py-1 rounded-full border font-black ${severityStyles.badge}`}
              >
                {severityStyles.label}
              </span>
            </div>

            <div
              className="mt-3 flex items-center justify-end gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              {onRequestDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                  title="Remove patient"
                  onClick={() => onRequestDelete(patient._id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove patient</span>
                </Button>
              )}

              <div className="h-9 w-9 rounded-full border border-border/50 bg-background/70 flex-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p
                className="text-sm text-foreground/75 truncate"
                title={diagnosisSummary}
              >
                Last diagnosis:{" "}
                <span className="text-foreground/90">{diagnosisSummary}</span>
              </p>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2">
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs uppercase tracking-wide px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs uppercase tracking-wide px-2.5 py-1 rounded-full border border-border/40 bg-muted/30 text-foreground/70">
                      No risk tags
                    </span>
                  )}
                </div>

                <span className="text-xs uppercase tracking-wide text-foreground/70 font-semibold">
                  {formatRecentTime(patient.updatedAt)}
                </span>
              </div>
            </div>

            <div className="mt-4 md:hidden flex justify-end">
              <Button
                type="button"
                size="sm"
                className="rounded-full px-4"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpen();
                }}
              >
                Open
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
