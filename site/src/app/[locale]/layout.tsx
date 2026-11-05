import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Footer, contactEmail } from "@/components/footer";
import { Header } from "@/components/header";
import { JsonLd } from "@/components/json-ld";
import { LOCALE_INFO, LOCALES, isLocale, siteUrl } from "@/content/locales";
import "../globals.css";

// Figtree (body, UI) and Bricolage Grotesque (headings, figures, display), self-hosted at build.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap", fallback: ["system-ui", "sans-serif"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", axes: ["opsz"], fallback: ["system-ui", "sans-serif"] });

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Nuvadesk: an AI front desk for clinics", template: "%s | Nuvadesk" },
  openGraph: { siteName: "Nuvadesk", type: "website" },
};

export const viewport: Viewport = { themeColor: "#fbfbf8" };

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={LOCALE_INFO[locale].htmlLang} className={`${figtree.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Nuvadesk",
          url: siteUrl(),
          logo: `${siteUrl()}/icon.svg`,
          email: contactEmail(),
          description: "Nuvadesk installs AI front desks for dental and physio clinics: WhatsApp, SMS and web chat that answers, books and follows up.",
          areaServed: ["AU", "GB", "US"],
        }} />
        <Header locale={locale} />
        <main id="main">{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
