import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
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
