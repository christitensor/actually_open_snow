import type { Metadata } from "next";
import AccountSettings from "@/components/auth/AccountSettings";

export const metadata: Metadata = { title: "Account · Actually Open Snow" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">How you sign in, and where you&apos;re signed in.</p>
      </header>
      <AccountSettings />
    </div>
  );
}
