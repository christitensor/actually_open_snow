"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// PERS-07 drag-to-reorder for a vertical list, shared by the saved spots
// and starred resorts lists. While a drag is live, `ordered` is a working
// order rendered in place of `items`; onCommit gets it on release (only if
// it changed). Pointer events cover mouse and touch alike — the grip needs
// touch-action:none (see DragGrip) so dragging it doesn't scroll the page.
// Move/up are listened for on window rather than via pointer capture on
// the grip: reordering moves the row's DOM node, which drops capture
// mid-drag (and with it every later event on touch devices).
export function useDragReorder<T>(items: T[], getKey: (item: T) => string, onCommit: (ordered: T[]) => void) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<T[] | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const latest = useRef({ items, dragOrder, getKey, onCommit });
  useEffect(() => {
    latest.current = { items, dragOrder, getKey, onCommit };
  });

  useEffect(() => {
    if (!dragKey) return;

    const onMove = (e: globalThis.PointerEvent) => {
      const { dragOrder: order, getKey: key } = latest.current;
      if (!order) return;
      const from = order.findIndex((item) => key(item) === dragKey);
      // Target slot = how many other rows' midpoints the pointer is below.
      let to = 0;
      for (const item of order) {
        const k = key(item);
        if (k === dragKey) continue;
        const rect = rows.current.get(k)?.getBoundingClientRect();
        if (rect && e.clientY > rect.top + rect.height / 2) to++;
      }
      if (from !== -1 && to !== from) setDragOrder(moveItem(order, from, to));
    };

    const onEnd = () => {
      const { items: saved, dragOrder: order, getKey: key, onCommit: commit } = latest.current;
      if (order && order.some((item, i) => key(item) !== key(saved[i] ?? item))) commit(order);
      setDragKey(null);
      setDragOrder(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKey]);

  return {
    ordered: dragOrder ?? items,
    dragKey,
    registerRow(key: string, el: HTMLElement | null) {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    },
    gripProps(key: string, index: number) {
      return {
        onPointerDown(e: PointerEvent<HTMLElement>) {
          e.preventDefault();
          setDragKey(key);
          setDragOrder(items);
        },
        // Keyboard fallback: arrow keys move the focused row one slot.
        onKeyDown(e: KeyboardEvent<HTMLElement>) {
          const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : -1;
          if (to < 0 || to >= items.length) return;
          e.preventDefault();
          onCommit(moveItem(items, index, to));
        },
      };
    },
  };
}
