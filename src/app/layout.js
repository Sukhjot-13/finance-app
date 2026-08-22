import { Inter } from "next/font/google";
import "./globals.css";

// Pages must render per-request (not prerendered) so the proxy-generated
// CSP nonce is stamped onto Next's inline bootstrap scripts. Without this,
// static HTML ships without nonces and the strict script-src blocks them.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Finance Tracker",
  description: "Your personal finance command center.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
