import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { isAgency } from "@/lib/data";

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  if (!(await isAgency())) notFound();
  return <AppFrame current={null} nav={[{ href: "/agency", label: "All clients", icon: "overview" }]}>{children}</AppFrame>;
}
