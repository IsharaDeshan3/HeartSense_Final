import { NextRequest, NextResponse } from "next/server";

const HF_BACKEND_URL =
  process.env.HF_BACKEND_URL ?? "http://localhost:8090";

function buildTargetUrl(slug: string[], search: string) {
  const path = slug.join("/");
  return `${HF_BACKEND_URL}/${path}${search}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const target = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const backendRes = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Cannot reach HF backend",
        target: HF_BACKEND_URL,
        detail: error?.message || "Upstream request failed",
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
      signal: AbortSignal.timeout(600_000),
    });
    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Cannot reach HF backend",
        target: HF_BACKEND_URL,
        detail: error?.message || "Upstream request failed",
      },
      { status: 502 },
    );
  }
}
