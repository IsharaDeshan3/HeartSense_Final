import { NextResponse } from "next/server";

const DIAGNOSTIC_BACKEND_URL =
  process.env.DIAGNOSTIC_BACKEND_URL ?? "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000); // 600s (10min) — HF inference can take 5min+

    const backendRes = await fetch(
      `${DIAGNOSTIC_BACKEND_URL}/api/process/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!backendRes.ok) {
      const errorData = await backendRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: errorData.detail || "Diagnostic pipeline failed",
          message: errorData.detail || backendRes.statusText,
        },
        { status: backendRes.status },
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Timeout",
          message:
            "The diagnostic pipeline timed out (10 min). The AI agents may be warming up — please try again.",
        },
        { status: 504 },
      );
    }

    console.error("Diagnostic Proxy Error:", error);
    return NextResponse.json(
      {
        error: "Connection failed",
        message:
          "Could not connect to the diagnostic processor at " +
          DIAGNOSTIC_BACKEND_URL +
          ". Please ensure the service is running.",
      },
      { status: 502 },
    );
  }
}
