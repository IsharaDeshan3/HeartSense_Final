import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import AccessRequest from "@/models/AccessRequest";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  try {
    const admin = await getUserFromRequest();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const requests = await AccessRequest.find({ status: "pending" })
      .populate("patientId", "fullName patientId")
      .populate("doctorId", "firstName lastName email identifier")
      .sort({ createdAt: -1 });

    return NextResponse.json(requests);
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error fetching requests", error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await getUserFromRequest();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { requestId, status } = await req.json();

    if (!requestId || !status) {
      return NextResponse.json({ message: "Missing data" }, { status: 400 });
    }

    await dbConnect();

    const request = await AccessRequest.findById(requestId);
    if (!request) {
      return NextResponse.json({ message: "Request not found" }, { status: 404 });
    }

    request.status = status;
    await request.save();

    if (status === "approved") {
      // Find patient and add doctor
      const patient = await Patient.findById(request.patientId);
      if (patient && !patient.assignedDoctors.includes(request.doctorId)) {
        patient.assignedDoctors.push(request.doctorId);
        await patient.save();
      }
    }

    return NextResponse.json({ message: `Access ${status}` });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Operation failed", error: error.message },
      { status: 500 }
    );
  }
}
