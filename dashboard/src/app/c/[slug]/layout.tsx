import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import type { NavItem } from "@/components/shell";
import { getAttentionCounts, getMembership } from "@/lib/data";

export default async function ClientLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const membership = await getMembership(slug);
  if (!membership) notFound();   // no access looks the same as no such client
  const counts = await getAttentionCounts(membership.client_id);
  const base = `/c/${slug}`;
  const nav: NavItem[] = [
    { href: base, label: "Overview", icon: "overview" },
    { href: `${base}/conversations`, label: "Conversations", icon: "conversations", count: counts.openEscalations, countLabel: "waiting for staff" },
  ];
  if (membership.packages.includes("D")) {
    nav.push({ href: `${base}/approvals`, label: "Approvals", icon: "approvals", count: counts.pendingDrafts, countLabel: "drafts to review" });
  }
  if (membership.role !== "staff") nav.push({ href: `${base}/billing`, label: "Billing", icon: "billing" });
  nav.push({ href: `${base}/help`, label: "Help", icon: "help" });
  return <AppFrame current={membership} nav={nav}>{children}</AppFrame>;
}
