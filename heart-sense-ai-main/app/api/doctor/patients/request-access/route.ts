import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import AccessRequest from "@/models/AccessRequest";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { patientDbId, reason } = await req.json();

    if (!patientDbId) {
      return NextResponse.json({ message: "Patient ID required" }, { status: 400 });
    }

    await dbConnect();

    // Check if request already exists
    const existingRequest = await AccessRequest.findOne({
      patientId: patientDbId,
      doctorId: doctor.userId,
      status: "pending"
    });

    if (existingRequest) {
      return NextResponse.json({ message: "Request already pending" }, { status: 409 });
    }

    const request = await AccessRequest.create({
      patientId: patientDbId,
      doctorId: doctor.userId,
      reason,
    });

    return NextResponse.json({ 
      message: "Access request transmitted to administrative council", 
      request 
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Failing to transmit request", error: error.message },
      { status: 500 }
    );
  }
}
