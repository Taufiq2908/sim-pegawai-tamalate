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
  success: "border-green-300 bg-green-50 text-green-900",
  error: "border-red-300 bg-red-50 text-red-900",
  info: "border-slate-300 bg-white text-slate-900",
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
        <div key={it.id} role="status" className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${KIND_STYLE[it.kind]}`}>
          {it.msg}
        </div>
      ))}
    </div>
  );
}
