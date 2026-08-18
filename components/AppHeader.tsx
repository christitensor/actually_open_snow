import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5 font-bold tracking-tight">
          <span className="text-lg">❄️</span>
          <span>Actually Open Snow</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
