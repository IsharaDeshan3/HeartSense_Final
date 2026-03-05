import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  try {
    const admin = await getUserFromRequest();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    
    // Fetch all users who are doctors
    const doctors = await User.find({ role: "doctor" }).sort({ createdAt: -1 });

    return NextResponse.json(doctors);
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error fetching staff", error: error.message },
      { status: 500 }
    );
  }
}

// For updating approval status
export async function PATCH(req: Request) {
  try {
    const admin = await getUserFromRequest();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { userId, isApproved } = await req.json();

    if (!userId) {
      return NextResponse.json({ message: "Missing User ID" }, { status: 400 });
    }

    await dbConnect();
    
    const user = await User.findByIdAndUpdate(
      userId, 
      { isApproved },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      message: `Doctor ${user.firstName} ${isApproved ? "approved" : "status updated"}`,
      user 
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error updating status", error: error.message },
      { status: 500 }
    );
  }
}
