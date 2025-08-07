// src/app/page.js
import { verifyAuth } from "@/lib/auth"; // Import the actual function
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await verifyAuth();
  if (session.user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
