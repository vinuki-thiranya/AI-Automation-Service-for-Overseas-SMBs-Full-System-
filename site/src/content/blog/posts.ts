// Published posts, newest first. A post is live only when it's listed here (see CALENDAR.md).
import type { ComponentType } from "react";

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;       // ISO
  query: string;      // the search it answers
}

export const POSTS: (PostMeta & { load: () => Promise<{ default: ComponentType }> })[] = [
  {
    slug: "after-hours-message-templates",
    title: "An after-hours message for your dental practice (with templates)",
    description: "Copy-and-paste after-hours messages for SMS, WhatsApp, voicemail and website chat, plus how to word the emergency part safely.",
    date: "2026-11-05",
    query: "after hours message dental practice",
    load: () => import("./after-hours-message-templates.mdx"),
  },
  {
    slug: "ai-receptionist-cost",
    title: "What an AI receptionist costs a clinic, line by line",
    description: "Setup, running costs and usage: every line of what an AI receptionist costs a clinic, with real prices and the questions to ask any vendor.",
    date: "2026-11-05",
    query: "AI receptionist cost clinic",
    load: () => import("./ai-receptionist-cost.mdx"),
  },
  {
    slug: "missed-calls-dental-clinic",
    title: "How to stop missing patient calls at your dental clinic",
    description: "Five practical ways to catch the patients you lose to missed calls, from your phone reports to texting back every missed call within seconds.",
    date: "2026-11-05",
    query: "missed calls dental clinic",
    load: () => import("./missed-calls-dental-clinic.mdx"),
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
