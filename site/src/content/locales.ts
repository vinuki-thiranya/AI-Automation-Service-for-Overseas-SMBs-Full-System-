// en-AU is the primary market (spec §2) and is served without a prefix; en-GB and en-US live under
// /en-gb and /en-us. Copy is shared; only these details change per market.
export const LOCALES = ["en-au", "en-gb", "en-us"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-au";

export interface LocaleInfo {
  hreflang: string;
  htmlLang: string;
  label: string;
  country: string;
  messagingLaw: string;          // consent rules we follow for marketing messages
  healthCover: string;           // how patients pay
  practiceSystems: string;       // what clinics there commonly use
  clinicWord: string;            // "practice" vs "clinic" phrasing in headlines
  spellOptimise: string;
  emergency: string;
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  "en-au": {
    hreflang: "en-AU", htmlLang: "en-AU", label: "Australia", country: "Australia",
    messagingLaw: "the Spam Act 2003", healthCover: "health funds and HICAPS",
    practiceSystems: "Cliniko, Google Calendar or your online booking page", clinicWord: "clinic",
    spellOptimise: "optimise", emergency: "000",
  },
  "en-gb": {
    hreflang: "en-GB", htmlLang: "en-GB", label: "United Kingdom", country: "the UK",
    messagingLaw: "PECR and UK GDPR", healthCover: "private patients and insurers",
    practiceSystems: "Cliniko, Microsoft Bookings or your online booking page", clinicWord: "practice",
    spellOptimise: "optimise", emergency: "999",
  },
  "en-us": {
    hreflang: "en-US", htmlLang: "en-US", label: "United States", country: "the US",
    messagingLaw: "the TCPA", healthCover: "insurance",
    practiceSystems: "Acuity, Calendly, Google Calendar or your online booking page", clinicWord: "practice",
    spellOptimise: "optimize", emergency: "911",
  },
};

export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

/** Public URL path for a page in a locale: AU has no prefix. */
export function localePath(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

/** canonical + hreflang alternates for a page that exists in every locale. */
export function alternates(locale: Locale, path = "/") {
  const base = siteUrl();
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_INFO[l].hreflang] = `${base}${localePath(l, path)}`;
  languages["x-default"] = `${base}${localePath(DEFAULT_LOCALE, path)}`;
  return { canonical: `${base}${localePath(locale, path)}`, languages };
}
