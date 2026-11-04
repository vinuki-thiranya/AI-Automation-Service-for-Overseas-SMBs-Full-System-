// Packages, care plans and terms, from docs/spec.md §3 (service catalogue) and §7 (price list).
// This file is the only place prices live on the site: change them here and nowhere else.

export type PackageSlug = "receptionist" | "lead-qualifier" | "back-office" | "support-triage";

export interface Package {
  slug: PackageSlug;
  letter: "A" | "B" | "C" | "D";
  name: string;
  price: number;                 // USD setup
  priceNote: string;
  summary: string;
  for: string;
  includes: string[];
  addOns?: { name: string; price: string }[];
  title: string;                 // SEO title (keyword-led)
  description: string;           // meta description
  faq: { q: string; a: string }[];
}

export const PACKAGES: Package[] = [
  {
    slug: "receptionist",
    letter: "A",
    name: "AI Receptionist",
    price: 2500,
    priceNote: "one-off setup",
    summary: "Answers WhatsApp, SMS and website chat, books straight into your calendar, and texts back every missed call.",
    for: "Clinics and practices that lose patients to unanswered phones and after-hours messages.",
    includes: [
      "Answers questions on WhatsApp, SMS and your website chat: hours, prices, location, health funds or insurance, parking.",
      "Books, reschedules and cancels appointments directly in your calendar or practice system.",
      "Missed-call text-back: anyone whose call goes unanswered gets a text within 30 seconds and can book by chat.",
      "Hands a conversation to your team with a summary whenever it can't answer.",
      "After-hours mode with its own wording and emergency directions.",
      "A daily digest for the owner: bookings made, enquiries handled, conversations handed over.",
    ],
    addOns: [{ name: "Voice agent: answers calls, books and transfers", price: "+ USD 1,000" }],
    title: "AI receptionist for clinics: WhatsApp, SMS and web chat booking",
    description: "An AI receptionist that answers patient messages, books into your calendar and texts back missed calls. USD 2,500 setup, live in 14 days.",
    faq: [
      { q: "Which calendars and practice systems does it book into?", a: "Google Calendar, Cliniko, Acuity, Microsoft Bookings and Calendly directly. For systems without a booking API, such as Jane, it sends your online booking link instead." },
      { q: "What happens when it doesn't know the answer?", a: "It tells the patient a team member will reply and sends your staff a summary on WhatsApp or SMS. Someone taps to take it, and the assistant stays out of that conversation for two hours." },
      { q: "Will it give medical advice?", a: "No. It's set up never to diagnose or advise on symptoms or medication. If someone describes an emergency, it gives your emergency wording and offers the next urgent slot." },
      { q: "Do patients know they're talking to an assistant?", a: "Yes. The first message in every conversation says so, and a person can step in at any time." },
    ],
  },
  {
    slug: "lead-qualifier",
    letter: "B",
    name: "Lead Qualifier and Follow-up",
    price: 2000,
    priceNote: "one-off setup",
    summary: "Replies to every new lead within 60 seconds, asks your qualifying questions, scores them and follows up for 14 days.",
    for: "Practices and agencies running ads or web forms where speed-to-lead decides who wins.",
    includes: [
      "Captures leads from web forms, Facebook Lead Ads, Google Ads landing pages and inbound email.",
      "Replies within 60 seconds by SMS, WhatsApp or email and asks 3 to 5 qualifying questions.",
      "Scores every lead hot, warm or cold and writes it into your CRM (HubSpot, Pipedrive, GoHighLevel or a Google Sheet) with the transcript.",
      "Books a call for hot leads and nurtures warm ones over a 14-day sequence.",
      "A weekly pipeline report with response times and conversion.",
    ],
    addOns: [{ name: "Each extra lead source beyond three", price: "+ USD 500" }],
    title: "Lead qualification and speed-to-lead follow-up automation",
    description: "Reply to every lead in under 60 seconds, qualify and score them, and nurture warm leads for 14 days. USD 2,000 setup.",
    faq: [
      { q: "How fast is the first reply?", a: "Within 60 seconds of the form or ad lead arriving, day or night." },
      { q: "Does it respect opt-outs?", a: "Yes. STOP, UNSUBSCRIBE and similar replies are honoured on every channel, and nurture messages only go to people who've agreed to them." },
    ],
  },
  {
    slug: "back-office",
    letter: "C",
    name: "Back-office Automation",
    price: 1500,
    priceNote: "per accounting system connected",
    summary: "Turns invoices and receipts into accounting entries, chases documents, asks happy customers for reviews and sends you the five numbers that matter.",
    for: "Owner-operators who spend evenings on admin.",
    includes: [
      "Invoice and receipt capture: emails and photos become line items in Xero, QuickBooks or MYOB.",
      "Document collection: reminders, then signed documents filed into Google Drive or Dropbox by client.",
      "Review requests after a completed job, with unhappy replies routed to you instead.",
      "A weekly email or Slack post with the five numbers you care about.",
    ],
    title: "Back-office automation: invoices, documents and review requests",
    description: "Automate receipt capture into Xero, QuickBooks or MYOB, document chasing and Google review requests. USD 1,500 setup.",
    faq: [
      { q: "Do you need access to our bank?", a: "No. We never take access to bank accounts or payroll. Receipts and invoices come from email and photos." },
    ],
  },
  {
    slug: "support-triage",
    letter: "D",
    name: "Support Triage",
    price: 3000,
    priceNote: "one-off setup, up to 2,000 tickets a month",
    summary: "Sorts every support email, answers order-status and policy questions, and drafts the rest for one-click approval in your help desk.",
    for: "Online stores whose support inbox eats into margin.",
    includes: [
      "Reads support emails and chats and sorts them: where is my order, return, damaged item, pre-sale question.",
      "Answers order-status and policy questions automatically from your Shopify or WooCommerce data.",
      "Drafts replies for complex cases in Gorgias, Zendesk or Freshdesk for one-click approval.",
      "Flags tickets with refund or chargeback risk to a person.",
    ],
    title: "AI support triage for e-commerce: Gorgias, Zendesk, Freshdesk",
    description: "Classify support tickets, answer order-status questions automatically and approve drafted replies in one click. USD 3,000 setup.",
    faq: [
      { q: "Does anything get sent without a person approving it?", a: "Only order-status and policy answers you've approved as automatic. Everything else waits as a draft in your help desk until someone approves, edits or rejects it." },
    ],
  },
];

export const BUNDLE = { name: "AI Receptionist + Lead Qualifier", letters: "A + B", price: 4000, note: "Our most common clinic setup. Saves USD 500." };

export const CARE_PLANS = [
  { name: "Keep-alive", price: 300, includes: ["Hosting, monitoring and API keys", "2 hours of changes a month", "Email support, reply within 24 hours"] },
  { name: "Grow", price: 600, includes: ["Everything in Keep-alive", "6 hours of changes a month", "Monthly review: tuning and new FAQ training"] },
  { name: "Partner", price: 1000, includes: ["Everything in Grow", "12 hours of changes a month", "One new automation a quarter", "Slack or WhatsApp support, reply within 4 hours", "Quarterly strategy call"] },
] as const;

export const TERMS = {
  carePlanMinimum: "Minimum 3 months, then month to month.",
  usage: "Model, SMS, voice and WhatsApp fees are passed through monthly at cost plus 20%, with a cap agreed up front (typically USD 50 to 150 a month). You can see the raw provider invoices any time.",
  extraHours: "Extra changes beyond your plan: USD 90 an hour.",
  payment: "50% deposit before we start, 50% at go-live.",
};

export const ALWAYS_INCLUDED = [
  "A 45-minute discovery call and a one-page written scope before any money changes hands.",
  "A 14-day build, a recorded walkthrough video and a 30-day bug-fix guarantee.",
  "A 60-minute recorded training session for your staff and a one-page quick guide.",
  "You own your data. Leave any time and take it with you.",
];

export const NEVER_INCLUDED = [
  "Custom websites or apps, or redesigning your current site.",
  "Paid-ads management, SEO or content writing.",
  "Anything that needs access to your bank or payroll.",
];

export const usd = (n: number) => `USD ${n.toLocaleString("en-US")}`;
export const packageBySlug = (slug: string) => PACKAGES.find((p) => p.slug === slug);
