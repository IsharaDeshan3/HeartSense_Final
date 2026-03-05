import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const identifier = searchParams.get("id"); // NIC or Passport

    if (!identifier) {
      return NextResponse.json({ message: "Identifier required" }, { status: 400 });
    }

    await dbConnect();

    // Find patient by unique ID
    const patient = await Patient.findOne({ patientId: identifier });

    if (!patient) {
      return NextResponse.json({ message: "No patient found with this identifier" }, { status: 404 });
    }

    const isAssigned = patient.assignedDoctors.includes(doctor.userId);

    if (isAssigned) {
      return NextResponse.json({ 
        type: "assigned", 
        patient 
      });
    } else {
      // Return limited info if not assigned
      return NextResponse.json({ 
        type: "unassigned",
        patient: {
          _id: patient._id,
          fullName: patient.fullName,
          patientId: patient.patientId,
          gender: patient.gender,
          age: patient.age
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { message: "Search failed", error: error.message },
      { status: 500 }
    );
  }
}
