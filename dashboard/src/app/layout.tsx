import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap", adjustFontFallback: false, fallback: ["system-ui", "sans-serif"] });

export const metadata: Metadata = {
  title: { default: "Nuvadesk", template: "%s · Nuvadesk" },
  description: "Your clinic's front desk: enquiries, bookings, conversations and approvals.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#131b2e" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en-AU" className={atkinson.variable} data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
