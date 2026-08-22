// src/app/page.js
import { verifyAuth } from "@/lib/auth"; // Import the actual function
import { redirect } from "next/navigation";
import SessionGate from "./session-gate";

export default async function RootPage() {
  const session = await verifyAuth();
  if (session.user) {
    redirect("/dashboard");
  }
  // No valid ACCESS token — but the refresh session may still be alive.
  // Let SessionGate try one silent refresh before sending anyone to /login,
  // so returning users aren't forced into a full OTP re-login.
  return <SessionGate />;
}
