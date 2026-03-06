import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

// GET: Fetch all patients
export async function GET() {
  try {
    const user = await getUserFromRequest();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    let patients;
    if (user.role === "doctor") {
      // Doctors can see all patients (shared access)
      patients = await Patient.find({}).sort({ createdAt: -1 });
    } else {
      // Admins can see all patients but NOT confidential medical data
      patients = await Patient.find({})
        .select("-medicalData")
        .sort({ createdAt: -1 });
    }

    return NextResponse.json(patients);
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error fetching patients", error: error.message },
      { status: 500 }
    );
  }
}

// POST: Create a new patient (doctors only)
export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest();

    if (!user || user.role !== "doctor") {
      return NextResponse.json(
        { message: "Only doctors can register patients" },
        { status: 403 }
      );
    }

    const { fullName, patientId, age, gender, contact } = await req.json();

    if (!fullName || !patientId || !age || !gender || !contact) {
      return NextResponse.json(
        { message: "Missing required patient fields" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Check for duplicate patient ID
    const existingPatient = await Patient.findOne({ patientId });
    if (existingPatient) {
      return NextResponse.json(
        { message: "Patient ID already exists in system" },
        { status: 409 }
      );
    }

    const patient = await Patient.create({
      fullName,
      patientId,
      age,
      gender,
      contact,
      createdBy: user.userId,
      // Auto-assign the creating doctor
      assignedDoctors: [user.userId],
    });

    return NextResponse.json(
      { message: "Patient registered successfully", patient },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Patient Registration Error:", error);
    return NextResponse.json(
      { message: "Server error during patient registration", error: error.message },
      { status: 500 }
    );
  }
}
