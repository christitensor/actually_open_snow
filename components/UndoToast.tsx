"use client";

import { useEffect, useSyncExternalStore } from "react";

// PERS-08: "Removed X · Undo" after un-bookmarking, so a mis-tapped star
// or "remove" doesn't silently lose a saved spot (or its place in your
// custom order). One toast at a time; a new one replaces the old.

interface Toast {
  id: number;
  message: string;
  onUndo: () => void;
}

const TOAST_MS = 6000;
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showUndoToast(message: string, onUndo: () => void) {
  current = { id: nextId++, message, onUndo };
  emit();
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export default function UndoToast() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex max-w-sm items-center gap-3 rounded-full bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
        <span className="truncate">{toast.message}</span>
        <button
          onClick={() => {
            toast.onUndo();
            dismiss(toast.id);
          }}
          className="shrink-0 font-semibold text-accent"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
