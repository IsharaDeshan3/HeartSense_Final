import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // All doctors can view all patients (shared access)
    const patients = await Patient.find({}).sort({ updatedAt: -1 });

    return NextResponse.json(patients);
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error fetching patients", error: error.message },
      { status: 500 }
    );
  }
}
