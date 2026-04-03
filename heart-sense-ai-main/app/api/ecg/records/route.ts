import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const flaskResponse = await fetch("http://localhost:5000/api/ecg/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!flaskResponse.ok) {
      const errorData = await flaskResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Save failed", message: errorData.message },
        { status: flaskResponse.status },
      );
    }

    const data = await flaskResponse.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error("ECG Records Proxy Error:", error);
    return NextResponse.json(
      {
        error: "Connection failed",
        message: "Could not connect to the ECG backend.",
      },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const projection = searchParams.get("projection") || "doctor";

    if (projection === "admin" && user.role !== "admin") {
      return NextResponse.json(
        { message: "Admin access required" },
        { status: 403 },
      );
    }

    if (!patientId) {
      return NextResponse.json(
        { error: "Missing patientId query parameter" },
        { status: 400 },
      );
    }

    const flaskUrl = `http://localhost:5000/api/ecg/records/${encodeURIComponent(patientId)}?projection=${encodeURIComponent(projection)}`;
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
    console.error("ECG Records GET Proxy Error:", error);
    return NextResponse.json(
      {
        error: "Connection failed",
        message: "Could not connect to the ECG backend.",
      },
      { status: 502 },
    );
  }
}
