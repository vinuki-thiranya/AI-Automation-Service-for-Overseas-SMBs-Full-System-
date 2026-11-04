import type { Client } from "../config/index.ts";
import type { AppEnv } from "../env.ts";
import { getJsonSecret, type SecretResolver } from "../secrets.ts";
import type { FetchLike } from "../util.ts";
import { AcuityAdapter } from "./acuity.ts";
import { CalendlyAdapter } from "./calendly.ts";
import { ClinikoAdapter } from "./cliniko.ts";
import { LinkOutAdapter } from "./fake.ts";
import { GoogleCalendarAdapter, GoogleTokenSource } from "./google-calendar.ts";
import { MicrosoftBookingsAdapter } from "./microsoft-bookings.ts";
import type { BookingAdapter } from "./types.ts";

export async function createBookingAdapter(client: Client, env: AppEnv, secrets: SecretResolver, fetchFn: FetchLike): Promise<BookingAdapter | null> {
  const booking = client.config.booking;
  if (!booking) return null;
  const cred = () => {
    if (!booking.credential) throw new Error(`booking.credential is required for adapter ${booking.adapter}`);
    return booking.credential;
  };
  switch (booking.adapter) {
    case "google_calendar": {
      const { refresh_token } = await getJsonSecret<{ refresh_token: string }>(secrets, cred());
      const tokens = new GoogleTokenSource({ clientId: env.googleOAuth.clientId, clientSecret: env.googleOAuth.clientSecret, refreshToken: refresh_token }, fetchFn);
      return new GoogleCalendarAdapter(client.config, tokens, fetchFn);
    }
    case "cliniko":
      return new ClinikoAdapter(client.config, await secrets.get(cred()), env.opsEmail, fetchFn);
    case "acuity":
      return new AcuityAdapter(client.config, await getJsonSecret<{ user_id: string; api_key: string }>(secrets, cred()), fetchFn);
    case "microsoft_bookings":
      return new MicrosoftBookingsAdapter(client.config, await getJsonSecret(secrets, cred()), fetchFn);
    case "calendly":
      return new CalendlyAdapter(client.config, await secrets.get(cred()), fetchFn);
    case "jane":
    case "link":
      return new LinkOutAdapter(booking.adapter);
  }
}
