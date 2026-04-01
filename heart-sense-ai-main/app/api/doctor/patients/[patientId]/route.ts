import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

/**
 * DELETE /api/doctor/patients/[patientId]
 *
 * Removes a patient from the system.  Only doctors can delete patients.
 * Also cleans up associated analysis data in Supabase (best-effort).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ message: "Patient ID is required" }, { status: 400 });
    }

    await dbConnect();

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json({ message: "Patient not found" }, { status: 404 });
    }

    // --- Best-effort Supabase cleanup ---
    // Delete analysis_payloads, kra_outputs, ora_outputs linked to this patient's sessions.
    // This uses the patient's MongoDB _id which was stored as patient_id in workflow sessions.
    try {
      const analysisBackendUrl = process.env.NEXT_PUBLIC_WORKFLOW_BACKEND_URL || "http://127.0.0.1:8080";
      await fetch(`${analysisBackendUrl}/api/workflow/v1/patient/${patientId}/cleanup`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cleanupErr) {
      // Non-fatal: patient is still removed from MongoDB even if Supabase cleanup fails
      console.warn("Supabase cleanup failed (non-fatal):", cleanupErr);
    }

    // --- Remove from MongoDB ---
    await Patient.findByIdAndDelete(patientId);

    return NextResponse.json({
      message: "Patient removed successfully",
      patientId,
    });
  } catch (error: any) {
    console.error("Patient deletion error:", error);
    return NextResponse.json(
      { message: "Error removing patient", error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/doctor/patients/[patientId]
 *
 * Fetch a single patient by MongoDB _id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { patientId } = await params;
    await dbConnect();

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json({ message: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json(patient);
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error fetching patient", error: error.message },
      { status: 500 }
    );
  }
}
