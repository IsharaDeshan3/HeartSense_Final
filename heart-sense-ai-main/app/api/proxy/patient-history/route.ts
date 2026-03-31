import { NextRequest, NextResponse } from "next/server";

const WORKFLOW_BACKEND_URL =
  process.env.WORKFLOW_BACKEND_URL ?? process.env.DIAGNOSTIC_BACKEND_URL ?? "http://127.0.0.1:8080";

function resolvePatientId(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get("patient_id")?.trim() ||
    request.nextUrl.searchParams.get("user_id")?.trim() ||
    request.nextUrl.searchParams.get("id")?.trim() ||
    ""
  );
}

export async function GET(req: NextRequest) {
  const patientId = resolvePatientId(req);

  if (!patientId) {
    return NextResponse.json({ error: "Missing patient_id" }, { status: 400 });
  }

  try {
    const backendRes = await fetch(
      `${WORKFLOW_BACKEND_URL}/api/workflow/v1/patient/${encodeURIComponent(patientId)}/history`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Cannot reach workflow backend",
        target: WORKFLOW_BACKEND_URL,
        detail: error?.message || "Upstream workflow request failed",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      stored: false,
      message: "analysis_flow exposes patient history as read-only through the workflow API",
      echoed: body,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Patient history proxy failed",
        detail: error?.message || "Unexpected proxy failure",
      },
      { status: 500 },
    );
  }
}