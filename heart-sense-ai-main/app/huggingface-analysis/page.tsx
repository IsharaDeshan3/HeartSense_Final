"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Diagnosis {
  condition: string;
  confidence: number;
  severity: string;
  evidence: string[];
  clinical_features: string[];
}

interface KraResult {
  diagnoses: Diagnosis[];
  uncertainties: string[];
  recommended_tests: string[];
  red_flags: string[];
}

interface AnalyzeResponse {
  session_id: string;
  status: string;
  kra_raw?: string;
  kra_result?: KraResult;
  source: string;
  space_url?: string;
  duration_ms: number;
  error?: string;
}

/* ── Severity badge colours ────────────────────────────────────────────────── */

const severityColor: Record<string, string> = {
  CRITICAL: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  HIGH: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  MODERATE: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  LOW: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

/* ── Component ─────────────────────────────────────────────────────────────── */

function HuggingFaceAnalysisContent() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [aborting, setAborting] = useState(false);
  // Abort analysis handler
  const abortAnalysis = useCallback(async () => {
    if (!sessionId) return;
    setAborting(true);
    try {
      const resp = await fetch("/api/huggingface/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${resp.status}`);
      }
      // Optionally, show a message or update UI
      setError("Analysis aborted by user.");
      setLoading(false);
    } catch (e: any) {
      setError(e.message || "Abort request failed");
    } finally {
      setAborting(false);
    }
  }, [sessionId]);

  /* ── Health check ──────────────────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/huggingface/health")
      .then((r) => r.json())
      .then((d) => setHealthOk(d.status === "ok"))
      .catch(() => setHealthOk(false));
  }, []);

  /* ── Elapsed timer ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  /* ── Run analysis ──────────────────────────────────────────────────── */
  const runAnalysis = useCallback(async () => {
    if (!sessionId) {
      setError("No session ID provided. Open this page from the dashboard.");
      return;
    }
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);

    try {
      const resp = await fetch("/api/huggingface/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          experience_level: "seasoned",
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${resp.status}`);
      }

      const data: AnalyzeResponse = await resp.json();
      setResult(data);
      if (data.status === "FAILED") {
        setError(data.error || "Analysis failed");
      }
    } catch (e: any) {
      setError(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  /* ── Auto-run on mount ────────────────────────────────────────────── */
  useEffect(() => {
    if (sessionId) {
      runAnalysis();
    }
  }, [sessionId, runAnalysis]);

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 font-sans">
      {/* Header */}
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <span className="text-xl">🤗</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              HuggingFace KRA Analysis
            </h1>
            <p className="text-xs text-gray-500">
              Remote inference via Hugging Face Space
            </p>
          </div>
          {healthOk !== null && (
            <span
              className={`ml-auto px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                healthOk
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {healthOk ? "Online" : "Offline"}
            </span>
          )}
        </div>

        {/* Session info */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs space-y-1">
          <div>
            <span className="text-gray-500">Session:</span>{" "}
            <span className="font-mono text-gray-300">
              {sessionId || "none"}
            </span>
          </div>
          {result?.space_url && (
            <div>
              <span className="text-gray-500">Space:</span>{" "}
              <span className="font-mono text-violet-400">
                {result.space_url}
              </span>
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-6 text-center space-y-3">
            <div className="flex justify-center">
              <svg
                className="animate-spin h-8 w-8 text-violet-400"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <p className="text-sm text-violet-300 font-semibold">
              Sending to Hugging Face Space…
            </p>
            <p className="text-xs text-gray-500 tabular-nums">{elapsed}s elapsed</p>
            <button
              onClick={abortAnalysis}
              className="mt-4 px-6 py-2 rounded-xl bg-rose-500/20 text-rose-300 text-sm font-bold hover:bg-rose-500/30 transition disabled:opacity-60"
              disabled={aborting}
            >
              {aborting ? "Aborting..." : "⏹ Stop Analysis"}
            </button>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-5 space-y-3">
            <p className="text-sm text-rose-400 font-bold">⚠ Analysis Error</p>
            <p className="text-xs text-rose-300/80">{error}</p>
            <button
              onClick={runAnalysis}
              className="px-4 py-2 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/30 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {result && result.kra_result && !loading && (
          <div className="space-y-6">
            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                {result.status}
              </span>
              <span className="text-xs text-gray-500 tabular-nums">
                {(result.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>

            {/* Diagnoses */}
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">
                Diagnoses
              </h2>
              {result.kra_result.diagnoses.map((dx, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm">{dx.condition}</h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          severityColor[dx.severity] ?? severityColor.LOW
                        }`}
                      >
                        {dx.severity}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {(dx.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {/* Confidence bar */}
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${dx.confidence * 100}%` }}
                    />
                  </div>
                  {/* Evidence */}
                  {dx.evidence?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                        Evidence
                      </p>
                      <ul className="space-y-1">
                        {dx.evidence.map((e, j) => (
                          <li
                            key={j}
                            className="text-xs text-gray-300 flex items-start gap-2"
                          >
                            <span className="text-violet-500 mt-0.5">▸</span>
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Clinical features */}
                  {dx.clinical_features?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {dx.clinical_features.map((f, j) => (
                        <span
                          key={j}
                          className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-gray-400"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Red flags */}
            {result.kra_result.red_flags?.length > 0 && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-5 space-y-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-rose-400">
                  🚨 Red Flags
                </h2>
                <ul className="space-y-1">
                  {result.kra_result.red_flags.map((rf, i) => (
                    <li key={i} className="text-xs text-rose-300/80 flex items-start gap-2">
                      <span className="text-rose-500 mt-0.5">▸</span>
                      {rf}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Uncertainties */}
            {result.kra_result.uncertainties?.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5 space-y-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Uncertainties
                </h2>
                <ul className="space-y-1">
                  {result.kra_result.uncertainties.map((u, i) => (
                    <li key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">▸</span>
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended tests */}
            {result.kra_result.recommended_tests?.length > 0 && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-5 space-y-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-blue-400">
                  Recommended Tests
                </h2>
                <ul className="space-y-1">
                  {result.kra_result.recommended_tests.map((t, i) => (
                    <li key={i} className="text-xs text-blue-300/80 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">▸</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Raw output toggle */}
            <details className="rounded-xl border border-white/10 bg-white/[0.02]">
              <summary className="px-5 py-3 cursor-pointer text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300">
                Raw Model Output
              </summary>
              <pre className="px-5 pb-4 text-[11px] text-gray-400 whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                {result.kra_raw}
              </pre>
            </details>

            {/* Disclaimer */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
              <p className="text-[10px] text-gray-600 leading-relaxed">
                ⚠️ DISCLAIMER: This is an AI-assisted analysis for clinical
                decision support only. It is NOT a medical diagnosis. All
                findings must be verified through clinical judgment. This result
                was generated by a Hugging Face Space and may differ from local
                model output.
              </p>
            </div>
          </div>
        )}

        {/* No parsed result but we got raw text */}
        {result && !result.kra_result && result.kra_raw && !loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/20">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                Partial Result — JSON parse failed
              </span>
            </div>
            <pre className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-xs text-gray-300 whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto">
              {result.kra_raw}
            </pre>
          </div>
        )}

        {/* Retry button */}
        {result && !loading && (
          <button
            onClick={runAnalysis}
            className="px-6 py-3 rounded-xl bg-violet-500/20 text-violet-300 text-sm font-bold hover:bg-violet-500/30 transition"
          >
            🔄 Re-run with Hugging Face
          </button>
        )}

        {/* No session */}
        {!sessionId && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-6 text-center">
            <p className="text-sm text-amber-300 font-semibold">
              No session ID provided
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Open this page from the main dashboard using the
              &quot;Analyze with Hugging Face&quot; button.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HuggingFaceAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] text-white p-6 font-sans flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading analysis...</p>
        </div>
      }
    >
      <HuggingFaceAnalysisContent />
    </Suspense>
  );
}
