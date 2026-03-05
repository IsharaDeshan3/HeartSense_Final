import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Patient from "@/models/Patient";
import { getUserFromRequest } from "@/lib/auth";

// PATCH: Add a diagnostic history entry to a patient
export async function PATCH(
    req: Request,
    { params }: { params: { patientId: string } }
) {
    try {
        const user = await getUserFromRequest();
        if (!user || user.role !== "doctor") {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { type, summary, data } = await req.json();

        if (!type) {
            return NextResponse.json(
                { message: "Diagnostic type is required" },
                { status: 400 }
            );
        }

        await dbConnect();

        const patient = await Patient.findById(params.patientId);
        if (!patient) {
            return NextResponse.json(
                { message: "Patient not found" },
                { status: 404 }
            );
        }

        // Add the diagnostic entry with doctor attribution
        patient.diagnosticHistory.push({
            doctorId: user.userId,
            doctorName: user.email || "Unknown Doctor",
            type,
            summary: summary || "",
            data: data || {},
            date: new Date(),
        });

        // Auto-add this doctor to assignedDoctors if not already present
        const doctorIdStr = String(user.userId);
        const alreadyAssigned = patient.assignedDoctors.some(
            (id: any) => String(id) === doctorIdStr
        );
        if (!alreadyAssigned) {
            patient.assignedDoctors.push(user.userId);
        }

        await patient.save();

        return NextResponse.json({
            message: "Diagnostic entry saved",
            entry: patient.diagnosticHistory[patient.diagnosticHistory.length - 1],
        });
    } catch (error: any) {
        console.error("Diagnostic save error:", error);
        return NextResponse.json(
            { message: "Failed to save diagnostic entry", error: error.message },
            { status: 500 }
        );
    }
}
