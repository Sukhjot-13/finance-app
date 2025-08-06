// src/app/page.js
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
