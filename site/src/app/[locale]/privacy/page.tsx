import type { Metadata } from "next";
import { contactEmail } from "@/components/footer";
import { LOCALE_INFO, alternates, type Locale } from "@/content/locales";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: "Privacy policy", description: "How Nuvadesk handles personal information on this website and in the systems we run for clinics.", alternates: alternates(locale, "/privacy") };
}

// Written to match how the system actually works (supabase/migrations, core/src). It is a working draft:
// have it reviewed by a lawyer in each market before launch (PLAN.md §10). Meta business verification and
// the Google OAuth consent screen both need this page live on the real domain.
const UPDATED = "5 November 2026";

export default async function Privacy({ params }: Props) {
  const { locale } = await params;
  const info = LOCALE_INFO[locale];
  const email = contactEmail();
  const law = locale === "en-au" ? "the Australian Privacy Principles (Privacy Act 1988)" : locale === "en-gb" ? "UK GDPR and the Data Protection Act 2018" : "applicable US federal and state privacy laws";
  return (
    <article className="prose-post mx-auto px-5 pt-12 pb-20 sm:pt-16">
      <h1 className="display text-4xl">Privacy policy</h1>
      <p className="text-ink-muted">Last updated {UPDATED}.</p>

      <h2>Who we are</h2>
      <p>Nuvadesk builds and runs AI front-desk systems for clinics and small businesses. This policy covers this website and the systems we run for our clients. Questions: <a href={`mailto:${email}`}>{email}</a>.</p>

      <h2>This website</h2>
      <p>This site doesn&apos;t use analytics, advertising or tracking cookies. If you email us, we keep your message to reply and to manage our relationship with you. If you book a call, the booking is handled by Cal.com, which loads only when you choose to open it, under its own privacy policy.</p>

      <h2>Systems we run for clinics</h2>
      <p>When you message a clinic that uses Nuvadesk, the clinic is responsible for your information and we process it on their behalf, only to provide the service they&apos;ve asked for. We handle:</p>
      <ul>
        <li>your name, phone number and email address, and the channel you used (WhatsApp, SMS, website chat or email);</li>
        <li>the messages you exchange with the clinic&apos;s assistant and staff;</li>
        <li>appointment details: service, practitioner, date and time;</li>
        <li>for enquiries, your answers to the clinic&apos;s questions and a lead score;</li>
        <li>whether you&apos;ve agreed to marketing messages, or opted out.</li>
      </ul>
      <p>The assistant is set up not to ask about symptoms or medical history. Clinics can switch on redaction so health details you volunteer are removed before messages are stored.</p>

      <h2>How it&apos;s used</h2>
      <ul>
        <li>to answer your questions and book, change or cancel appointments;</li>
        <li>to send reminders and, only if you&apos;ve agreed, follow-up or marketing messages;</li>
        <li>to pass your conversation to a staff member when needed;</li>
        <li>to give the clinic reports on enquiries and bookings.</li>
      </ul>
      <p>Marketing messages follow {info.messagingLaw}. Reply STOP (or UNSUBSCRIBE) at any time and you won&apos;t receive any more.</p>

      <h2>Who else processes it</h2>
      <p>We use these providers to run the service, each under contract and only for that purpose: Supabase (database, in the clinic&apos;s region), Anthropic and OpenAI (AI models that read the conversation to reply), Meta (WhatsApp), Twilio (SMS and calls), Google (calendars and spreadsheets the clinic connects), Resend (email) and our hosting provider. We don&apos;t sell personal information or use it to train AI models.</p>

      <h2>How long it&apos;s kept</h2>
      <p>Conversation transcripts are deleted automatically after 12 months, or sooner if the clinic chooses. Booking and contact records are kept while the clinic is our client and deleted or returned when they leave.</p>

      <h2>Security</h2>
      <p>Each clinic&apos;s data is separated at the database level, so staff of one clinic can&apos;t see another&apos;s. Access is limited to the people who need it, credentials are stored encrypted, and incoming messages are checked to be genuine before they&apos;re processed.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your information under {law}. Ask the clinic directly, or email us at <a href={`mailto:${email}`}>{email}</a> and we&apos;ll help the clinic respond.</p>
    </article>
  );
}
