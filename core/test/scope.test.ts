import { describe, expect, it } from "vitest";
import { checkScope } from "../src/scope.ts";

describe("scope check (Prompt 6 change-request flagging)", () => {
  const A = ["A"];

  it("keeps Package A work in scope for a Package A client", () => {
    for (const r of [
      "Answer WhatsApp and SMS questions about prices and parking",
      "Book appointments into Cliniko",
      "Text back missed calls within a minute",
      "Hand over to the front desk when it can't answer",
      "Reminders the day before",
    ]) expect(checkScope(r, A), r).toMatchObject({ kind: "included", pkg: "A" });
  });

  it("flags the four items the Phase 4 rehearsal must catch", () => {
    expect(checkScope("An AI that answers the phone when we're busy", A)).toMatchObject({ kind: "add_on", addOn: "Voice agent" });
    expect(checkScope("Same setup for our second location in Manly", A)).toMatchObject({ kind: "change_request" });
    expect(checkScope("Send new leads into HubSpot", A)).toMatchObject({ kind: "needs_package", pkg: "B" });
    expect(checkScope("Take a deposit by card when someone books", A)).toMatchObject({ kind: "change_request" });
  });

  it("marks work the agency never does, even when it mentions bookings", () => {
    expect(checkScope("Redesign our website with online booking", A)).toMatchObject({ kind: "never" });
    expect(checkScope("Manage our Google ads", A)).toMatchObject({ kind: "never" });
    expect(checkScope("Reconcile the bank feed", A)).toMatchObject({ kind: "never" });
  });

  it("points other packages' work at the right package", () => {
    expect(checkScope("Put supplier invoices into Xero", A)).toMatchObject({ kind: "needs_package", pkg: "C" });
    expect(checkScope("Answer where-is-my-order emails from Shopify", A)).toMatchObject({ kind: "needs_package", pkg: "D" });
    expect(checkScope("Send new leads into HubSpot", ["A", "B"])).toMatchObject({ kind: "included", pkg: "B" });
  });

  it("flags anything it can't place for a person to price", () => {
    expect(checkScope("Print name badges for the team", A)).toMatchObject({ kind: "change_request" });
  });
});
