# Go-live checklist (day 12)

Work down the list on the morning of go-live, in the clinic's timezone, at a quiet time (not Monday morning). Each step says how to check it. Stop and roll back (last section) if a check fails and can't be fixed in 15 minutes.

## The day before

- [ ] UAT signed off, or every open issue fixed and re-tested (`uat-checklist.md`).
- [ ] Live QA on the client's config passed ≥ 48/50: `npm run qa -- --live --config config/clients/<id>.json` (report in `qa/reports/`).
- [ ] `client.json` has no `REPLACE_WITH_` placeholders: `node scripts/new-client.ts config/clients/<id>.json` shows no warnings except ones you've decided to accept.
- [ ] `"status"` in `client.json` changes from `"uat"` to `"live"`, then re-run `new-client.ts --apply`. (A client moves `staging` → `uat` when it goes to the clinic for testing.)
- [ ] Meta templates approved (the dry run lists them).
- [ ] The clinic's deposit is paid and the go-live invoice is ready to send.

## Go-live

- [ ] **WhatsApp:** the clinic's number is registered on the Cloud API, and the webhook is verified (a message from your phone appears in the dashboard within seconds).
- [ ] **SMS:** a text to the number gets a reply.
- [ ] **Missed calls:** conditional forwarding is on at the clinic's phone provider. Call, let it ring out, and receive the text.
- [ ] **Website chat:** the snippet is on the clinic's site; a chat from the live site works.
- [ ] **Booking:** book a test appointment, see it in the calendar, then cancel it.
- [ ] **Hand-over:** ask for a person; the staff phone gets the card; take it and reply.
- [ ] **Consent text:** the marketing consent and STOP wording are live, matching `compliance` in `client.json`.
- [ ] **Monitoring:** the Uptime Kuma monitor for `/in/<id>/health` is green; a test error reaches the Telegram alerts group.
- [ ] **Dashboard:** owner and staff accounts invited (`scripts/invite-user.ts`); both can sign in.
- [ ] **Reports:** the weekly report is scheduled for the agreed day and time.

## First-day watch

- [ ] Check the dashboard at the clinic's lunchtime and close of business. Read every conversation from day one.
- [ ] Every hand-over was taken. If one wasn't, call the practice manager the same day.
- [ ] Note anything to tune and do it the next morning; re-run QA before any prompt change (CLAUDE.md rule 5).
- [ ] Send the go-live invoice (50%), and the care plan starts on the 1st (pro-rated).

## Roll back (if something can't be fixed in 15 minutes)

1. Turn off conditional forwarding at the phone provider (missed calls go back to voicemail).
2. Remove the website chat snippet, or set `channels.webchat.enabled` to `false` and re-apply.
3. Pause the client (`"status": "paused"`, then re-apply) or point the WhatsApp webhook away; patients get the clinic's normal handling.
4. Tell the practice manager what happened and the new go-live time, in writing.
