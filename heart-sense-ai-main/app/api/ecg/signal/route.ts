import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const flaskResponse = await fetch("http://localhost:5000/api/signal-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!flaskResponse.ok) {
      const errorData = await flaskResponse.json();
      return NextResponse.json(
        { error: errorData.error || "Signal extraction failed" },
        { status: flaskResponse.status },
      );
    }

    const data = await flaskResponse.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        error: "Connection failed",
        message:
          "Could not connect to the Flask backend at http://localhost:5000.",
      },
      { status: 502 },
    );
  }
}
