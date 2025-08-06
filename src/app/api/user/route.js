//src/app/api/user/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { getSession } from "@/lib/auth";

// GET current user's details
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  await dbConnect();

  try {
    const user = await User.findById(session.userId).select(
      "email accountName"
    );
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT (update) user's accountName
export async function PUT(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  await dbConnect();
  const { accountName } = await request.json();

  if (!accountName) {
    return NextResponse.json(
      { message: "Account name is required" },
      { status: 400 }
    );
  }

  try {
    const user = await User.findByIdAndUpdate(
      session.userId,
      { accountName },
      { new: true, runValidators: true }
    ).select("email accountName");

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
