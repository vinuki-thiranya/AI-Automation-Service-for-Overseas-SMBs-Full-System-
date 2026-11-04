import { describe, expect, it } from "vitest";
import { chunkMarkdown, htmlToText, loadFaqSources } from "../src/faq.ts";
import { createHarness } from "../src/testing.ts";
import { demoConfig, TUESDAY_11AM_SYDNEY } from "./fixtures.ts";

describe("FAQ ingestion", () => {
  it("makes one chunk per question and drops the bare title", () => {
    const chunks = chunkMarkdown("# Clinic FAQ\n\n## Do you take new patients?\nYes.\n\n## Where do I park?\nStreet parking.", "faq.md");
    expect(chunks.map((c) => c.content)).toEqual(["## Do you take new patients?\nYes.", "## Where do I park?\nStreet parking."]);
  });

  it("splits long sections on paragraphs and keeps the heading", () => {
    const long = `## Prices\n\n${"a".repeat(600)}\n\n${"b".repeat(600)}`;
    const chunks = chunkMarkdown(long, "x");
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.content.startsWith("## Prices\n")).toBe(true);
  });

  it("strips HTML to readable text", () => {
    expect(htmlToText("<h2>Parking</h2><p>Two hours&nbsp;free</p><script>x()</script>")).toBe("## Parking\nTwo hours free");
  });

  it("loads the demo clinic FAQ and retrieves the right answer", async () => {
    const cfg = demoConfig();
    expect((await loadFaqSources(cfg)).length).toBe(9);
    const h = createHarness(cfg, { now: TUESDAY_11AM_SYDNEY });
    await h.loadFaq();
    const res = await h.receive("sms", "+61411111111", "Do you offer afterpay or instalments?");
    expect(res.turn?.replies[0]).toMatch(/Afterpay is available/);
  });
});
