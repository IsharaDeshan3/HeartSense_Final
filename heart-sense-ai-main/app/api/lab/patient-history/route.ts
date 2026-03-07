import { NextRequest, NextResponse } from "next/server";

const LAB_BACKEND_URL = process.env.LAB_BACKEND_URL ?? "http://localhost:8000";
const LAB_PROXY_TIMEOUT_MS = 30_000;

export async function GET(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patient_id")?.trim();

  if (!patientId) {
    return NextResponse.json(
      { error: "Missing required query parameter: patient_id" },
      { status: 400 },
    );
  }

  const target = `${LAB_BACKEND_URL}/api/patient-history?patient_id=${encodeURIComponent(patientId)}`;

  try {
    const backendRes = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(LAB_PROXY_TIMEOUT_MS),
    });

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
        error: "Cannot reach lab backend",
        target: LAB_BACKEND_URL,
        detail: error?.message || "Upstream lab request failed",
      },
      { status: 502 },
    );
  }
}