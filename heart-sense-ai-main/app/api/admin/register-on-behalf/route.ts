import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const adminUser = await getUserFromRequest();

    // Only allow admins to use this route
    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json(
        { message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { firstName, lastName, email, password, role, identifier } = await req.json();

    if (!firstName || !lastName || !email || !password || !role || !identifier) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { identifier }] });
    if (existingUser) {
      return NextResponse.json(
        { message: "Email or Identifier already registered" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role, // Can be 'doctor' or 'admin'
      identifier,
      isApproved: true, // Trusted registration
    });

    return NextResponse.json(
      { 
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully by admin`,
        user: { 
          id: user._id, 
          firstName: user.firstName, 
          lastName: user.lastName, 
          email: user.email, 
          role: user.role 
        } 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Admin Registration Error:", error);
    return NextResponse.json(
      { message: "Server error during admin-initiated registration", error: error.message },
      { status: 500 }
    );
  }
}
