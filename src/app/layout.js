import { Inter } from "next/font/google";
import "./globals.css";

// Pages must render per-request (not prerendered) so the proxy-generated
// CSP nonce is stamped onto Next's inline bootstrap scripts. Without this,
// static HTML ships without nonces and the strict script-src blocks them.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export const metadata = {
  title: "Finance Tracker",
  description: "Your personal finance command center.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FinTrack",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-emerald-500/30 selection:text-emerald-300`}>
        {children}
      </body>
    </html>
  );
}
