"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PageMeta } from "@/lib/types";

/**
 * Kartu ringkas daftar tugas. Sumbernya endpoint pending-approval, bukan
 * notifikasi in-app, sehingga tugas tetap terlihat walau notifikasi gagal.
 */
export function PendingApprovalCard({
  endpoint,
  href,
  title,
  permissions,
}: {
  endpoint: string;
  href: string;
  title: string;
  permissions: string[];
}) {
  const { hasPermission } = useAuth();
  const allowed = permissions.some((p) => hasPermission(p));
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    apiFetch<unknown[]>(endpoint)
      .then(({ data, meta }) => {
        if (!alive) return;
        const m = meta as PageMeta | null;
        setCount(m?.count ?? data.length);
      })
      .catch(() => {
        if (alive) setCount(null);
      });
    return () => {
      alive = false;
    };
  }, [allowed, endpoint]);

  if (!allowed || !count) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-info-700/30 bg-info-100 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-info-700">{title}</p>
          <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
            {count}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-secondary">
          Daftar tugas berasal dari jabatan/permission Anda dan tetap tersedia walau notifikasi gagal.
        </p>
      </div>
      <Link
        href={href}
        className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
      >
        Lihat tugas
      </Link>
    </div>
  );
}
