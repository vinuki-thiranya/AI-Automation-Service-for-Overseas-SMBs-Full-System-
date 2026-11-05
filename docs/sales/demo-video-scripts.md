# Two demo videos (spec §9: "two recorded demos on a fake clinic")

Record with OBS Studio (free) or Loom's free plan, at 1080p, with your face in a corner if you're comfortable. Use the fictional Harbourside Dental demo, and say early on that it's a fictional clinic. Keep each under 2 minutes; cut anything that doesn't move the story.

**Setup before recording:** the website running (http://localhost:3001, or the live site later) and the dashboard signed in as the agency demo user (`node scripts/dev-login.ts agency.demo@example.com`). Close other tabs and notifications.

## Video 1: "The 9:47 pm patient" (for prospects; about 90 seconds)

| Time | Screen | Say |
|---|---|---|
| 0:00 | Website hero, the 9:47 pm conversation | "It's 9:47 at night. Your front desk went home at six. A patient with a sore tooth messages you. Here's what happens." |
| 0:10 | Scroll to "Ask our demo clinic something", tap "I've got a toothache" | "This is Harbourside Dental, a fictional demo clinic running the same rules a real clinic would." |
| 0:25 | The reply with two times; tap 8:15am; the slot fills in marigold | "It answers from the clinic's own price list, offers two real times, and books one. No guessing, no made-up prices." |
| 0:45 | Tap "Do you take my health fund?" | "Questions your team answers fifty times a week get answered the same way every time." |
| 1:00 | Type "Can I speak to a person?" | "And anything unusual goes straight to your team with a summary. Patients always know it's a virtual assistant." |
| 1:15 | The missed-calls calculator, with your own numbers | "Move these sliders to your own week. If even one more patient a week books, it's paid for itself." |
| 1:25 | Book-a-call button | "Live in 14 days, fixed price. Book a 20-minute call and I'll show you on your own clinic." |

## Video 2: "What the owner sees on Monday" (for owners and practice managers; about 2 minutes)

| Time | Screen | Say |
|---|---|---|
| 0:00 | Dashboard overview, 30 days | "This is what a clinic owner sees. One sentence on top: how many patients were answered and booked, and how many came in while you were closed." |
| 0:15 | Hover the KPI info buttons | "Every number says exactly how it's counted, so nobody has to take it on trust." |
| 0:30 | The heatmap; click a dark after-hours square | "Each square is an hour of the week. These are the evenings your phone used to ring out. Click one and you're reading those conversations." |
| 0:50 | Open a conversation in the side panel | "Every message is here and searchable for a year. You can see exactly what the assistant said, and when your team took over." |
| 1:10 | Ctrl+K, type "parking" | "Looking for something? Search it." |
| 1:20 | Northside Physio → Approvals; approve one, show Undo | "For clinics that answer support emails, drafts wait here for one-click approval, with 5 seconds to change your mind." |
| 1:40 | Back to overview | "Your team gets a short training session and this dashboard on day 13. Book a call and I'll show it with your numbers." |

**After recording:** upload both, add the links to the website (`NEXT_PUBLIC_HERO_VIDEO` takes a looping clip of video 1's first 10 seconds) and to the outbound follow-ups.
