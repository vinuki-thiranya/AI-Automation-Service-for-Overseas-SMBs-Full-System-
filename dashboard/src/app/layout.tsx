import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

// Figtree (body, UI) and Bricolage Grotesque (headings, figures, display), self-hosted at build.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap", fallback: ["system-ui", "sans-serif"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", axes: ["opsz"], fallback: ["system-ui", "sans-serif"] });

export const metadata: Metadata = {
  title: { default: "Nuvadesk", template: "%s · Nuvadesk" },
  description: "Your clinic's front desk: enquiries, bookings, conversations and approvals.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1c2b" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en-AU" className={`${figtree.variable} ${bricolage.variable}`} data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
