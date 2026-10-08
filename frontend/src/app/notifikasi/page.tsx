"use client";
import { toast } from "@/components/toast";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

export default function NotifikasiPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<NotificationItem[]>(
        `/notifications?${onlyUnread ? "unread=true&" : ""}page=1&limit=20`,
      );
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat notifikasi");
    } finally {
      setLoading(false);
    }
  }, [onlyUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      setItems((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai dibaca");
    }
  }

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Notifikasi</h1>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
          Belum dibaca saja
        </label>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title="Tidak ada notifikasi" />
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border px-4 py-3 ${n.isRead ? "border-line bg-white" : "border-brand-700 bg-surface"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{n.title}</p>
                  {!n.isRead ? (
                    <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-semibold text-white">Baru</span>
                  ) : null}
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleString("id-ID")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{n.body}</p>
                <div className="mt-2 flex gap-2">
                  {n.referenceType === "letter_disposition" ? (
                    <Link href="/surat-masuk" className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                      Buka surat masuk
                    </Link>
                  ) : null}
                  {!n.isRead ? (
                    <button onClick={() => void markRead(n.id)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper">
                      Tandai dibaca
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
