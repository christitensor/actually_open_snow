"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePreferences } from "@/lib/preferences/context";
import { useFavorites } from "@/lib/favorites";
import ResortPicker from "@/components/onboarding/ResortPicker";
import SpotTutorial from "@/components/onboarding/SpotTutorial";

// First-sign-in welcome (PERS-08):
//   1. Pick your resorts (stars = your home view).
//   2. How to save your own backcountry spots.
// Opens by itself once per account: when signed in, the account's settings
// have loaded, it hasn't been finished or skipped (prefs.onboarded, which
// syncs, so it won't reappear on your other devices), and the "create your
// passkey" prompt isn't showing. Can be reopened at either step with
// openWelcome().

type Step = "resorts" | "spots";
const OPEN_EVENT = "aos:open-welcome";

export function openWelcome(step: Step = "resorts") {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: step }));
}

export default function Welcome() {
  const { status, offerPasskey } = useAuth();
  const { prefs, accountLoaded, update } = usePreferences();
  const { favorites } = useFavorites();
  const [manualStep, setManualStep] = useState<Step | null>(null);
  const [step, setStep] = useState<Step>("resorts");
  const dialogRef = useRef<HTMLDivElement>(null);

  const autoOpen = status === "signed-in" && accountLoaded && !prefs.onboarded && !offerPasskey;
  const open = manualStep != null || autoOpen;
  const starred = favorites.filter((f) => f.source === "resort").length;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const s = ((e as CustomEvent).detail as Step) ?? "resorts";
      setStep(s);
      setManualStep(s);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = () => {
    setManualStep(null);
    setStep("resorts");
    if (!prefs.onboarded) update({ onboarded: true });
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[90dvh] w-full max-w-lg flex-col rounded-b-none outline-none sm:rounded-b-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {step === "resorts" ? "Step 1 of 2" : "Step 2 of 2"}
            </p>
            <h2 id="welcome-title" className="text-lg font-bold tracking-tight">
              {step === "resorts" ? "Pick your resorts" : "Save your own backcountry spots"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {step === "resorts"
                ? "Star the resorts you ski. Your home page will show just these, and you can browse all resorts anytime."
                : "Any point on the map can get its own forecast, and you can keep the ones you go back to."}
            </p>
          </div>
          <button onClick={close} className="btn-ghost !px-2 !py-1 text-lg leading-none" aria-label="Close">
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-4">{step === "resorts" ? <ResortPicker /> : <SpotTutorial />}</div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {step === "resorts" ? (
            <>
              <span className="text-xs text-muted-foreground">{starred === 0 ? "None starred yet: you'll see every resort." : `${starred} starred`}</span>
              <button className="btn-primary" onClick={() => setStep("spots")}>
                Next →
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setStep("resorts")}>
                ← Back
              </button>
              <button className="btn-primary" onClick={close}>
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
