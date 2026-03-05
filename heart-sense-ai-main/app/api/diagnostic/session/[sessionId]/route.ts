import { NextResponse } from "next/server";

const DIAGNOSTIC_BACKEND_URL =
  process.env.DIAGNOSTIC_BACKEND_URL ?? "http://localhost:8080";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const res = await fetch(
      `${DIAGNOSTIC_BACKEND_URL}/api/process/session/${sessionId}`,
      { next: { revalidate: 0 } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || "Session not found" },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Cannot reach diagnostic processor" },
      { status: 502 },
    );
  }
}
