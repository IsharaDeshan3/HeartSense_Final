import { NextRequest, NextResponse } from "next/server";

const EXTRACTION_BACKEND_URL =
  process.env.DATA_EXTRACTION_BACKEND_URL ?? "http://127.0.0.1:8001";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const transcript = String(payload.transcript_si ?? payload.transcript ?? "").trim();

    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const backendRes = await fetch(`${EXTRACTION_BACKEND_URL}/process-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: String(payload.session_id ?? "web-session"),
        transcript_si: transcript,
        current_state: payload.current_state ?? {
          symptoms: {},
          medical_history: {},
          allergies: {},
          risk_factors: {},
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const extraction = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        {
          error: "Cannot reach extraction backend",
          target: EXTRACTION_BACKEND_URL,
          detail: extraction,
        },
        { status: backendRes.status },
      );
    }

    return NextResponse.json({
      updated_state: extraction.updated_state ?? payload.current_state ?? payload.currentState ?? {},
      missing_critical: extraction.missing_critical ?? { symptoms: [], risk_factors: [] },
      translated_text: extraction.translated_text ?? transcript,
      extraction,
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