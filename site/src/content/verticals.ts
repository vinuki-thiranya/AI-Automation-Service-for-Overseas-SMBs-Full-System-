// One page per vertical (spec Prompt 5: dental, physio, real estate, home services, law).
// Pains and fit come from spec §2. No invented statistics: every claim is about what the system does.
import type { Locale } from "./locales";
import type { PackageSlug } from "./packages";

export type VerticalSlug = "dental" | "physio" | "real-estate" | "home-services" | "law";

export interface Vertical {
  slug: VerticalSlug;
  name: string;                       // nav label
  title: (l: Locale) => string;       // keyword-led <title>
  description: (l: Locale) => string;
  headline: string;
  lede: string;
  person: string;                     // patient / buyer / customer / client
  moments: { title: string; body: string }[];
  packages: PackageSlug[];
  faq: { q: string; a: string }[];
}

const where = (l: Locale) => (l === "en-au" ? "Australia" : l === "en-gb" ? "UK" : "US");

export const VERTICALS: Vertical[] = [
  {
    slug: "dental",
    name: "Dental clinics",
    title: (l) => `AI receptionist for dental clinics ${where(l)}`,
    description: (l) => `Answer patient messages after hours, book check-ups straight into your diary and text back every missed call. Built for ${where(l)} dental clinics in 14 days.`,
    headline: "Every new patient enquiry answered, even at 9:47 pm.",
    lede: "Patients message when they think of it: after dinner, on Sunday, between meetings. Your assistant answers in seconds, books the check-up and leaves the tricky ones for your front desk in the morning.",
    person: "patient",
    moments: [
      { title: "The missed call during a procedure", body: "Within 30 seconds the caller gets a text: sorry we missed you, how can we help? Most just want a time, and they can book it by text." },
      { title: "The after-hours toothache", body: "It gives your emergency wording, offers the first emergency slot tomorrow, and never gives clinical advice." },
      { title: "The health-fund question", body: "Gap-free check-ups, Afterpay, HICAPS on the spot: it answers from your price list and policies, word for word." },
      { title: "The Invisalign enquiry from an ad", body: "With the Lead Qualifier, it asks about timing and budget, scores the lead and books the free consult for the hot ones." },
    ],
    packages: ["receptionist", "lead-qualifier"],
    faq: [
      { q: "Can it book new-patient exams only before a certain time?", a: "Yes. You set a cut-off (for example 4pm) and it only offers new-patient exams before then." },
      { q: "Does it work with our practice software?", a: "It books into Google Calendar, Cliniko, Acuity, Microsoft Bookings or Calendly directly. If your software has no booking API, it sends patients your online booking link." },
      { q: "What about patient privacy?", a: "It doesn't ask about symptoms, transcripts are deleted after 12 months, and health details can be redacted before they're stored." },
    ],
  },
  {
    slug: "physio",
    name: "Physio clinics",
    title: (l) => `AI receptionist for physiotherapy clinics ${where(l)}`,
    description: (l) => `Book initial consults and Pilates classes by WhatsApp and SMS, answer referral and health-fund questions, and recover missed calls. For ${where(l)} physio clinics.`,
    headline: "Your physios treat. Your front desk keeps answering.",
    lede: "When everyone's with a client, the phone rings out and the message waits. Your assistant books the initial consult, fills the class, and passes the WorkCover question to your coordinator with a summary.",
    person: "client",
    moments: [
      { title: "The running injury at 7 pm", body: "It books the next initial consultation and tells them to wear shorts. If it sounds like a fracture, it says to see a GP or go to emergency." },
      { title: "The class with one spot left", body: "Clinical Pilates, Saturday 9am: it books the spot and sends the reminder." },
      { title: "\"Do I need a referral?\"", body: "Answered from your own FAQ, consistently, every time." },
      { title: "The claim number", body: "WorkSafe, TAC or insurer questions go to your coordinator with the details already collected." },
    ],
    packages: ["receptionist"],
    faq: [
      { q: "Does it work with Cliniko?", a: "Yes. It books into Cliniko directly, using your practitioners' real availability." },
      { q: "Can it handle group classes?", a: "Yes, as long as the classes are bookable appointments in your system." },
    ],
  },
  {
    slug: "real-estate",
    name: "Real estate",
    title: () => "Lead response automation for real estate agents",
    description: () => "Reply to portal and ad enquiries in under 60 seconds, qualify buyers and vendors, and follow up for 14 days so warm leads don't go cold.",
    headline: "The agent who replies first gets the appraisal.",
    lede: "A vendor enquiry at 8 pm shouldn't wait until morning. Your assistant replies in under a minute, asks the qualifying questions you'd ask, and books the hot ones into your diary.",
    person: "lead",
    moments: [
      { title: "The appraisal request", body: "Address, timeframe, reason for selling: collected, scored and in your CRM before you've seen the email." },
      { title: "The buyer from the portal", body: "Pre-approval, budget, suburbs: asked politely, answered by chat, written to the lead record." },
      { title: "The warm lead", body: "A 14-day follow-up sequence that stops the moment they reply or opt out." },
    ],
    packages: ["lead-qualifier", "receptionist"],
    faq: [
      { q: "Which CRMs does it write to?", a: "HubSpot, Pipedrive, GoHighLevel or a Google Sheet, with the score and the full transcript." },
    ],
  },
  {
    slug: "home-services",
    name: "Home services",
    title: () => "Missed call text back for plumbers, electricians and HVAC",
    description: () => "When you're on the tools, every missed call gets a text within 30 seconds, the job details are collected by chat, and the quote visit is booked.",
    headline: "You're on the tools. The next job still gets booked.",
    lede: "Missed calls are missed jobs. Your assistant texts every missed caller within 30 seconds, gets the job details by chat, and books the quote visit.",
    person: "customer",
    moments: [
      { title: "The burst pipe", body: "It marks it urgent, collects the address and sends it straight to whoever's on call." },
      { title: "The quote request", body: "What, where and how soon: collected by text so you arrive knowing the job." },
      { title: "The review", body: "With Back-office Automation, a review request goes out after the job; unhappy replies come to you instead." },
    ],
    packages: ["receptionist", "back-office"],
    faq: [
      { q: "Do I need a new phone number?", a: "No. Your existing number forwards unanswered calls so we can text the caller back." },
    ],
  },
  {
    slug: "law",
    name: "Law firms",
    title: () => "Client intake automation for small law firms",
    description: () => "Answer enquiries, run your intake questions, collect documents and book consultations, without giving legal advice.",
    headline: "Intake that happens while you're in court.",
    lede: "New matters arrive at all hours. Your assistant answers the enquiry, asks your intake questions, collects documents and books the consultation, and never gives legal advice.",
    person: "client",
    moments: [
      { title: "The new enquiry", body: "Matter type, urgency and conflicts details collected before you call back." },
      { title: "The documents", body: "Reminders until they arrive, then filed into the right client folder." },
      { title: "The consultation", body: "Booked into your calendar with the intake summary attached." },
    ],
    packages: ["lead-qualifier", "back-office"],
    faq: [
      { q: "Will it give legal advice?", a: "No. It's set up to collect information and book consultations only, and to hand anything else to a person." },
    ],
  },
];

export const verticalBySlug = (slug: string) => VERTICALS.find((v) => v.slug === slug);
