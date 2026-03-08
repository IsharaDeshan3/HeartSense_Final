"use client"

import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle, AlertCircle, FlaskConical } from "lucide-react"
import { RiMicroscopeLine } from "@remixicon/react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  Age: string
  Gender: string
  BMI: string
  Chol: string
  TG: string
  HDL: string
  LDL: string
  Cr: string
  BUN: string
}

interface FormErrors {
  [key: string]: string
}

interface DiabeticModalProps {
  open: boolean
  onClose: () => void
  /** extractedJsonGroup1 from LabSuggester — pre-fills form when available */
  extractedData?: Record<string, any>
  onAutoResult?: (result: any) => void
}

// ─── Field config ─────────────────────────────────────────────────────────────

const NUMERIC_FIELDS: { key: keyof FormData; label: string; unit?: string }[] = [
  { key: "BMI",  label: "BMI",             unit: "kg/m²" },
  { key: "Chol", label: "Cholesterol",     unit: "mg/dL" },
  { key: "TG",   label: "Triglycerides",   unit: "mg/dL" },
  { key: "HDL",  label: "HDL Cholesterol", unit: "mg/dL" },
  { key: "LDL",  label: "LDL Cholesterol", unit: "mg/dL" },
  { key: "Cr",   label: "Creatinine",      unit: "mg/dL" },
  { key: "BUN",  label: "BUN",             unit: "mg/dL" },
]

const EMPTY_FORM: FormData = {
  Age: "", Gender: "", BMI: "", Chol: "",
  TG: "", HDL: "", LDL: "", Cr: "", BUN: "",
}

// ─── Helper: merge extracted data onto a form ────────────────────────────────

function applyExtracted(base: FormData, data?: Record<string, any>): FormData {
  if (!data) return base
  return {
    Age:    data.Age    != null ? String(data.Age)    : base.Age,
    Gender: data.Gender != null ? String(data.Gender) : base.Gender,
    BMI:    data.BMI    != null ? String(data.BMI)    : base.BMI,
    Chol:   data.Chol   != null ? String(data.Chol)   : base.Chol,
    TG:     data.TG     != null ? String(data.TG)     : base.TG,
    HDL:    data.HDL    != null ? String(data.HDL)    : base.HDL,
    LDL:    data.LDL    != null ? String(data.LDL)    : base.LDL,
    Cr:     data.Cr     != null ? String(data.Cr)     : base.Cr,
    BUN:    data.BUN    != null ? String(data.BUN)    : base.BUN,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiabeticModal({ open, onClose, extractedData, onAutoResult }: DiabeticModalProps) {
    // Conversion factors for mg/dL to mmol/L
    const conversionFactors: Record<string, number> = {
      Chol: 0.0259, // Cholesterol
      TG: 0.0113,   // Triglycerides
      HDL: 0.0259,  // HDL Cholesterol
      LDL: 0.0259,  // LDL Cholesterol
      Cr: 88.4,     // Creatinine (mg/dL to µmol/L)
      BUN: 0.357,   // BUN (mg/dL to mmol/L)
    };

    // Convert mg/dL to mmol/L for relevant fields
    function convertFormDataToMmolL(data: FormData): FormData {
      const converted: FormData = { ...data };
      for (const key of Object.keys(conversionFactors)) {
        const val = Number(data[key as keyof FormData]);
        if (!isNaN(val) && val !== 0) {
          converted[key as keyof FormData] = (val * conversionFactors[key]).toFixed(2);
        }
      }
      return converted;
    }
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [errors, setErrors]     = useState<FormErrors>({})
  const [result, setResult]     = useState<any>(null)
  const [loading, setLoading]   = useState(false)
  const [fetching, setFetching] = useState(true)
  const [prefilled, setPrefilled] = useState(false)

  // ── On open: apply extracted values immediately, then enrich with saved data ─
  useEffect(() => {
    if (!open) return
    setResult(null)
    setErrors({})
    setPrefilled(false)

    const hasExtracted = !!extractedData && Object.values(extractedData).some(v => v != null && v !== "")
    if (hasExtracted) {
      // Apply extracted and convert values
      const extracted = applyExtracted(EMPTY_FORM, extractedData);
      setFormData(convertFormDataToMmolL(extracted));
      setPrefilled(true);
      setFetching(false);
      setTimeout(() => {
        if (!loading && !result) {
          handleSubmit({ preventDefault: () => {} } as React.FormEvent);
        }
      }, 500);
      return;
    }

    setFormData(EMPTY_FORM);
    setFetching(true);

    const fetchData = async () => {
      try {
        const userId = localStorage.getItem("user_id");
        const token  = localStorage.getItem("access_token");
        if (!userId || !token) { setFetching(false); return; }

        const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
        const res  = await fetch(`${base}/api/diabetic/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          // Only use a saved value if it is a meaningful non-zero value
          const nz = (v: any) => (v != null && Number(v) !== 0) ? String(v) : "";
          const loaded: FormData = {
            Age:    nz(data.Age),
            Gender: data.Gender ?? "",
            BMI:    nz(data.BMI),
            Chol:   nz(data.Chol),
            TG:     nz(data.TG),
            HDL:    nz(data.HDL),
            LDL:    nz(data.LDL),
            Cr:     nz(data.Cr),
            BUN:    nz(data.BUN),
          };
          setFormData(convertFormDataToMmolL(loaded));
        }
      } catch (e) {
        console.error("DiabeticModal fetch:", e);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [open, extractedData])

  const handleChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }))
  }

  const validate = (): FormErrors => {
    const errs: FormErrors = {}
    const age = Number(formData.Age)
    if (!formData.Age || isNaN(age) || age < 1 || age > 120)
      errs.Age = "Age must be between 1 and 120"
    if (!formData.Gender || (formData.Gender !== "M" && formData.Gender !== "F"))
      errs.Gender = "Please select a gender"
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return }

    setLoading(true)
    setResult(null)

    // Convert relevant fields to mmol/L before sending
    const converted = convertFormDataToMmolL(formData);

    try {
      const res = await fetch("https://diabetesnew-1051190728028.asia-south1.run.app", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Age:    Number(converted.Age),
          Gender: converted.Gender,
          BMI:    Number(converted.BMI),
          Chol:   Number(converted.Chol),
          TG:     Number(converted.TG),
          HDL:    Number(converted.HDL),
          LDL:    Number(converted.LDL),
          Cr:     Number(converted.Cr),
          BUN:    Number(converted.BUN),
        }),
      })
      if (!res.ok) throw new Error("API request failed")
      const apiResult = await res.json()
      setResult(apiResult)
      if (prefilled && typeof onAutoResult === "function") {
        onAutoResult(apiResult)
      }
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const getRiskDisplay = () => {
    if (!result || result.error) return null
    const val = result.prediction ?? result.result ?? result.risk ?? result.probability
    if (val === undefined) return null
    const isHighRisk = val === 1 || val === "1" || (typeof val === "number" && val > 0.5)
    return { isHighRisk }
  }
  const riskDisplay = getRiskDisplay()

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10 bg-background">

        {/* Header */}
        <DialogHeader className="px-7 py-5 border-b border-white/5 sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <RiMicroscopeLine className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-black tracking-tight">Diabetic Assessment</DialogTitle>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mt-0.5">
                Metabolic Risk Analysis
              </p>
            </div>
            {/* Pre-filled badge */}
            {prefilled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <FlaskConical className="h-3 w-3 text-amber-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                  From Lab Report
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="p-7 space-y-6">
          {fetching ? (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">Loading data…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Age + Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Age <span className="font-normal normal-case tracking-normal text-muted-foreground/40">(years)</span>
                  </Label>
                  <Input
                    type="number"
                    placeholder="e.g. 45"
                    value={formData.Age}
                    onChange={e => handleChange("Age", e.target.value)}
                    className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-amber-500/40 ${errors.Age ? "border-destructive/50" : ""}`}
                  />
                  {errors.Age && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" /> {errors.Age}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gender</Label>
                  <Select value={formData.Gender} onValueChange={v => handleChange("Gender", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-amber-500/40 ${errors.Gender ? "border-destructive/50" : ""}`}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Male</SelectItem>
                      <SelectItem value="F">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.Gender && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" /> {errors.Gender}
                    </p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">Lab Values</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              {/* Numeric fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {NUMERIC_FIELDS.map(({ key, label, unit }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {label}
                      {unit && <span className="font-normal normal-case tracking-normal text-muted-foreground/40 ml-1">({unit})</span>}
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={(formData as any)[key]}
                      onChange={e => handleChange(key, e.target.value)}
                      className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-amber-500/40 ${
                        // Highlight fields that were auto-filled from the lab report
                        prefilled && extractedData?.[key] != null
                          ? "border-amber-500/30 bg-amber-500/5"
                          : ""
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-400 text-black border-none disabled:opacity-50 transition-all"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2.5 animate-spin" /> Analyzing…</>
                  : <><RiMicroscopeLine className="h-4 w-4 mr-2.5" /> Run Assessment</>
                }
              </Button>
            </form>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-[1.5rem] border p-5 space-y-3 ${
              result.error
                ? "bg-destructive/5 border-destructive/20"
                : riskDisplay?.isHighRisk
                  ? "bg-rose-500/5 border-rose-500/20"
                  : "bg-emerald-500/5 border-emerald-500/20"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                  result.error ? "bg-destructive/10 text-destructive"
                  : riskDisplay?.isHighRisk ? "bg-rose-500/10 text-rose-400"
                  : "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {result.error || riskDisplay?.isHighRisk
                    ? <AlertCircle className="h-4 w-4" />
                    : <CheckCircle className="h-4 w-4" />
                  }
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assessment Result</p>
                  {riskDisplay && !result.error && (
                    <p className={`text-sm font-black mt-0.5 ${riskDisplay.isHighRisk ? "text-rose-400" : "text-emerald-400"}`}>
                      {riskDisplay.isHighRisk ? "High Risk Detected" : "Low Risk"}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
                <pre className="text-xs text-foreground/70 whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}