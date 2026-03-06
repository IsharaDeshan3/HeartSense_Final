import { NextResponse } from "next/server";

const LAB_BACKEND_URL = "http://localhost:8000";

/**
 * Proxy route for forwarding analyzed lab data to the lab backend.
 * Accepts { diabeticData?, heartData?, patientHistory? } keyed by patientId.
 */
export async function POST(req: Request) {
  try {
    const { diabeticData, heartData, patientHistory } = await req.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const results: Record<string, any> = {};

    // 1. POST diabetic data if available
    if (diabeticData) {
      try {
        const res = await fetch(`${LAB_BACKEND_URL}/api/diabetic/`, {
          method: "POST",
          headers,
          body: JSON.stringify(diabeticData),
        });
        if (res.ok) results.diabetic = await res.json();
      } catch (e) {
        console.warn("Lab backend diabetic endpoint failed:", e);
      }
    }

    // 2. POST heart data if available
    if (heartData) {
      try {
        const res = await fetch(`${LAB_BACKEND_URL}/api/heart/`, {
          method: "POST",
          headers,
          body: JSON.stringify(heartData),
        });
        if (res.ok) results.heart = await res.json();
      } catch (e) {
        console.warn("Lab backend heart endpoint failed:", e);
      }
    }

    // 3. POST patient history if available
    if (patientHistory) {
      try {
        const res = await fetch(`${LAB_BACKEND_URL}/api/patient-history`, {
          method: "POST",
          headers,
          body: JSON.stringify(patientHistory),
        });
        if (res.ok) results.history = await res.json();
      } catch (e) {
        console.warn("Lab backend patient-history endpoint failed:", e);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Lab Proxy Error:", error);
    return NextResponse.json(
      { error: "Lab proxy failed", message: error.message },
      { status: 500 }
    );
  }
}
