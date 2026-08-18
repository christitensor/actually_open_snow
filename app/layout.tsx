import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Actually Open Snow",
  description: "An open-data ski/snow forecast app for Northern Utah & Southeast Idaho — resorts and backcountry.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

// Fully automatic light/dark — no manual toggle, always follows the OS/
// browser setting. Sets .dark/.light on <html> before first paint (avoids
// a flash of the wrong theme), then keeps listening for live OS-level
// changes for the rest of the session (e.g. the device switching to dark
// mode at sunset while the app is still open) — components read the class
// via lib/theme.ts's useSyncExternalStore + MutationObserver, so they pick
// up either the initial paint or a later live change the same way.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    localStorage.removeItem("theme"); // clear any override from a previous build's manual toggle
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    var apply = function (isDark) {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(isDark ? "dark" : "light");
    };
    apply(mql.matches);
    mql.addEventListener("change", function (e) { apply(e.matches); });
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <AppHeader />
        {/* min-w-0, not flex/flex-col: main only ever wraps one child, and
            making main itself a flex container turned that child into a
            flex item — which by default won't shrink below its widest
            descendant's content size (a wide table further down the tree),
            ballooning the whole page's width instead of letting that one
            table scroll on its own. flex-1 alone still grows main to fill
            body's column layout without that side effect. */}
        <main className="min-w-0 flex-1 pb-20 sm:pb-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
