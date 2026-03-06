import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 900;

const WORKFLOW_BACKEND_URL =
  process.env.WORKFLOW_BACKEND_URL ?? process.env.DIAGNOSTIC_BACKEND_URL ?? "http://localhost:8080";

function buildTargetUrl(slug: string[], search: string) {
  const path = slug.join("/");
  return `${WORKFLOW_BACKEND_URL}/api/workflow/v1/${path}${search}`;
}

const WORKFLOW_PROXY_TIMEOUT_MS = 900_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const target = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const backendRes = await fetch(target, {
      method: "GET",
      headers: { Accept: req.headers.get("Accept") ?? "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(WORKFLOW_PROXY_TIMEOUT_MS),
    });

    const contentType = backendRes.headers.get("Content-Type") ?? "application/json";

    // ── SSE streaming proxy ──────────────────────────────────────────────────
    // When the backend returns text/event-stream, pipe the body directly so the
    // browser EventSource gets real-time events instead of a buffered response.
    if (contentType.includes("text/event-stream") && backendRes.body) {
      const { readable, writable } = new TransformStream();
      backendRes.body.pipeTo(writable);
      return new NextResponse(readable, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    // ── Regular response ─────────────────────────────────────────────────────
    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": contentType },
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const target = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const body = await req.text();
    const backendRes = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(WORKFLOW_PROXY_TIMEOUT_MS),
    });

    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
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
