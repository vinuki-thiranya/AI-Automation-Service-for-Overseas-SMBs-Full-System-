# SEO: Search Console and the first 10 backlinks

Spec Prompt 5. What is already built into the site, what to do on launch day, and where to get the first links.
Everything here is free. The only paid prerequisite is the domain, which is deferred to the pre-launch gate (PLAN §9).

## Already in the site

| Item | Where |
| --- | --- |
| Keyword-led title and meta description per page | `generateMetadata` in each `site/src/app/[locale]/**/page.tsx` |
| JSON-LD: Organization (every page), Service (package pages), FAQPage (home, packages, verticals), BlogPosting (posts) | `site/src/components/json-ld.tsx` and the pages |
| `sitemap.xml` with hreflang alternates (en-AU, en-GB, en-US, x-default); blog is en-AU only | `site/src/app/sitemap.ts` |
| `robots.txt` pointing at the sitemap | `site/src/app/robots.ts` |
| One URL per page: en-AU at the root, `/en-au/*` redirects (308) to it; canonicals on every page | `site/src/proxy.ts`, `alternates()` in `site/src/content/locales.ts` |
| Open Graph image | `site/src/app/[locale]/opengraph-image.tsx` |
| 12-post calendar, 3 posts published | `site/src/content/blog/CALENDAR.md` |
| Checks | `node scripts/site-smoke.ts` (CI) and `node scripts/lighthouse.ts` (local, mobile 95+) |

Set `NEXT_PUBLIC_SITE_URL` to the real domain (e.g. `https://nuvadesk.ai`) in the hosting environment before the first
production build: canonicals, hreflang, the sitemap and the OG image all use it.

## Search Console, on launch day

1. Go to [search.google.com/search-console](https://search.google.com/search-console) with the agency Google account
   and choose **Add property → Domain**. Enter the bare domain (`nuvadesk.ai`, no `https://`, no `www`). A Domain
   property covers every subdomain and both protocols, so the en-GB and en-US paths are in the same property.
2. Google shows a `TXT` record (`google-site-verification=…`). Add it at the DNS host (Cloudflare: **DNS → Records →
   Add record**, type `TXT`, name `@`, content as given, TTL Auto). Back in Search Console, click **Verify**. DNS can
   take from a minute to a few hours; if it fails, wait and click Verify again. Keep the record forever: removing it
   removes access.
3. **Sitemaps** (left menu): submit `https://<domain>/sitemap.xml`. Status should become "Success" with 49
   discovered URLs (15 pages × 3 regions, plus the blog index and 3 posts).
4. **URL inspection**: paste the home page URL, then **Request indexing**. Repeat for `/packages`,
   `/packages/receptionist`, `/for/dental` and `/for/physio`. There is a daily quota, so do the money pages first; the
   rest are picked up from the sitemap.
5. After 3–7 days, check:
   - **Pages** (indexing report): the pages above are "Indexed". "Duplicate without user-selected canonical" on a
     `/en-au/...` URL means something links to the prefixed form; it should not happen (it redirects), so check the
     link.
   - **Structured data**: paste a package page and a blog post into
     [search.google.com/test/rich-results](https://search.google.com/test/rich-results); it should find the
     Organization, Service, FAQPage or BlogPosting data with no errors. (Google shows FAQ rich results for only a
     few kinds of site, so don't expect them in the results page; the data still describes the page.)
   - **Core Web Vitals**: needs real traffic, so it stays empty at first. That's normal.
6. Do the same in [Bing Webmaster Tools](https://www.bing.com/webmasters): **Import from Google Search Console** copies
   the verified site and the sitemap in one step.
7. Monthly (10 minutes, put it on the ops calendar): Performance report → **Queries**. Note queries with impressions
   but a low position (8–20). Those are the next blog posts or FAQ entries. Feed them into `CALENDAR.md`.

## The first 10 backlinks

These were chosen for a business that is **run from Sri Lanka and serves clinics remotely**. That rules out the
usual Australian local-SEO list. Google Business Profile is for businesses that meet customers in person, and
Yellow Pages, True Local and similar sites list one business per street address. Listing Nuvadesk at an address it
doesn't trade from would be inaccurate and against their terms. So the list below is B2B agency directories that
Australian buyers browse, plus partner sites in the clinic software world.

Each entry was checked on 2026-11-05 against the site itself, or, where the site blocks automated reads (marked "via
search"), against current third-party guides. Fees and rules change, so look at the signup page before you start.
All are free; skip any upgrade or "featured listing" offers.

| # | Site | Why it helps | Cost and requirements (checked 2026-11-05) | When |
| --- | --- | --- | --- | --- |
| 1 | **LinkedIn company page** (linkedin.com/company/setup/new) | The page founders and practice managers check first; links back to the site | Free; needs a personal LinkedIn account | Launch week |
| 2 | **Clutch** (clutch.co/get-listed) | The B2B agency directory most buyers use; profiles rank for "AI automation agency Australia" type searches | Basic profile is free ("Create a Free Profile"); unverified providers are listed below verified ones, and reviews from clients raise the ranking | Launch week, then ask every client for a Clutch review |
| 3 | **GoodFirms** (goodfirms.co → Get Listed) | Second large agency directory, with AI and automation categories | Free listing; paid "PRO" is badges and ad placement only (via search) | Launch week |
| 4 | **DesignRush** (designrush.com → Get Listed) | Agency directory with a strong domain; each listing gets a dashboard | Agency submission; check that the free tier is still offered at signup (pricing not published) (via search) | Launch week |
| 5 | **Crunchbase** (crunchbase.com → Resources → Create Profile) | A company record that search engines and AI assistants pick up | Free for any registered user; search first so you don't create a duplicate | Launch week |
| 6 | **Trustpilot Business** (business.trustpilot.com) | Reviews that show in search results; AU consumers recognise it | Free business profile; you claim it with a business email | After the first client goes live |
| 7 | **Cliniko connected apps** (cliniko.com/connected-apps) | Cliniko is used by many AU physio and allied-health clinics; a listing puts Nuvadesk in front of exactly the target buyer | No public signup form; ask at info@cliniko.com once the Cliniko booking integration is live for a real client (the page notes most listed apps are third-party) | After the first Cliniko client |
| 8 | **Make partner directory** (make.com/solution-partners) | A directory of automation agencies, searchable by country and service | Free to join once you qualify; requires Make's partner training; directory tiers are earned by results | Only if Make is used for a client build |
| 9 | **n8n Expert Partners** (n8n.io/expert-partners) | n8n runs the orchestration layer, so this is a real match | Closed pilot with a waitlist; asks for 3+ active n8n customers, and the listed regions don't include Australia yet. Join the waitlist now; it costs nothing | Waitlist now, apply after 3 clients |
| 10 | **Guest posts and podcasts in AU dental and physio practice management** | The highest-value links: same buyers, editorial context | Free. Pitch one of the published posts as a guest article, or "what we learned answering 1,000 after-hours messages" once there's real data. Find targets with the queries below | Month 2 onwards |

For #10, search `"write for us" dental practice management Australia`, `physio clinic business podcast Australia`
and `"practice manager" newsletter Australia guest`. Prefer sites where the article is the point, and skip any that
charge for a "sponsored post".

### Rules for every listing

- **Same name, URL, email and description everywhere.** Use "Nuvadesk", `https://<domain>`, hello@<domain>, and the
  one-line description from the site's Organization JSON-LD. Inconsistency weakens every listing.
- **Location:** list the real country of operation (Sri Lanka) and set "markets served" or "service area" to
  Australia, the UK and the US where the directory offers it.
- **No paid links, link exchanges or directory networks.** They break Google's spam policies and can cost the whole
  site its rankings.
- **No invented results.** Profiles and case studies only claim what the dashboard numbers show (the same rule as
  the site).
- Track each listing (site, URL, login owner, date) in the ops sheet so they can be updated when prices or packages
  change.
