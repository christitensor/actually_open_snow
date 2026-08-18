"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS } from "@/lib/nav-tabs";

// Desktop counterpart to BottomNav — inline text links in the header,
// hidden below sm where the fixed bottom tab bar takes over instead.
export default function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {NAV_TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-muted text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon} {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
