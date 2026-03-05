import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
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

    // Force role to doctor for public registration. 
    // Admins MUST be registered via the admin-only route.
    const userRole = "doctor";

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: userRole,
      identifier,
      isApproved: false, // Subject to admin verification
    });

    // Create token
    const token = signToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    const response = NextResponse.json(
      { 
        message: "Clinician registered successfully", 
        user: { 
          id: user._id, 
          firstName: user.firstName, 
          lastName: user.lastName, 
          email: user.email, 
          role: user.role,
          isApproved: user.isApproved
        } 
      },
      { status: 201 }
    );

    // Set cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json(
      { message: "Server error during registration", error: error.message },
      { status: 500 }
    );
  }
}
