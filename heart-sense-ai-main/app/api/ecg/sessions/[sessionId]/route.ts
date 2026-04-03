import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json(
        { message: "Admin access required" },
        { status: 403 },
      );
    }

    const { sessionId } = await params;
    const { searchParams } = new URL(req.url);
    const projection = searchParams.get("projection") || "admin";

    const flaskUrl = `http://localhost:5000/api/ecg/sessions/${encodeURIComponent(sessionId)}?projection=${encodeURIComponent(projection)}`;
    const flaskResponse = await fetch(flaskUrl, { method: "GET" });

    const data = await flaskResponse.json().catch(() => ({}));
    if (!flaskResponse.ok) {
      return NextResponse.json(
        { error: data.error || "Fetch failed", message: data.message },
        { status: flaskResponse.status },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("ECG Session Detail Proxy Error:", error);
    return NextResponse.json(
      {
        error: "Connection failed",
        message: "Could not connect to the ECG backend.",
      },
      { status: 502 },
    );
  }
}
