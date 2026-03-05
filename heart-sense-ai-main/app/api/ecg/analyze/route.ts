import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Proxy the request to the Flask backend
    const flaskResponse = await fetch("http://localhost:5000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!flaskResponse.ok) {
      const errorData = await flaskResponse.json();
      return NextResponse.json(
        { error: errorData.error || "Flask backend failed", message: errorData.message },
        { status: flaskResponse.status }
      );
    }

    const data = await flaskResponse.json();
    
    // Add a flag to indicate it came through the proxy
    return NextResponse.json({
      ...data,
      processed_by: "flask-fallback-proxy"
    });

  } catch (error: any) {
    console.error("ECG Proxy Error:", error);
    return NextResponse.json(
      { 
        error: "Connection failed", 
        message: "Could not connect to the Flask backend at http://localhost:5000. Please ensure the Flask app is running." 
      },
      { status: 502 }
    );
  }
}
