"use client";

import { useEffect, useState } from "react";

type Kind = "success" | "error" | "info";

interface Item {
  id: number;
  msg: string;
  kind: Kind;
}

let seq = 1;
const listeners = new Set<(it: Item) => void>();

function emit(msg: string, kind: Kind) {
  const it = { id: seq++, msg, kind };
  listeners.forEach((fn) => fn(it));
}

/** Pengganti alert(): toast.success / toast.error / toast.info */
export const toast = {
  success: (msg: string) => emit(msg, "success"),
  error: (msg: string) => emit(msg, "error"),
  info: (msg: string) => emit(msg, "info"),
};

const KIND_STYLE: Record<Kind, string> = {
  success: "border-ok-700/25 bg-ok-100 text-ok-700",
  error: "border-bad-700/25 bg-bad-100 text-bad-700",
  info: "border-line bg-surface text-ink",
};

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const fn = (it: Item) => {
      setItems((list) => [...list.slice(-3), it]);
      window.setTimeout(() => {
        setItems((list) => list.filter((x) => x.id !== it.id));
      }, 4500);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {items.map((it) => (
        <div key={it.id} role="status" className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium ${KIND_STYLE[it.kind]}`}>
          {it.msg}
        </div>
      ))}
    </div>
  );
}
