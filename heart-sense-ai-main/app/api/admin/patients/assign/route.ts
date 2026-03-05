import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";

// POST: Admin assigns a doctor to a patient
export async function POST(req: Request) {
  try {
    const admin = await getUserFromRequest();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { patientDbId, doctorId } = await req.json();

    if (!patientDbId || !doctorId) {
      return NextResponse.json({ message: "Missing required IDs" }, { status: 400 });
    }

    await dbConnect();

    // Check if patient exists
    const patient = await Patient.findById(patientDbId);
    if (!patient) {
      return NextResponse.json({ message: "Patient not found" }, { status: 404 });
    }

    // Check if doctor exists and has the correct role
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Invalid doctor selected" }, { status: 400 });
    }

    // Add doctor to assignedDoctors if not already there
    if (!patient.assignedDoctors.includes(doctorId)) {
      patient.assignedDoctors.push(doctorId);
      await patient.save();
    }

    return NextResponse.json({ 
      message: `Patient ${patient.fullName} successfully assigned to Dr. ${doctor.lastName}`,
      patient 
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error assigning doctor", error: error.message },
      { status: 500 }
    );
  }
}
