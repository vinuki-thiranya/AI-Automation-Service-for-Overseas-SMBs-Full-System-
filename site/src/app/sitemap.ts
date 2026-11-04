import type { MetadataRoute } from "next";
import { POSTS } from "@/content/blog/posts";
import { LOCALE_INFO, LOCALES, localePath, siteUrl } from "@/content/locales";
import { PACKAGES } from "@/content/packages";
import { VERTICALS } from "@/content/verticals";

// Every localised page once per locale, each with its hreflang alternates; blog posts are en-AU only.
const LOCALISED = ["/", "/packages", ...PACKAGES.map((p) => `/packages/${p.slug}`), ...VERTICALS.map((v) => `/for/${v.slug}`),
  "/case-studies", "/about", "/contact", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const languages = (path: string) => Object.fromEntries([
    ...LOCALES.map((l) => [LOCALE_INFO[l].hreflang, `${base}${localePath(l, path)}`]),
    ["x-default", `${base}${localePath("en-au", path)}`],
  ]);
  const pages = LOCALISED.flatMap((path) => LOCALES.map((l) => ({
    url: `${base}${localePath(l, path)}`,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : path.startsWith("/packages") || path.startsWith("/for") ? 0.8 : 0.5,
    alternates: { languages: languages(path) },
  })));
  const blog = [
    { url: `${base}/blog`, changeFrequency: "weekly" as const, priority: 0.6 },
    ...POSTS.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.date, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
  return [...pages, ...blog];
}
