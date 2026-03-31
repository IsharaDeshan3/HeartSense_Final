import { NextRequest, NextResponse } from "next/server";

const WORKFLOW_BACKEND_URL =
  process.env.WORKFLOW_BACKEND_URL ?? process.env.DIAGNOSTIC_BACKEND_URL ?? "http://127.0.0.1:8080";

function buildBackendCandidates() {
  const primary = WORKFLOW_BACKEND_URL;
  const candidates = [primary];

  // On Windows, localhost may resolve to ::1 while uvicorn listens on IPv4.
  // Try the opposite loopback host before surfacing a 502 to the frontend.
  if (primary.includes("localhost")) {
    candidates.push(primary.replace("localhost", "127.0.0.1"));
  } else if (primary.includes("127.0.0.1")) {
    candidates.push(primary.replace("127.0.0.1", "localhost"));
  }

  return [...new Set(candidates)];
}

function buildTargetUrl(slug: string[], search: string) {
  const path = slug.join("/");
  return buildBackendCandidates().map(
    (base) => `${base}/api/workflow/v1/${path}${search}`,
  );
}

type ProxyFetchError = {
  message: string;
  attemptedTargets?: string[];
};

function extractProxyError(error: unknown): ProxyFetchError {
  if (typeof error === "object" && error !== null) {
    const message =
      typeof Reflect.get(error, "message") === "string"
        ? (Reflect.get(error, "message") as string)
        : "Upstream workflow request failed";

    const attemptedTargetsValue = Reflect.get(error, "attemptedTargets");
    const attemptedTargets = Array.isArray(attemptedTargetsValue)
      ? attemptedTargetsValue.filter((item): item is string => typeof item === "string")
      : undefined;

    return { message, attemptedTargets };
  }

  return { message: "Upstream workflow request failed" };
}

async function fetchWithFallback(
  urls: string[],
  init: RequestInit,
): Promise<{ backendRes: Response; attemptedTargets: string[] }> {
  const attemptedTargets: string[] = [];
  let lastError: unknown = null;

  for (const url of urls) {
    attemptedTargets.push(url);
    try {
      const backendRes = await fetch(url, init);
      return { backendRes, attemptedTargets };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  const proxyError = extractProxyError(lastError);
  throw {
    message: proxyError.message,
    attemptedTargets,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const targets = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const { backendRes } = await fetchWithFallback(targets, {
      method: "GET",
      headers: { Accept: req.headers.get("Accept") ?? "application/json" },
      cache: "no-store",
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
  } catch (error: unknown) {
    const proxyError = extractProxyError(error);
    return NextResponse.json(
      {
        error: "Cannot reach workflow backend",
        target: WORKFLOW_BACKEND_URL,
        attemptedTargets: proxyError.attemptedTargets,
        detail: proxyError.message,
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
  const targets = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const body = await req.text();
    const { backendRes } = await fetchWithFallback(targets, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(600_000), // 10 min — CPU inference can take 4-5 min
    });

    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error: unknown) {
    const proxyError = extractProxyError(error);
    return NextResponse.json(
      {
        error: "Cannot reach workflow backend",
        target: WORKFLOW_BACKEND_URL,
        attemptedTargets: proxyError.attemptedTargets,
        detail: proxyError.message,
      },
      { status: 502 },
    );
  }
}
