"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type { NotificationItem, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

const LIMIT = 50;

function notificationLink(
  n: NotificationItem,
  opts: { isEmployee: boolean },
): { href: string; label: string } | null {
  if (n.referenceType === "incoming_letter" && n.referenceId) {
    return { href: `/surat-masuk/${n.referenceId}`, label: "Buka surat masuk" };
  }
  if (n.referenceType === "outgoing_letter" && n.referenceId) {
    return { href: `/surat-keluar/${n.referenceId}`, label: "Buka surat keluar" };
  }
  if (n.referenceType === "letter_disposition" && n.referenceId) {
    // referenceId adalah ID disposisi; detail surat masuk me-resolve ke surat induk.
    return { href: `/surat-masuk/${n.referenceId}`, label: "Buka surat masuk" };
  }
  if (n.referenceType === "leave_request" && n.referenceId) {
    return { href: `/cuti/${n.referenceId}`, label: "Buka pengajuan cuti" };
  }
  if ((n.referenceType === "kgb_request" || n.referenceType === "KGB") && n.referenceId) {
    return { href: `/kgb/${n.referenceId}`, label: "Buka pengajuan KGB" };
  }
  if (n.referenceType === "kgb_reminder") {
    return opts.isEmployee
      ? { href: "/kgb", label: "Buka KGB" }
      : { href: "/kgb/monitoring", label: "Buka monitoring KGB" };
  }
  if (n.referenceType === "archive_list" && n.referenceId) {
    return { href: `/arsip/daftar/${n.referenceId}`, label: "Buka daftar arsip" };
  }
  if (n.referenceType === "warning_letter" && n.referenceId) {
    // Backend membatasi data: pegawai hanya dapat membuka surat miliknya sendiri.
    return { href: `/presensi/teguran/${n.referenceId}`, label: "Buka surat teguran" };
  }
  return null;
}

function notificationBadge(n: NotificationItem): { label: string; className: string } | null {
  if (n.referenceType === "warning_letter") {
    return n.title.toLowerCase().includes("pembinaan")
      ? { label: "Pembinaan", className: "bg-info-100 text-info-700" }
      : { label: "Surat Teguran", className: "bg-warn-100 text-warn-700" };
  }
  if (n.referenceType === "kgb_reminder") {
    return { label: "Pengingat KGB", className: "bg-warn-100 text-warn-700" };
  }
  if (n.type === "ARCHIVE_APPROVAL") {
    return { label: "Antrean Arsip", className: "bg-info-100 text-info-700" };
  }
  if (n.type === "ARCHIVE_REJECTED") {
    return { label: "Revisi Arsip", className: "bg-bad-100 text-bad-700" };
  }
  if (n.type === "LETTER_REVISION") {
    return { label: "Revisi Surat", className: "bg-bad-100 text-bad-700" };
  }
  if (n.type === "LETTER_REVIEW") {
    return { label: "Surat Masuk", className: "bg-warn-100 text-warn-700" };
  }
  if (n.type === "LETTER_DISPOSITION" || n.type === "DISPOSITION") {
    return { label: "Disposisi", className: "bg-info-100 text-info-700" };
  }
  if (n.type === "ARCHIVE" || n.referenceType === "archive_list") {
    return { label: "Arsip", className: "bg-info-100 text-info-700" };
  }
  if (n.type === "ATTENDANCE") {
    return { label: "Presensi", className: "bg-warn-100 text-warn-700" };
  }
  if (n.type === "LEAVE") {
    return { label: "Cuti", className: "bg-info-100 text-info-700" };
  }
  if (n.type === "KGB" || n.referenceType === "kgb_request") {
    return { label: "KGB", className: "bg-info-100 text-info-700" };
  }
  return null;
}

export default function NotifikasiPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (targetPage = 1, opts: { silent?: boolean; append?: boolean } = {}) => {
      const { silent = false, append = false } = opts;
      if (!silent && !append) setLoading(true);
      if (append) setLoadingMore(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(targetPage), limit: String(LIMIT) });
        if (onlyUnread) params.set("unread", "true");
        const { data, meta: m } = await apiFetch<NotificationItem[]>(`/notifications?${params.toString()}`);
        const list = Array.isArray(data) ? data : [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setMeta(m as PageMeta | null);
        setPage(targetPage);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Gagal memuat notifikasi");
      } finally {
        if (!silent && !append) setLoading(false);
        if (append) setLoadingMore(false);
      }
    },
    [onlyUnread],
  );

  useEffect(() => {
    setPage(1);
    void load(1);
  }, [load]);

  useEffect(() => {
    // Polling dan fokus hanya memperbarui halaman pertama agar daftar yang
    // sedang dibuka tidak terpotong. Pengguna tetap bisa memuat halaman berikutnya.
    const refresh = () => {
      if (page === 1) void load(1, { silent: true });
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("notifications:refresh", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("notifications:refresh", refresh);
    };
  }, [load, page]);

  async function markRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      setItems((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      refreshNotificationBadge();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai dibaca");
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const { data } = await apiFetch<{ updated: number }>("/notifications/read-all", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (onlyUnread) {
        await load(1, { silent: true });
      } else {
        setItems((list) => list.map((n) => (n.isRead ? n : { ...n, isRead: true })));
      }
      refreshNotificationBadge();
      toast.success(data?.updated ? `${data.updated} notifikasi ditandai dibaca.` : "Semua notifikasi sudah dibaca.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai semua dibaca");
    } finally {
      setMarkingAll(false);
    }
  }

  const hasMore = !!meta && items.length < meta.total;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Notifikasi</h1>
        {meta ? <span className="text-sm text-muted">{meta.total} total</span> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(1, { silent: true })}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-paper disabled:opacity-50"
          >
            Muat ulang
          </button>
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void markAllRead()}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-paper disabled:opacity-50"
          >
            {markingAll ? "Memproses…" : "Tandai semua dibaca"}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
            Belum dibaca saja
          </label>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(1)} />
        ) : items.length === 0 ? (
          <EmptyState title="Tidak ada notifikasi" />
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((n) => {
                const link = notificationLink(n, {
                  isEmployee: user?.role === "EMPLOYEE",
                });
                const badge = notificationBadge(n);
                return (
                  <li
                    key={n.id}
                    className={`rounded-xl border px-4 py-3 ${n.isRead ? "border-line bg-surface" : "border-brand-700 bg-surface"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      {badge ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      ) : null}
                      {!n.isRead ? (
                        <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-semibold text-white">Baru</span>
                      ) : null}
                      <span className="ml-auto text-xs text-muted">
                        {new Date(n.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{n.body}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {link ? (
                        <Link
                          href={link.href}
                          onClick={() => {
                            if (!n.isRead) void markRead(n.id);
                          }}
                          className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                        >
                          {link.label}
                        </Link>
                      ) : null}
                      {!n.isRead ? (
                        <button
                          type="button"
                          onClick={() => void markRead(n.id)}
                          className="rounded-lg border border-line bg-field px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
                        >
                          Tandai dibaca
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(page + 1, { append: true })}
                  className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-50"
                >
                  {loadingMore ? "Memuat…" : `Muat lebih banyak (${items.length}/${meta?.total})`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
