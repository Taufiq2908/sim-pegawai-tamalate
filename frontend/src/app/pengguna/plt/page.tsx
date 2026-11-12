"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ActingPositionItem, UserListItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID");
}

export default function PenugasanPltPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("user.manage");
  const [items, setItems] = useState<ActingPositionItem[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState("SEKCAM");
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const activeUsers = useMemo(
    () => users.filter((u) => u.isActive).sort((a, b) => a.username.localeCompare(b.username)),
    [users],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [acting, userList] = await Promise.all([
        apiFetch<ActingPositionItem[]>("/users/acting-positions"),
        apiFetch<UserListItem[]>("/users?active=true&limit=100"),
      ]);
      setItems(Array.isArray(acting.data) ? acting.data : []);
      setUsers(Array.isArray(userList.data) ? userList.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat penugasan Plt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    if (!userId || !startsAt) {
      toast.error("Pilih user dan waktu mulai terlebih dahulu.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/users/acting-positions", {
        method: "POST",
        body: JSON.stringify({
          position,
          userId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          reason: reason.trim() || undefined,
        }),
      });
      toast.success("Penugasan Plt dibuat.");
      setReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat penugasan Plt");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: ActingPositionItem) {
    if (!canManage) return;
    try {
      await apiFetch(`/users/acting-positions/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      toast.success(item.isActive ? "Penugasan Plt dinonaktifkan." : "Penugasan Plt diaktifkan.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah penugasan Plt");
    }
  }

  return (
    <RequirePerm perm="user.manage" label="Penugasan Plt">
      <div className="rounded-lg border border-line bg-surface p-5">
        <h1 className="text-lg font-bold">Penugasan Plt</h1>
        <p className="mt-1 text-sm text-muted">
          Catat pejabat pelaksana tugas (Plt) Sekcam/Camat secara resmi. Jangan mengubah jabatan
          utama user; backend memakai penugasan ini untuk notifikasi dan wewenang paraf/persetujuan.
        </p>

        {canManage ? (
          <form onSubmit={(e) => void createAssignment(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Jabatan yang di-Plt-kan</span>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
              >
                <option value="SEKCAM">Sekcam</option>
                <option value="CAMAT">Camat</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">User</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
              >
                <option value="">Pilih user…</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.employee?.name ?? u.username} ({u.username}) — {u.position ?? u.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Mulai</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Selesai (opsional)</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">Alasan</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Camat cuti, Plt ditunjuk sampai tanggal …"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : "Buat penugasan Plt"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada penugasan Plt" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Jabatan</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Mulai</th>
                  <th className="px-3 py-2 font-medium">Selesai</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Alasan</th>
                  <th className="px-3 py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-medium">{it.position}</td>
                    <td className="px-3 py-2.5">
                      {it.user.employee?.name ?? it.user.username}
                      <span className="block text-xs text-muted">{it.user.username}</span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatDate(it.startsAt)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatDate(it.endsAt)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          it.isActive ? "bg-ok-100 text-ok-700" : "bg-paper text-muted"
                        }`}
                      >
                        {it.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{it.reason ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void toggleActive(it)}
                        className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-paper"
                      >
                        {it.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
