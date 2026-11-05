"use client";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useState } from "react";

export type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Theme: match device", light: "Theme: day", dark: "Theme: after hours" };

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : SunMoon;
  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      document.cookie = "theme=; path=/; max-age=0; samesite=lax";
    } else {
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }
  return (
    <button type="button" onClick={cycle} className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-ink-muted hover:bg-brand-soft hover:text-ink">
      <Icon size={18} aria-hidden="true" />
      <span>{LABEL[theme]}</span>
    </button>
  );
}
