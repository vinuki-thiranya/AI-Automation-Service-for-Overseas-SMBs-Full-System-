"use server";
import { headers } from "next/headers";
import { safeNext } from "@/lib/redirect";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Enter the email address your clinic gave us, like jess@yourclinic.com.au." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const next = safeNext(String(form.get("next") ?? "/"));
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only people the agency has invited can sign in; unknown addresses don't create accounts.
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (/rate|too many|security purposes/i.test(error.message)) return { status: "error", message: "Too many sign-in emails in the last hour. Wait a few minutes, then try again." };
    if (/signups not allowed|not found|user/i.test(error.message)) return { status: "error", message: "That email doesn't have access yet. Ask your Nuvadesk contact to add you." };
    return { status: "error", message: `The sign-in email couldn't be sent: ${error.message}` };
  }
  return { status: "sent", email };
}
