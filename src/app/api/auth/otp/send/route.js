// FILE: src/app/api/auth/otp/send/route.js
// Handles sending the One-Time Password via Brevo.

import { randomInt } from "crypto";
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

  // Opportunistic sweep so abandoned emails don't grow the map forever
  if (otpAttempts.size > 1000) {
    for (const [key, stamps] of otpAttempts) {
      if (stamps.every(timestamp => now - timestamp >= 60 * 60 * 1000)) {
        otpAttempts.delete(key);
      }
    }
  }
  return true;
}

/**
 * Refunds a rate-limit slot when the email send itself failed — service
 * outages shouldn't burn the user's quota.
 */
function refundRateLimit(email) {
  const key = String(email).toLowerCase();
  const attempts = otpAttempts.get(key);
  if (!attempts || attempts.length === 0) return;
  attempts.pop();
  if (attempts.length === 0) otpAttempts.delete(key);
}

// Per-IP cap: stops one address from OTP-bombing many different emails.
// (Per-email caps alone leave the SENDER unlimited.) 20 sends/hour/IP.
const MAX_PER_IP_PER_HOUR = 20;
const ipAttempts = new Map();

function checkIpRateLimit(ip) {
  const now = Date.now();
  const attempts = ipAttempts.get(ip) || [];
  const recent = attempts.filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_PER_IP_PER_HOUR) return false;
  recent.push(now);
  ipAttempts.set(ip, recent);
  // Opportunistic sweep
  if (ipAttempts.size > 1000) {
    for (const [key, stamps] of ipAttempts) {
      if (stamps.every((t) => now - t >= 60 * 60 * 1000)) ipAttempts.delete(key);
    }
  }
  return true;
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Finds a user by email. New accounts are always stored lowercased; the
 * exact-match fallback keeps legacy mixed-case signups reachable.
 */
async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalized });
  if (!user && email !== normalized) {
    user = await User.findOne({ email });
  }
  return user;
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

    // Check rate limiting (per email AND per IP)
    if (!checkRateLimit(email.toLowerCase())) {
      return NextResponse.json(
        { message: "Too many OTP requests. Please wait before trying again." },
        { status: 429 }
      );
    }
    const clientIp = getClientIp(request);
    if (!checkIpRateLimit(clientIp)) {
      return NextResponse.json(
        { message: "Too many OTP requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    // Cryptographically secure 6-digit OTP (Math.random() is predictable)
    const otp = randomInt(100000, 1000000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = await findUserByEmail(email);
    if (!user) {
      user = new User({ email: email.trim().toLowerCase() });
    }

    // Remember any still-pending OTP so a failed email send can restore it
    // instead of destroying a code the user may already be typing.
    const previousOtp = user.otp;
    const previousOtpExpires = user.otpExpires;

    user.otp = otp;
    user.otpExpires = otpExpires;
    try {
      await user.save();
    } catch (saveError) {
      if (saveError.code === 11000) {
        // Concurrent signup race: another request created this user between
        // our findOne and save — refetch and set the OTP on that document.
        user = await findUserByEmail(email);
        if (!user) throw saveError;
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();
      } else {
        throw saveError;
      }
    }

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

    try {
      // Send the email
      await apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (sendError) {
      // The stored code was never delivered — restore whatever pending OTP
      // existed before this request and give the rate-limit slot back.
      try {
        user.otp = previousOtp;
        user.otpExpires = previousOtpExpires;
        await user.save();
      } catch (restoreError) {
        console.error("OTP restore after failed send error:", restoreError.message);
      }
      refundRateLimit(email);
      throw sendError;
    }

    return NextResponse.json(
      { message: "OTP sent successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("OTP Send Error:", error);

    // Don't expose internal errors to the client (message can be undefined
    // for non-Error throws).
    const rawMessage = typeof error?.message === "string" ? error.message : "";
    const message = rawMessage.includes("BREVO_API_KEY")
      ? "Email service configuration error. Please contact support."
      : "Failed to send OTP. Please try again later.";

    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
