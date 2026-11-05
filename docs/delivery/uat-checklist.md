# Client acceptance test (UAT) checklist

Days 8–9 of the build (spec §6.3). The clinic tests on the **test number** before go-live, using their own phones. Send this as a shared checklist; the practice manager ticks each line or writes what went wrong. The contract gives 5 business days for acceptance; silence counts as accepted, so agree a finish date when you send it.

**Before you send it:** internal QA has passed (`npm run qa -- --config config/clients/<id>.json`, 50 conversations, ≥ 48/50 with the live model), the test number is connected, and the hand-over phones have each received a test message.

Clinic: ____________________ Test number: ____________________ Finish by: ____________

## Answers (do these from a personal phone, by WhatsApp and by SMS)

- [ ] Ask "Are you open on Saturday?" The answer matches your hours.
- [ ] Ask the price of your most common appointment. It quotes your price list exactly.
- [ ] Ask about a treatment that isn't on your price list. It doesn't make up a price; it offers a consultation or hands over.
- [ ] Ask where to park. The answer is right.
- [ ] Ask about health funds or payment options. The answer matches your policy.
- [ ] The first reply says it's the clinic's virtual assistant.

## Bookings (use a made-up name; we'll delete these bookings afterwards)

- [ ] Book a check-up. It offers real free times from your calendar, and the booking appears in the right calendar.
- [ ] Ask for a time you know is taken. It doesn't offer it.
- [ ] As a new patient, try to book late in the day. It only offers times before your new-patient cutoff.
- [ ] Move the booking to another day. The calendar updates.
- [ ] Cancel the booking. It explains your cancellation policy first, then cancels.
- [ ] The reminder arrives at the time you chose (we can trigger it early for the test).

## After hours and emergencies

- [ ] Message outside opening hours. It says you're closed and still offers to book.
- [ ] Describe a dental emergency after hours. It gives your exact emergency instructions and doesn't give clinical advice.

## Hand-overs to your team

- [ ] Ask to speak to a person. Your hand-over phone receives a summary card within a minute.
- [ ] Tap "I'll take it" and reply. The patient gets your reply, and the assistant stays quiet in that conversation for 2 hours.
- [ ] Nobody takes it for 10 minutes. The backup person is alerted.

## Missed calls

- [ ] Call the clinic number and let it ring out. A text arrives within a minute offering to help by message.

## Opting out

- [ ] Reply STOP. It confirms you're unsubscribed, and nothing else is sent. Reply START to opt back in.

## Dashboard and reports

- [ ] Sign in to the dashboard with the link from the invite email. Your test conversations are there and searchable.
- [ ] Staff accounts can see conversations but not billing.
- [ ] The owner received a daily summary (if chosen).

## Sign-off

Anything that didn't work, with the time you tried it:

| What you did | What happened | Time |
|---|---|---|
| | | |

- [ ] Everything above works, or the issues listed have been fixed and re-tested.

Accepted by: ____________________ Date: ____________
