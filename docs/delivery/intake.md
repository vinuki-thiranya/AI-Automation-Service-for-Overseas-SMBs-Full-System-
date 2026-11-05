# Clinic intake questionnaire

Send this to the clinic after the deposit, before the kick-off call (spec §6.3, day 0). It takes the practice manager about 30 minutes. Every answer fills a field in the clinic's `client.json`; the arrow (→) on each question says which. On the kick-off call, go through anything left blank.

Write it to the clinic in their own words: "patients", "appointments", "the front desk". Never mention n8n, Supabase, prompts or API keys.

---

## 1. Your clinic

| Question | → client.json |
|---|---|
| Clinic name as patients know it | `name` |
| Registered business name (on invoices) | `business.legal_name` |
| Street address, including suburb and postcode | `business.address` (also sets `timezone`, `region`, `locale`) |
| Main phone number | `business.phone` |
| Front-desk email | `business.email` |
| Website | `business.website`, `channels.webchat.allowed_origins` |
| Link where patients leave a Google review (optional) | `business.google_review_url` |

## 2. Opening hours and closures

| Question | → client.json |
|---|---|
| Opening hours for each day, including lunch closures (for example Mon 8:00–12:30 and 13:30–18:00) | `business.hours` |
| Public holidays and planned closures in the next 12 months | `business.holidays` |
| When you're closed, should the assistant still book appointments for the next open day? (yes/no) | `assistant.after_hours.allow_booking` |
| What should a patient with an emergency do when you're closed? (your exact wording, e.g. a hospital line, plus "call 000 if it's life-threatening") | `assistant.after_hours.emergency_text` |

## 3. Appointments and prices

List each appointment type patients can book themselves.

| Question | → client.json |
|---|---|
| Name of the appointment, as patients say it | `business.services[].name` |
| How long it takes, in minutes | `business.services[].duration_minutes` |
| Price, or "from" price, or "free" (leave blank if you never quote it) | `business.services[].price`, `price_note` |
| Anything patients should know about the price (for example "gap-free with most health funds") | `business.services[].price_note` |
| Latest start time for a new patient's first appointment | `booking.new_patient_cutoff` |
| Which practitioners see patients, and which calendar each one uses | `booking.calendars[]` |

For dental clinics, map the appointments to the standard service ids the dental template and its 50 test conversations use, and add any others with new ids:

| Standard id | Usually called |
|---|---|
| `check-up-clean` | Check-up and clean |
| `new-patient-exam` | New patient exam (with x-rays) |
| `emergency` | Emergency appointment |
| `whitening-consult` | Whitening consultation |
| `invisalign-consult` | Invisalign / clear aligner consultation |

## 4. Your rules

| Question | → client.json |
|---|---|
| Cancellation policy (notice needed, any fee) | `business.policies.cancellation`, `cancellation_notice_hours` |
| How patients can pay (card, HICAPS, Afterpay, payment plans) | `business.policies.payment` |
| Health funds and insurance: do you claim on the spot? Bulk bill? | `business.policies.insurance` |
| Parking and how to find you | `business.parking` |
| Minimum notice for a booking (for example "at least 2 hours ahead") | `booking.min_notice_minutes` |
| How far ahead patients may book | `booking.max_days_ahead` |
| Gap you need between appointments | `booking.buffer_minutes` |
| Reminders: how long before the appointment (default 24 hours and 2 hours) | `booking.reminders_hours_before` |
| Your online booking link, if you have one | `booking.booking_link` |

## 5. Your team and hand-overs

When the assistant can't help, it hands the conversation to a person with a summary.

| Question | → client.json |
|---|---|
| Team members patients may ask about (name, role, one line about them) | `business.staff[]` |
| Who receives hand-overs: names and mobile numbers (WhatsApp) | `escalation.staff[]` |
| Backup person if nobody responds within 10 minutes (usually the owner) | `escalation.owner_backup`, `claim_timeout_minutes` |
| Hand-overs by WhatsApp to each person's phone, or into a Telegram group? | `escalation.channel` |

## 6. How patients reach you

| Question | → client.json |
|---|---|
| WhatsApp: use your existing business number, or a new one? (a number can only be on one WhatsApp account) | `channels.whatsapp` |
| SMS: the number patients text today, if any | `channels.sms` |
| Phones: who provides your phone line? (needed for missed-call text-back) | `channels.missed_call` |
| Website chat: who can add a small code snippet to your site? | `channels.webchat` |
| Email: should the assistant also answer the front-desk inbox? | `channels.email` |

## 7. The assistant's voice

| Question | → client.json |
|---|---|
| A first name for the assistant (it always says it's a virtual assistant) | `assistant.persona_name`, `disclosure_text` |
| Three words for how your front desk sounds (for example warm, brief, practical) | `assistant.tone` |
| Languages your patients write in | `assistant.languages` |
| Topics it must never discuss (we always add: diagnosis, medication, prices not on your list, other clinics) | `assistant.forbidden_topics` |
| Anything it must always do or say | `assistant.extra_rules` |

## 8. Reports

| Question | → client.json |
|---|---|
| Who gets the weekly report (emails) | `reporting.owner_emails` |
| Which day and time suits (default Monday 7:30am) | `reporting.weekly_day`, `weekly_time` |
| A daily summary as well? | `reporting.daily_digest` |
| Roughly what one booked appointment is worth to you (used only for the "estimated revenue" figure) | `reporting.revenue_per_booking` |

## 9. Privacy and marketing

| Question | → client.json |
|---|---|
| May the assistant ask patients if they'd like occasional tips and offers? (we use your wording, with STOP to opt out) | `compliance.marketing_consent_text` |
| How long to keep conversations (default 12 months) | `compliance.retention_months` |

## 10. Your top 10 questions

Write the ten questions patients ask most, and your answer to each, the way you'd say it on the phone. These become the clinic's FAQ (`config/clients/<id>.faq.md`, linked from `business.faq_sources`). Answers must be things the front desk would say anyway: no clinical advice.

## 11. Lead follow-up (Package B only)

| Question | → client.json |
|---|---|
| Where do new enquiries come from? (website form, Facebook ads, Google ads, email) | `lead_qualification.sources` |
| Three to five questions you'd ask a new enquiry, with the answers that make them a good fit | `lead_qualification.questions` |
| Who gets a message straight away about a hot lead? | `lead_qualification.hot_notify` |
| Where do you keep leads today (HubSpot, Pipedrive, a spreadsheet)? | `crm` |

---

## Access we need (kick-off checklist)

Tick each one on the kick-off call. Nothing here is a password sent by email.

- [ ] Calendar: share each practitioner's calendar with our Google account (or a Cliniko API key created by the clinic, sent through the secure link we provide).
- [ ] WhatsApp: admin access to your Meta Business account, or we create one with you on the call.
- [ ] Phones: your phone provider can forward unanswered calls (or send a missed-call notice) to our number.
- [ ] Website: someone who can paste the chat snippet into the site.
- [ ] Hand-over phones: each person on the hand-over list has said yes and will receive a test message.
- [ ] Reports: the emails above are correct.
