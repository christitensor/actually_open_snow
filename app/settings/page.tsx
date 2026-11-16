import type { Metadata } from "next";
import ViewSettings from "@/components/settings/ViewSettings";
import { resorts } from "@/data/resorts";

export const metadata: Metadata = { title: "Settings · Actually Open Snow" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Choose your resorts and how pages are laid out.</p>
      </header>
      <ViewSettings resorts={resorts.map((r) => ({ id: r.id, name: r.name, region: r.region }))} />
    </div>
  );
}
