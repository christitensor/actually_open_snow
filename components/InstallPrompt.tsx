"use client";

// PERS-07 (issue #23): a one-time card on a first visit explaining how to
// save the app to the home screen. PERS-08's welcome covers signed-in
// users after the passkey step, but a signed-out first visit — exactly
// when someone is most likely to bookmark-and-lose the app — had nothing,
// and the install steps themselves were only mentioned inside the
// wake-up form (PERS-06), where most people never see them.
//
// Behavior: hidden when already running standalone (installed), hidden
// forever after dismissal (localStorage), and only shown where there's
// something to act on — iOS Safari gets Share-sheet instructions,
// Android browsers without an install prompt get menu instructions, and
// anywhere `beforeinstallprompt` fires gets a real Install button.

import { useEffect, useState } from "react";

const DISMISS_KEY = "aos:install-prompt-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Variant = "ios" | "prompt" | "android-menu";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function InstallPrompt() {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Private mode / storage blocked: showing the card is harmless.
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVariant("prompt");
    };
    const onInstalled = () => setVariant(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Give beforeinstallprompt a moment to fire first (it's the better
    // UX); fall back to written instructions where no prompt exists.
    const timer = setTimeout(() => {
      setVariant((v) => {
        if (v) return v;
        if (isIos()) return "ios";
        if (/android/i.test(navigator.userAgent)) return "android-menu";
        return v;
      });
    }, 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  if (!variant) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to persist; the card still closes for this session.
    }
    setVariant(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setVariant(null);
    } else {
      dismiss();
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6"
      role="dialog"
      aria-label="Save Actually Open Snow to your home screen"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl"
            aria-hidden="true"
          >
            🏔️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Put Actually Open Snow on your Home Screen
            </p>
            {variant === "ios" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Tap the <strong className="text-foreground">Share</strong>{" "}
                button, then{" "}
                <strong className="text-foreground">
                  Add to Home Screen
                </strong>
                . It opens full-screen like an app — and it&apos;s how powder
                wake-up alerts work on iPhone.
              </p>
            )}
            {variant === "android-menu" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Tap the <strong className="text-foreground">⋮ menu</strong>,
                then{" "}
                <strong className="text-foreground">Install app</strong> (or
                Add to Home screen). It opens full-screen like an app, with
                powder wake-up alerts.
              </p>
            )}
            {variant === "prompt" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Install it as an app: full-screen, one tap from your Home
                Screen, and powder wake-up alerts can reach you.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {variant === "prompt" && (
                <button
                  type="button"
                  onClick={install}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Install
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
              >
                {variant === "prompt" ? "Not now" : "Got it"}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
