import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const doctor = await getUserFromRequest();
    if (!doctor || doctor.role !== "doctor") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { idImage, licenseImage } = await req.json();

    if (!idImage || !licenseImage) {
      return NextResponse.json({ message: "Missing documents" }, { status: 400 });
    }

    await dbConnect();

    const updatedUser = await User.findByIdAndUpdate(
      (doctor as any)._id,
      {
        verificationIdBase64: idImage,
        verificationLicenseBase64: licenseImage,
      },
      { new: true }
    );

    return NextResponse.json({ message: "Documents uploaded successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Server error", error: error.message },
      { status: 500 }
    );
  }
}
