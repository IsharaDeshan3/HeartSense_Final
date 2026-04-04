import { NextRequest, NextResponse } from "next/server";

const HF_BACKEND_URL = process.env.HF_BACKEND_URL ?? "http://localhost:8090";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    // Forward the abort request to the backend
    const backendRes = await fetch(`${HF_BACKEND_URL}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Cannot reach HF backend for abort",
        detail: error?.message || "Upstream abort request failed",
      },
      { status: 502 },
    );
  }
}
