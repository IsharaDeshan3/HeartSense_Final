"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { RiHeartAddLine, RiMicroscopeLine } from "@remixicon/react"
import HeartModal from "./heart"
import DiabeticModal from "./Diabetes"

interface DiagnosticButtonsProps {
  onSelect?: (type: string) => void
  extractedGroup1?: Record<string, any>
  extractedGroup2?: Record<string, any>
}

function hasData(obj?: Record<string, any>) {
  return !!obj && Object.values(obj).some(
    (v) => v !== null && v !== undefined && v !== ""
  )
}

const DiagnosticButtons: React.FC<DiagnosticButtonsProps> = ({
  onSelect,
  extractedGroup1,
  extractedGroup2,
}) => {

  const [diabeticOpen, setDiabeticOpen] = useState(false)
  const [heartOpen, setHeartOpen] = useState(false)
  const [diabeticResult, setDiabeticResult] = useState<any>(null)
  const [heartResult, setHeartResult] = useState<any>(null)
  const [diabeticLoading, setDiabeticLoading] = useState(false)
  const [heartLoading, setHeartLoading] = useState(false)
  // Auto-run assessment for pre-filled Diabetes
  useEffect(() => {
    if (hasData(extractedGroup1)) {
      setDiabeticLoading(true);
      const cleanData = sanitizeData(extractedGroup1);
      fetch("https://diabetesnew-1051190728028.asia-south1.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanData),
      })
        .then(res => res.json())
        .then(data => setDiabeticResult(data))
        .catch(() => setDiabeticResult({ error: "API error" }))
        .finally(() => setDiabeticLoading(false));
    } else {
      setDiabeticResult(null);
    }
  }, [extractedGroup1]);

  // Auto-run assessment for pre-filled Heart
  useEffect(() => {
    if (hasData(extractedGroup2)) {
      setHeartLoading(true);
      const cleanData = sanitizeData(extractedGroup2);
      fetch("https://cardiac-1051190728028.asia-south1.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanData),
      })
        .then(res => res.json())
        .then(data => setHeartResult(data))
        .catch(() => setHeartResult({ error: "API error" }))
        .finally(() => setHeartLoading(false));
    } else {
      setHeartResult(null);
    }
  }, [extractedGroup2]);

  // Helper to sanitize data for API
  function sanitizeData(obj?: Record<string, any>) {
    if (!obj) return {};
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Impute missing numeric values with 0
      if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) {
        sanitized[key] = 0;
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }

  const handleSelect = async (type: string) => {
    if (type === "diabetic") {
      setDiabeticOpen(true);
      // Preprocess and send to diabetes API
      const cleanData = sanitizeData(extractedGroup1);
      try {
        const res = await fetch("https://diabetesnew-1051190728028.asia-south1.run.app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanData),
        });
        // Optionally handle response here
      } catch (e) {
        // Optionally handle error
      }
      return;
    }
    if (type === "heart") return setHeartOpen(true);
    onSelect?.(type);
  }


  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-12 p-8">

        {/* Heart Circle */}
        <Card
          onClick={() => handleSelect("heart")}
          className="group w-48 h-48 rounded-full cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-xl border-pink-200 bg-gradient-to-br from-pink-50 to-white"
        >
          <CardContent className="flex flex-col items-center justify-center h-full text-center relative">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-pink-100 group-hover:bg-pink-200 transition">
              <RiHeartAddLine className="w-8 h-8 text-pink-600" />
            </div>
            <span className="mt-3 text-sm font-semibold text-gray-800 leading-tight">
              Heart Attack Risk
            </span>
            {hasData(extractedGroup2) && (
              <span className="absolute top-4 right-4 text-[10px] font-semibold text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                Pre-filled
              </span>
            )}
            {/* Result display */}
            {heartLoading && hasData(extractedGroup2) && (
              <span className="mt-2 text-xs text-pink-500">Assessing...</span>
            )}
            {heartResult && hasData(extractedGroup2) && !heartLoading && (
              <>
                <span className={`mt-2 text-xs font-bold ${heartResult.error ? "text-rose-500" : heartResult.prediction === 1 || heartResult.result === 1 || heartResult.risk === 1 || heartResult.probability > 0.5 ? "text-rose-600" : "text-emerald-600"}`}>
                  {heartResult.error ? "Error" : heartResult.prediction === 1 || heartResult.result === 1 || heartResult.risk === 1 || heartResult.probability > 0.5 ? "High Risk" : "Low Risk"}
                </span>
                {typeof heartResult.probability === "number" && (
                  <span className="block text-[11px] font-medium text-pink-700 mt-1">
                    Risk: {(heartResult.probability * 100).toFixed(1)}%
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Diabetes Circle */}
        <Card
          onClick={() => handleSelect("diabetic")}
          className="group w-48 h-48 rounded-full cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-xl border-yellow-200 bg-gradient-to-br from-yellow-50 to-white"
        >
          <CardContent className="flex flex-col items-center justify-center h-full text-center relative">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-yellow-100 group-hover:bg-yellow-200 transition">
              <RiMicroscopeLine className="w-8 h-8 text-yellow-600" />
            </div>
            <span className="mt-3 text-sm font-semibold text-gray-800 leading-tight">
              Diabetes Risk
            </span>
            {hasData(extractedGroup1) && (
              <span className="absolute top-4 right-4 text-[10px] font-semibold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                Pre-filled
              </span>
            )}
            {/* Result display */}
            {diabeticLoading && hasData(extractedGroup1) && (
              <span className="mt-2 text-xs text-yellow-500">Assessing...</span>
            )}
            {diabeticResult && hasData(extractedGroup1) && !diabeticLoading && (
              <>
                <span className={`mt-2 text-xs font-bold ${diabeticResult.error ? "text-rose-500" : diabeticResult.prediction === 1 || diabeticResult.result === 1 || diabeticResult.risk === 1 || diabeticResult.probability > 0.5 ? "text-rose-600" : "text-emerald-600"}`}>
                  {diabeticResult.error ? "Error" : diabeticResult.prediction === 1 || diabeticResult.result === 1 || diabeticResult.risk === 1 || diabeticResult.probability > 0.5 ? "High Risk" : "Low Risk"}
                </span>
                {/* Show diabetes risk percentage from response */}
                {typeof diabeticResult.diabetes_risk_percentage === "number" && (
                  <span className="block text-[11px] font-medium text-yellow-700 mt-1">
                    Risk: {diabeticResult.diabetes_risk_percentage.toFixed(1)}%
                  </span>
                )}
                {/* Fallback to confidence if available */}
                {typeof diabeticResult.confidence === "number" && typeof diabeticResult.diabetes_risk_percentage !== "number" && (
                  <span className="block text-[11px] font-medium text-yellow-700 mt-1">
                    Risk: {diabeticResult.confidence.toFixed(1)}%
                  </span>
                )}
                {/* Fallback to probability if available */}
                {typeof diabeticResult.probability === "number" && typeof diabeticResult.diabetes_risk_percentage !== "number" && typeof diabeticResult.confidence !== "number" && (
                  <span className="block text-[11px] font-medium text-yellow-700 mt-1">
                    Risk: {(diabeticResult.probability * 100).toFixed(1)}%
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Modals */}
      <HeartModal
        open={heartOpen}
        onClose={() => setHeartOpen(false)}
        extractedData={extractedGroup2}
      />

      <DiabeticModal
        open={diabeticOpen}
        onClose={() => setDiabeticOpen(false)}
        extractedData={extractedGroup1}
      />
    </>
  )
}

export default DiagnosticButtons