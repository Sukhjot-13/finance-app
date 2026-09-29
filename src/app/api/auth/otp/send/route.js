// FILE: src/app/api/auth/otp/send/route.js
// Handles sending the One-Time Password via Brevo.

import { randomInt, randomUUID } from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { NextResponse } from "next/server";
import { TransactionalEmailsApi, SendSmtpEmail } from "@getbrevo/brevo";
import {
  recordHitAndCount,
  popLastHit,
  getClientIp,
} from "@/lib/rate-limit";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

// Sliding-window limits backed by MongoDB (shared across instances).
const EMAIL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_MAX = 5; // per email address
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_MAX = 20; // per IP — stops OTP-bombing many addresses at once

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

async function handlePOST(request) {
  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    await dbConnect();

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

    // Rate limiting — per email AND per sender IP, stored in MongoDB so the
    // counters are shared across instances and survive restarts. Recorded
    // BEFORE the decision (record-then-count) so concurrent bursts cannot
    // slip under the cap; slots are refunded below if the email send fails.
    const emailKey = `otp-send:${email.toLowerCase()}`;
    const ipKey = `otp-send-ip:${getClientIp(request)}`;
    const [emailRes, ipRes] = await Promise.all([
      recordHitAndCount(emailKey, EMAIL_WINDOW_MS, EMAIL_MAX),
      recordHitAndCount(ipKey, IP_WINDOW_MS, IP_MAX),
    ]);
    if (!emailRes.allowed || !ipRes.allowed) {
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
    // Plain-text alternative: some clients and spam filters penalize
    // HTML-only mail, and this keeps the code readable when HTML is blocked.
    sendSmtpEmail.textContent = `Your FinTrack login code is ${otp}. It expires in 10 minutes.`;

    try {
      // Send the email
      await apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (sendError) {
      // The stored code was never delivered — restore whatever pending OTP
      // existed before this request and refund both rate-limit slots.
      try {
        user.otp = previousOtp;
        user.otpExpires = previousOtpExpires;
        await user.save();
      } catch (restoreError) {
        console.error("OTP restore after failed send error:", restoreError.message);
        logServerError("OTP restore after failed send error", restoreError, { route: "POST /api/auth/otp/send" });
      }
      popLastHit(emailKey).catch(() => {});
      popLastHit(ipKey).catch(() => {});
      throw sendError;
    }

    return NextResponse.json(
      { message: "OTP sent successfully." },
      { status: 200 }
    );
  } catch (error) {
    // NEVER log the raw error object here. The Brevo SDK is Axios-based and
    // Axios errors carry `config.data` — the serialized SendSmtpEmail holding
    // the live 6-digit OTP in BOTH htmlContent and textContent. Logging the
    // whole object pushed a working OTP into the log sink on every Brevo
    // failure (quota, invalid sender, network blip). A request id gives
    // correlation without the payload.
    console.error(
      `OTP send failed [requestId=${randomUUID()}]:`,
      typeof error?.message === "string" ? error.message : "unknown error"
    );
    logServerError("OTP send failed", error, { route: "POST /api/auth/otp/send" });

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

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const POST = withManagerLogs(handlePOST);
