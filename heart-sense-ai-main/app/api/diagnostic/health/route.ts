import { NextResponse } from "next/server";

const DIAGNOSTIC_BACKEND_URL =
  process.env.DIAGNOSTIC_BACKEND_URL ?? "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${DIAGNOSTIC_BACKEND_URL}/api/workflow/v1/health`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15_000), // 15s — Supabase ping can take ~5s
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "offline", error: res.statusText },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { status: "offline", error: "Cannot reach diagnostic processor" },
      { status: 503 },
    );
  }
}
