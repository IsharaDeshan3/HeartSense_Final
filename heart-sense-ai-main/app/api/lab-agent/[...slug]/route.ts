import { NextRequest, NextResponse } from "next/server";

const LAB_BACKEND_URL = process.env.LAB_BACKEND_URL ?? "http://127.0.0.1:8000";

function buildBackendCandidates() {
  const primary = LAB_BACKEND_URL;
  const candidates = [primary];

  if (primary.includes("localhost")) {
    candidates.push(primary.replace("localhost", "127.0.0.1"));
  } else if (primary.includes("127.0.0.1")) {
    candidates.push(primary.replace("127.0.0.1", "localhost"));
  }

  return [...new Set(candidates)];
}

function buildTargetUrls(slug: string[], search: string) {
  const path = slug.join("/");
  return buildBackendCandidates().map(
    (base) => `${base}/api/lab-agent/${path}${search}`,
  );
}

type ProxyError = {
  message: string;
  attemptedTargets?: string[];
};

function extractProxyError(error: unknown): ProxyError {
  if (typeof error === "object" && error !== null) {
    const message =
      typeof Reflect.get(error, "message") === "string"
        ? (Reflect.get(error, "message") as string)
        : "Upstream lab-agent request failed";

    const attemptedTargetsValue = Reflect.get(error, "attemptedTargets");
    const attemptedTargets = Array.isArray(attemptedTargetsValue)
      ? attemptedTargetsValue.filter((item): item is string => typeof item === "string")
      : undefined;

    return { message, attemptedTargets };
  }

  return { message: "Upstream lab-agent request failed" };
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

async function proxy(
  req: NextRequest,
  slug: string[],
  method: "GET" | "POST" | "DELETE",
) {
  const targets = buildTargetUrls(slug, req.nextUrl.search);

  try {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": req.headers.get("Content-Type") ?? "application/json",
        Accept: req.headers.get("Accept") ?? "application/json",
      },
      signal: AbortSignal.timeout(300_000),
    };

    if (method === "POST") {
      init.body = await req.text();
    }

    const { backendRes } = await fetchWithFallback(targets, init);
    const text = await backendRes.text();

    return new NextResponse(text, {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const proxyError = extractProxyError(error);
    return NextResponse.json(
      {
        error: "Cannot reach lab-agent backend",
        target: LAB_BACKEND_URL,
        attemptedTargets: proxyError.attemptedTargets,
        detail: proxyError.message,
      },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return proxy(req, slug, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return proxy(req, slug, "POST");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return proxy(req, slug, "DELETE");
}
