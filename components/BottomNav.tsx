"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS } from "@/lib/nav-tabs";

// Mobile-app-style bottom tab bar — the primary nav surface on phone/iPad.
// Hidden at sm+ in favor of HeaderNav's inline links (a fixed bottom bar
// reads as a mobile-only pattern; on desktop it just floated over content
// with nothing to justify the persistent chrome). Fixed + safe-area
// padding for the iOS home indicator.
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl">
        {NAV_TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`text-lg transition ${active ? "scale-110" : ""}`}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
