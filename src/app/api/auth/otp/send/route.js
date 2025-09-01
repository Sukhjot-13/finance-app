// FILE: src/app/api/auth/otp/send/route.js
// ** THIS IS THE UPDATED FILE - ALIGNED WITH OFFICIAL DOCS **
// Handles sending the One-Time Password via Brevo.

import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { NextResponse } from "next/server";
import { TransactionalEmailsApi, SendSmtpEmail } from "@getbrevo/brevo";

// Simple in-memory rate limiting (in production, use Redis)
const otpAttempts = new Map();

function checkRateLimit(email) {
  const now = Date.now();
  const attempts = otpAttempts.get(email) || [];
  
  // Remove attempts older than 1 hour
  const recentAttempts = attempts.filter(timestamp => now - timestamp < 60 * 60 * 1000);
  
  if (recentAttempts.length >= 5) {
    return false; // Rate limited
  }
  
  recentAttempts.push(now);
  otpAttempts.set(email, recentAttempts);
  return true;
}

export async function POST(request) {
  try {
    await dbConnect();
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required." },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Check rate limiting
    if (!checkRateLimit(email)) {
      return NextResponse.json(
        { message: "Too many OTP requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email });
    }

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Instantiate the Brevo API client using named imports
    let apiInstance = new TransactionalEmailsApi();

    // Authenticate with your API key
    apiInstance.authentications["apiKey"].apiKey = process.env.BREVO_API_KEY;

    // Build the email message
    let sendSmtpEmail = new SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = { name: "FinTrack", email: process.env.EMAIL_FROM };
    sendSmtpEmail.subject = "Your FinTrack Login Code";
    sendSmtpEmail.htmlContent = `
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h1 style="color: #333;">Your One-Time Password</h1>
            <p style="font-size: 18px;">Your login code is:</p>
            <p style="font-size: 36px; font-weight: bold; letter-spacing: 5px; background: #f0f0f0; padding: 15px; border-radius: 8px;">${otp}</p>
            <p style="font-size: 14px; color: #777;">This code will expire in 10 minutes.</p>
        </div>
    `;

    // Send the email
    await apiInstance.sendTransacEmail(sendSmtpEmail);

    return NextResponse.json(
      { message: "OTP sent successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("OTP Send Error:", error);
    
    // Don't expose internal errors to the client
    const message = error.message.includes('BREVO_API_KEY') 
      ? "Email service configuration error. Please contact support."
      : "Failed to send OTP. Please try again later.";
      
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
