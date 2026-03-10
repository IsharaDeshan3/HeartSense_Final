import { NextRequest, NextResponse } from "next/server";
import { callStore } from "./store";

// POST: Store a signal for the other peer
export async function POST(req: NextRequest) {
  const { callId, role, signal } = await req.json();

  const session = callStore.get(callId);
  if (!session) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  // Doctor sends signals that patient will read, and vice versa
  if (role === "doctor") {
    session.doctorSignals.push(signal);
  } else {
    session.patientSignals.push(signal);
  }

  return NextResponse.json({ ok: true });
}

// GET: Retrieve pending signals for a role
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callId = searchParams.get("callId");
  const role = searchParams.get("role");

  if (!callId || !role) {
    return NextResponse.json({ error: "Missing callId or role" }, { status: 400 });
  }

  const session = callStore.get(callId);
  if (!session) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  // Return signals FROM the other peer and clear them
  let signals: unknown[] = [];
  if (role === "doctor") {
    // Doctor reads patient's signals
    signals = [...session.patientSignals];
    session.patientSignals = [];
  } else {
    // Patient reads doctor's signals
    signals = [...session.doctorSignals];
    session.doctorSignals = [];
  }

  return NextResponse.json({ signals });
}
