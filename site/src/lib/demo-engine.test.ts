import { describe, expect, it } from "vitest";
import { getDemoFacts } from "../content/demo-clinic";
import { OFFERED_TIMES, SUGGESTIONS, book, greeting, reply } from "./demo-engine";

// Runs against the real demo clinic files, so a price or hours change in config/clients shows up here.
const facts = getDemoFacts();

describe("site try-it demo", () => {
  it("reads the demo clinic's config", () => {
    expect(facts.clinic).toBe("Harbourside Dental");
    expect(facts.assistant).toBe("Ava");
    expect(facts.services.find((s) => s.name.startsWith("Check-up"))?.price).toBe(220);
    expect(facts.faq.length).toBeGreaterThan(5);
  });

  it("says it's a virtual assistant and that a person can take over", () => {
    expect(greeting(facts)).toMatch(/virtual assistant/);
    expect(greeting(facts)).toMatch(/person/);
  });

  it("answers every suggestion without handing over", () => {
    for (const s of SUGGESTIONS) expect(reply(s, facts).handedOver, s).toBeFalsy();
  });

  it("quotes prices from the price list only", () => {
    expect(reply("How much is a check-up?", facts).text).toMatch(/\$220.*gap-free/);
    expect(reply("how much is whitening", facts).text).toMatch(/free/);
    // Not on the list: no number is invented, the list is shown instead.
    expect(reply("How much is a crown?", facts).text).toMatch(/price list/);
  });

  it("answers opening hours from config, including closed days", () => {
    expect(reply("Are you open Saturday?", facts).text).toMatch(/9am to 1pm/);
    expect(reply("open on sunday?", facts).text).toMatch(/closed on Sundays/);
  });

  it("offers two times before booking, then confirms the chosen one", () => {
    const offer = reply("Book me in tomorrow", facts);
    expect(offer.times).toEqual(OFFERED_TIMES);
    const done = book(OFFERED_TIMES[0]!, facts);
    expect(done.booked).toBe(OFFERED_TIMES[0]);
    expect(done.text).toMatch(/^Booked: tomorrow at 8:15am with Dr Maya Chen/);
  });

  it("treats pain as urgent and points to 000 for severe symptoms", () => {
    const r = reply("I've got a toothache", facts);
    expect(r.times?.length).toBe(2);
    expect(r.text).toMatch(/000/);
  });

  it("routes cancellation questions to the policy, even when they mention a fee", () => {
    expect(reply("Can I avoid the late cancellation fee?", facts).text).toMatch(/24 hours/);
  });

  it("hands unknown questions and requests for a person to the team", () => {
    expect(reply("Do you sell gift cards for my aunt?", facts).handedOver).toBe(true);
    expect(reply("Can I speak to a person", facts).handedOver).toBe(true);
  });
});
