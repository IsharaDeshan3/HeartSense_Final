import { NextRequest, NextResponse } from "next/server";

const ANALYSIS_BACKEND_URL =
  process.env.DIAGNOSTIC_BACKEND_URL ?? process.env.WORKFLOW_BACKEND_URL ?? "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const transcript = String(payload.transcript_si ?? payload.transcript ?? "").trim();

    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const backendRes = await fetch(`${ANALYSIS_BACKEND_URL}/api/analysis/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symptoms: transcript,
        ecg: payload.ecg ?? {},
        labs: payload.labs ?? {},
        lab_component_recommendations: payload.lab_component_recommendations ?? [],
      }),
      signal: AbortSignal.timeout(600_000),
    });

    const analysis = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        {
          error: "Cannot reach analysis backend",
          target: ANALYSIS_BACKEND_URL,
          detail: analysis,
        },
        { status: backendRes.status },
      );
    }

    return NextResponse.json({
      updated_state: payload.current_state ?? payload.currentState ?? {},
      missing_critical: payload.missing_critical ?? { symptoms: [], risk_factors: [] },
      translated_text:
        analysis.ora_newbie || analysis.ora_seasoned || analysis.banner || transcript,
      analysis,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Transcript proxy failed",
        detail: error?.message || "Unexpected proxy failure",
      },
      { status: 500 },
    );
  }
}