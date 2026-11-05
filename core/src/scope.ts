// Scope check for a deal (spec §12 Prompt 6: "flag anything outside the package scope so I can price it as a
// change request"). Each requirement line is matched against what the packages include (spec §3), in order:
// never-included work first, then known change requests, then the voice add-on, then Packages D, C, B, A.
// It's a first pass for the proposal, not a contract: anything it can't place is flagged for a person to price.

export type PackageLetter = "A" | "B" | "C" | "D";

export type ScopeVerdict =
  | { kind: "included"; pkg: PackageLetter; why: string }
  | { kind: "needs_package"; pkg: PackageLetter; why: string }
  | { kind: "add_on"; pkg: PackageLetter; addOn: string; why: string }
  | { kind: "never"; why: string }
  | { kind: "change_request"; why: string };

type Rule = { re: RegExp; why: string };

const NEVER: Rule[] = [
  { re: /\b(redesign|rebuild|new) (our |the )?(web ?site|site)\b|\bweb ?site redesign\b/i, why: "website design isn't included" },
  { re: /\bmobile app\b|\b(ios|android) app\b|\bcustom (web )?app\b|\bpatient (portal|app)\b/i, why: "custom web or mobile apps aren't included" },
  { re: /\bseo\b|\bsearch rankings?\b|\b(manage|run|set up) (our )?(google |facebook |meta )?ads\b|\bads? management\b/i, why: "ads and SEO work isn't included" },
  { re: /\b(write|writing) (our )?(blog|content|posts|newsletter)|\bsocial media posts?\b|\bcontent writing\b/i, why: "content writing isn't included" },
  { re: /\b(bank|banking|payroll)\b/i, why: "nothing that needs bank or payroll access" },
];

const CHANGE_REQUEST: Rule[] = [
  { re: /\b(second|another|other|multiple|2nd|two|three) (locations?|clinics?|sites?|branches|practices)\b/i, why: "a second location means a second configuration: quote it separately" },
  { re: /\b(take|taking|collect|charge) (a )?(payments?|deposits?|card)|\bstripe\b|\bpay(ment)? (link|online)\b|\bprepay/i, why: "taking payments isn't part of any package" },
  { re: /\btelehealth\b|\bvideo (call|consult)/i, why: "telehealth isn't part of any package" },
  { re: /\btranslat|\b(mandarin|cantonese|vietnamese|arabic|hindi|spanish|greek|italian|korean)\b/i, why: "extra languages need their own testing: quote the work" },
  { re: /\bcustom (report|dashboard)\b|\b(bi|power bi|looker)\b/i, why: "custom reporting beyond the dashboard and weekly report" },
  { re: /\bmedical records?\b|\bclinical notes?\b|\btreatment plans?\b|\bdiagnos/i, why: "clinical records and advice stay out of scope (PHI minimisation)" },
];

const VOICE: Rule = { re: /\b(answers?|answering|picks? up) (the )?(phone|phones|calls)\b|\bphone (agent|receptionist|bot)\b|\bvoice\b|\bai (that )?(talks|speaks) on the phone\b/i, why: "an AI that answers phone calls is the voice add-on" };

const PACKAGE_RULES: { pkg: PackageLetter; rules: Rule[] }[] = [
  { pkg: "D", rules: [
    { re: /\b(support|customer service) (emails?|tickets?|inbox)\b|\bhelp ?desk\b|\bgorgias\b|\bzendesk\b|\bfreshdesk\b/i, why: "support triage and drafted replies" },
    { re: /\border status\b|\bwhere is my order\b|\bshopify\b|\bwoocommerce\b|\breturns?\b|\brefunds?\b|\bchargebacks?\b/i, why: "order and policy questions from store data" },
  ] },
  { pkg: "C", rules: [
    { re: /\binvoices?\b|\breceipts?\b|\bxero\b|\bquickbooks\b|\bmyob\b|\bbookkeep/i, why: "invoice and receipt capture into the accounting system" },
    { re: /\bdocument collection\b|\bsigned (documents|forms)\b|\b(google drive|dropbox)\b/i, why: "document collection and filing" },
    { re: /\breview requests?\b|\bask (for|patients for) (a )?(google )?reviews?\b|\bgoogle reviews?\b/i, why: "review requests after a visit" },
  ] },
  { pkg: "B", rules: [
    { re: /\bleads?\b|\b(contact|enquiry|web) forms?\b|\bfacebook lead\b|\blanding pages?\b/i, why: "lead capture and a reply within 60 seconds" },
    { re: /\bqualif|\bscor(e|ing)\b|\bhot (leads?|enquiries)\b/i, why: "qualifying questions and lead scoring" },
    { re: /\bcrm\b|\bhubspot\b|\bpipedrive\b|\bgohighlevel\b|\bzoho\b/i, why: "writing leads into the CRM" },
    { re: /\bnurtur|\bfollow[- ]up (sequence|messages|emails)\b|\bpipeline report\b/i, why: "the 14-day follow-up and the pipeline report" },
  ] },
  { pkg: "A", rules: [
    { re: /\bmissed calls?\b|\btext(s|ing)? back\b|\bcall back\b/i, why: "missed-call text-back" },
    { re: /\bbook(ing|ings|s)?\b|\bappointments?\b|\breschedul|\bcancel|\bcalendar\b|\bcliniko\b|\bjane\b|\bacuity\b|\bcalendly\b|\breminders?\b|\bno[- ]shows?\b/i, why: "booking, changes and reminders in the calendar or practice system" },
    { re: /\bwhats ?app\b|\bsms\b|\btext messages?\b|\b(web ?site|web) chat\b|\bchat widget\b/i, why: "WhatsApp, SMS and website chat" },
    { re: /\bfaqs?\b|\bquestions?\b|\bopening hours\b|\bprices?\b|\bparking\b|\bhealth funds?\b|\binsurance\b/i, why: "answering common questions from the clinic's own information" },
    { re: /\bafter[- ]hours\b|\bweekends?\b|\bnight\b|\bemergenc/i, why: "after-hours mode and emergency routing" },
    { re: /\bhand ?(over|off)\b|\bescalat|\b(staff|team|person|human) (takes? over|steps? in)\b|\btake over\b/i, why: "hand-over to staff with a summary" },
    { re: /\bdaily (digest|summary|report)\b|\bweekly report\b|\bdashboard\b/i, why: "the daily digest, weekly report and dashboard" },
  ] },
];

export const PACKAGE_NAMES: Record<PackageLetter, string> = { A: "AI Receptionist", B: "Lead Qualifier", C: "Back-office Automation", D: "Support Triage" };

export function checkScope(requirement: string, owned: readonly string[]): ScopeVerdict {
  const text = requirement.trim();
  for (const r of NEVER) if (r.re.test(text)) return { kind: "never", why: r.why };
  for (const r of CHANGE_REQUEST) if (r.re.test(text)) return { kind: "change_request", why: r.why };
  if (VOICE.re.test(text)) return { kind: "add_on", pkg: "A", addOn: "Voice agent", why: VOICE.why };
  for (const { pkg, rules } of PACKAGE_RULES) {
    const hit = rules.find((r) => r.re.test(text));
    if (hit) return owned.includes(pkg) ? { kind: "included", pkg, why: hit.why } : { kind: "needs_package", pkg, why: hit.why };
  }
  return { kind: "change_request", why: "not something any package covers: price it, or say no" };
}
