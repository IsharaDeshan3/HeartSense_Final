import { NextResponse } from "next/server";
import { networkInterfaces } from "os";
import { callStore } from "../signal/store";

function getNetworkIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

export async function POST() {
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const networkIp = getNetworkIp();
  const port = process.env.PORT || "3000";
  const joinUrl = `http://${networkIp}:${port}/call/${callId}`;

  callStore.set(callId, {
    createdAt: Date.now(),
    doctorSignals: [],
    patientSignals: [],
  });

  return NextResponse.json({ callId, joinUrl });
}
