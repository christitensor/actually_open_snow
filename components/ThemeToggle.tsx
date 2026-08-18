"use client";

import { useSyncExternalStore } from "react";
import { getIsDarkServerSnapshot, getIsDarkSnapshot, subscribeToTheme } from "@/lib/theme";

// Pairs with the beforeInteractive script in app/layout.tsx, which sets
// .dark or .light on <html> before first paint (no flash of the wrong
// theme). This component reads that class via useSyncExternalStore so the
// toggle's own classList mutation (not React state) is what drives re-renders.
export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribeToTheme, getIsDarkSnapshot, getIsDarkServerSnapshot);

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next ? "dark" : "light");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      className="btn-secondary h-9 w-9 rounded-full !p-0 text-base"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
