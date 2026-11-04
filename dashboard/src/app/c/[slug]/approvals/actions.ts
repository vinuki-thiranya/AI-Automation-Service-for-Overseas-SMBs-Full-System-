"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export type DecideResult = { ok: true; status: "approved" | "rejected" } | { ok: false; message: string };

// The only write a dashboard user can make. decide_reply_draft checks access and that the draft is
// still pending, and writes the audit row; this action just passes the decision through.
export async function decideDraft(slug: string, id: string, action: "approve" | "reject", body?: string, note?: string): Promise<DecideResult> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("decide_reply_draft", { p_id: id, p_action: action, p_body: body ?? null, p_note: note ?? null });
  if (error) {
    if (/already decided/.test(error.message)) return { ok: false, message: "Someone on your team already dealt with this draft. The list has been refreshed." };
    if (/empty/.test(error.message)) return { ok: false, message: "The reply is empty. Write a reply or reject the draft." };
    return { ok: false, message: `The decision wasn't saved: ${error.message}` };
  }
  revalidatePath(`/c/${slug}/approvals`);
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, status: (data as { status: "approved" | "rejected" }).status };
}
