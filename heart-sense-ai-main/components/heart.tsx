"use client"

import { useState, useEffect } from "react"
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
import { RiHeartAddLine } from "@remixicon/react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  age: string; sex: string; cp: string; trestbps: string; chol: string
  fbs: string; restecg: string; thalach: string; exang: string
  oldpeak: string; slope: string; ca: string; thal: string
}

interface FormErrors { [key: string]: string }

interface HeartModalProps {
  open: boolean
  onClose: () => void
  /** extractedJsonGroup2 from LabSuggester — pre-fills cardiac fields */
  extractedData?: Record<string, any>
}

// ─── Field config ─────────────────────────────────────────────────────────────

const NUMERIC_FIELDS: { key: keyof FormData; label: string; unit?: string }[] = [
  { key: "trestbps", label: "Resting Blood Pressure", unit: "mmHg" },
  { key: "chol",     label: "Serum Cholesterol",      unit: "mg/dL" },
  { key: "thalach",  label: "Max Heart Rate",          unit: "bpm"   },
  { key: "oldpeak",  label: "ST Depression",           unit: "mm"    },
  { key: "ca",       label: "Major Vessels (0–3)"                    },
]

const EMPTY_FORM: FormData = {
  age: "", sex: "", cp: "", trestbps: "", chol: "",
  fbs: "", restecg: "", thalach: "", exang: "",
  oldpeak: "", slope: "", ca: "", thal: "",
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function applyExtracted(base: FormData, data?: Record<string, any>): FormData {
  if (!data) return base
  const s = (v: any) => (v != null ? String(v) : "")
  return {
    age:      data.age      != null ? s(data.age)      : base.age,
    sex:      data.sex      != null ? s(data.sex)      : base.sex,
    cp:       data.cp       != null ? s(data.cp)       : base.cp,
    trestbps: data.trestbps != null ? s(data.trestbps) : base.trestbps,
    chol:     data.chol     != null ? s(data.chol)     : base.chol,
    fbs:      data.fbs      != null ? s(data.fbs)      : base.fbs,
    restecg:  data.restecg  != null ? s(data.restecg)  : base.restecg,
    thalach:  data.thalach  != null ? s(data.thalach)  : base.thalach,
    exang:    data.exang    != null ? s(data.exang)    : base.exang,
    oldpeak:  data.oldpeak  != null ? s(data.oldpeak)  : base.oldpeak,
    slope:    data.slope    != null ? s(data.slope)    : base.slope,
    ca:       data.ca       != null ? s(data.ca)       : base.ca,
    thal:     data.thal     != null ? s(data.thal)     : base.thal,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HeartModal({ open, onClose, extractedData }: HeartModalProps) {
  const [formData, setFormData]   = useState<FormData>(EMPTY_FORM)
  const [errors, setErrors]       = useState<FormErrors>({})
  const [result, setResult]       = useState<any>(null)
  const [loading, setLoading]     = useState(false)
  const [fetching, setFetching]   = useState(true)
  const [prefilled, setPrefilled] = useState(false)

  useEffect(() => {
    if (!open) return
    setResult(null); setErrors({}); setPrefilled(false)

    // Step 1 — apply extracted values immediately (no API wait)
    const hasExtracted = !!extractedData && Object.values(extractedData).some(v => v != null && v !== "")
    if (hasExtracted) {
      setFormData(applyExtracted(EMPTY_FORM, extractedData))
      setPrefilled(true)
      setFetching(false)
      return
    }

    // Step 2 — no extracted data, load from saved API
    setFormData(EMPTY_FORM)
    setFetching(true)

    ;(async () => {
      try {
        const userId = localStorage.getItem("user_id")
        const token  = localStorage.getItem("access_token")
        if (!userId || !token) { setFetching(false); return }

        const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"
        const res  = await fetch(`${base}/api/heart/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          const nz = (v: any) => (v != null && Number(v) !== 0) ? String(v) : ""
          setFormData({
            age:      nz(data.age),
            sex:      nz(data.sex),
            cp:       nz(data.cp),
            trestbps: nz(data.trestbps),
            chol:     nz(data.chol),
            fbs:      nz(data.fbs),
            restecg:  nz(data.restecg),
            thalach:  nz(data.thalach),
            exang:    nz(data.exang),
            oldpeak:  nz(data.oldpeak),
            slope:    nz(data.slope),
            ca:       nz(data.ca),
            thal:     nz(data.thal),
          })
        }
      } catch (e) {
        console.error("HeartModal fetch:", e)
      } finally {
        setFetching(false)
      }
    })()
  }, [open, extractedData])

  const handleChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }))
  }

  const validate = (): FormErrors => {
    const errs: FormErrors = {}
    const age = Number(formData.age)
    if (!formData.age || isNaN(age) || age < 1 || age > 120) errs.age = "Age must be between 1 and 120"
    if (!formData.sex || (formData.sex !== "0" && formData.sex !== "1")) errs.sex = "Please select a sex"
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    // Check if only age and sex are filled, all other fields are empty or zero
    const otherFields = ["cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"];
    const onlyAgeSex = otherFields.every(f => {
      const v = formData[f as keyof FormData];
      return v === "" || v === "0" || Number(v) === 0;
    });
    if (onlyAgeSex) {
      setResult(null);
      setLoading(false);
      return;
    }

    setLoading(true); setResult(null)
    try {
      const res = await fetch("https://cardiac-1051190728028.asia-south1.run.app", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: Number(formData.age), sex: Number(formData.sex), cp: Number(formData.cp),
          trestbps: Number(formData.trestbps), chol: Number(formData.chol),
          fbs: Number(formData.fbs), restecg: Number(formData.restecg),
          thalach: Number(formData.thalach), exang: Number(formData.exang),
          oldpeak: Number(formData.oldpeak), slope: Number(formData.slope),
          ca: Number(formData.ca), thal: Number(formData.thal),
        }),
      })
      if (!res.ok) throw new Error(`API failed: ${res.status}`)
      setResult(await res.json())
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
    return { isHighRisk: val === 1 || val === "1" || (typeof val === "number" && val > 0.5) }
  }
  const riskDisplay = getRiskDisplay()

  const isExtracted = (key: string) => prefilled && extractedData?.[key] != null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10 bg-background">

        <DialogHeader className="px-7 py-5 border-b border-white/5 sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
              <RiHeartAddLine className="h-4 w-4 text-pink-400" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-black tracking-tight">Heart Assessment</DialogTitle>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mt-0.5">Cardiac Risk Analysis</p>
            </div>
            {prefilled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/20">
                <FlaskConical className="h-3 w-3 text-pink-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-pink-400">From Lab Report</span>
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

              {/* Age + Sex */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Age <span className="font-normal normal-case tracking-normal text-muted-foreground/40">(years)</span>
                  </Label>
                  <Input type="number" placeholder="e.g. 52" value={formData.age}
                    onChange={e => handleChange("age", e.target.value)}
                    className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${errors.age ? "border-destructive/50" : ""} ${isExtracted("age") ? "border-pink-500/30 bg-pink-500/5" : ""}`}
                  />
                  {errors.age && <p className="text-[11px] text-destructive flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> {errors.age}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sex</Label>
                  <Select value={formData.sex} onValueChange={v => handleChange("sex", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${errors.sex ? "border-destructive/50" : ""} ${isExtracted("sex") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Female</SelectItem>
                      <SelectItem value="1">Male</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.sex && <p className="text-[11px] text-destructive flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> {errors.sex}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">Cardiac Parameters</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              {/* Select fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Chest Pain */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Chest Pain Type</Label>
                  <Select value={formData.cp} onValueChange={v => handleChange("cp", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("cp") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Typical Angina</SelectItem>
                      <SelectItem value="1">Atypical Angina</SelectItem>
                      <SelectItem value="2">Non-anginal Pain</SelectItem>
                      <SelectItem value="3">Asymptomatic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* FBS */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Fasting Blood Sugar <span className="font-normal normal-case tracking-normal text-muted-foreground/40">(&gt;120 mg/dL)</span>
                  </Label>
                  <Select value={formData.fbs} onValueChange={v => handleChange("fbs", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("fbs") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No (&lt;120 mg/dL)</SelectItem>
                      <SelectItem value="1">Yes (&gt;120 mg/dL)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Resting ECG */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resting ECG</Label>
                  <Select value={formData.restecg} onValueChange={v => handleChange("restecg", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("restecg") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Normal</SelectItem>
                      <SelectItem value="1">ST-T Wave Abnormality</SelectItem>
                      <SelectItem value="2">Left Ventricular Hypertrophy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Exercise Angina */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Exercise Induced Angina</Label>
                  <Select value={formData.exang} onValueChange={v => handleChange("exang", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("exang") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No</SelectItem>
                      <SelectItem value="1">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* ST Slope */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ST Slope</Label>
                  <Select value={formData.slope} onValueChange={v => handleChange("slope", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("slope") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Upsloping</SelectItem>
                      <SelectItem value="1">Flat</SelectItem>
                      <SelectItem value="2">Downsloping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Thal */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Thalassemia</Label>
                  <Select value={formData.thal} onValueChange={v => handleChange("thal", v)}>
                    <SelectTrigger className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted("thal") ? "border-pink-500/30 bg-pink-500/5" : ""}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Normal</SelectItem>
                      <SelectItem value="2">Fixed Defect</SelectItem>
                      <SelectItem value="3">Reversible Defect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Numeric fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {NUMERIC_FIELDS.map(({ key, label, unit }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {label}{unit && <span className="font-normal normal-case tracking-normal text-muted-foreground/40 ml-1">({unit})</span>}
                    </Label>
                    <Input type="number" step="0.1" placeholder="0"
                      value={(formData as any)[key]}
                      onChange={e => handleChange(key, e.target.value)}
                      className={`h-11 rounded-xl border-white/10 bg-white/[0.03] focus:border-pink-500/40 ${isExtracted(key) ? "border-pink-500/30 bg-pink-500/5" : ""}`}
                    />
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={loading}
                className="w-full h-12 rounded-2xl font-black uppercase tracking-widest bg-pink-500 hover:bg-pink-400 text-white border-none disabled:opacity-50 transition-all"
              >
                {loading ? <><Loader2 className="h-4 w-4 mr-2.5 animate-spin" /> Analyzing…</> : <><RiHeartAddLine className="h-4 w-4 mr-2.5" /> Run Assessment</>}
              </Button>
            </form>
          )}

          {/* Result: Only show if not only age/sex */}
          {result && !(
            ["cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"].every(f => {
              const v = formData[f as keyof FormData];
              return v === "" || v === "0" || Number(v) === 0;
            })
          ) && (
            <div className={`rounded-[1.5rem] border p-5 space-y-3 ${result.error ? "bg-destructive/5 border-destructive/20" : riskDisplay?.isHighRisk ? "bg-rose-500/5 border-rose-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${result.error ? "bg-destructive/10 text-destructive" : riskDisplay?.isHighRisk ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {result.error || riskDisplay?.isHighRisk ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
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
                <pre className="text-xs text-foreground/70 whitespace-pre-wrap break-words font-mono leading-relaxed">{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}