import { NextRequest, NextResponse } from "next/server";

const WORKFLOW_BACKEND_URL =
  process.env.WORKFLOW_BACKEND_URL ?? process.env.DIAGNOSTIC_BACKEND_URL ?? "http://localhost:8000";

function buildTargetUrl(slug: string[], search: string) {
  const path = slug.join("/");
  return `${WORKFLOW_BACKEND_URL}/api/workflow/v1/${path}${search}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const target = buildTargetUrl(slug, req.nextUrl.search);

  try {
    const backendRes = await fetch(target, { method: "GET", cache: "no-store" });
    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach workflow backend", target: WORKFLOW_BACKEND_URL },
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
    });

    const text = await backendRes.text();
    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach workflow backend", target: WORKFLOW_BACKEND_URL },
      { status: 502 },
    );
  }
}
