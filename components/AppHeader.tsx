import Link from "next/link";
import HeaderNav from "@/components/HeaderNav";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border">
      {/* Backdrop-filter on the same element as the sticky links can eat
          touches on iOS Safari (a known WebKit compositing bug) — keep the
          blur on an inert layer behind the content instead of on the header
          itself. */}
      <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-bold tracking-tight">
          Actually Open Snow
        </Link>
        <HeaderNav />
      </div>
    </header>
  );
}
