import { LogOut } from "lucide-react";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getMemberships, getUser, isAgency, type Membership } from "@/lib/data";
import { ClientSwitcher } from "./client-switcher";
import { Shell, type NavItem } from "./shell";
import { ThemeToggle, type Theme } from "./theme-toggle";

export async function AppFrame({ current, nav, children }: { current: Membership | null; nav: NavItem[]; children: ReactNode }) {
  const [memberships, agency, user, cookieStore] = await Promise.all([getMemberships(), isAgency(), getUser(), cookies()]);
  const saved = cookieStore.get("theme")?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "system";
  return (
    <Shell
      nav={nav}
      header={<ClientSwitcher current={current} memberships={memberships} agency={agency} />}
      footer={
        <>
          <ThemeToggle initial={theme} />
          <form action="/auth/signout" method="post">
            <button className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-ink-muted hover:bg-gumleaf hover:text-ink">
              <LogOut size={18} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </form>
          {user?.email && <p className="truncate px-3 pt-2 text-xs text-ink-muted" title={user.email}>{user.email}</p>}
        </>
      }
    >
      {children}
    </Shell>
  );
}
