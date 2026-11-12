"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { LeaveItem, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function CutiMenungguPage() {
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, meta: m } = await apiFetch<LeaveItem[]>("/leave-requests/pending-approval");
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tugas persetujuan cuti");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = meta?.count ?? items.length;

  return (
    <RequirePerm perm="leave.view" label="Menunggu Persetujuan Cuti">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cuti" className="text-sm font-semibold text-muted hover:text-ink">
          ← Cuti
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-paper"
        >
          Muat ulang
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold">Menunggu persetujuan saya</h1>
          <span className="rounded-full bg-brand-900 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-white">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Daftar ini dihitung backend dari status dokumen, jabatan aktif (termasuk Plt), dan
          permission Anda. Notifikasi in-app hanya pengingat; daftar tugas tetap tampil walau
          notifikasi gagal.
        </p>
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada tugas persetujuan cuti"
            hint="Dokumen akan muncul di sini saat berada pada tahap jabatan atau permission Anda."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">No. Permohonan</th>
                  <th className="px-3 py-2 font-medium">Pegawai</th>
                  <th className="px-3 py-2 font-medium">Jenis</th>
                  <th className="px-3 py-2 font-medium">Periode</th>
                  <th className="px-3 py-2 font-medium">Sedang menunggu</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <Link href={`/cuti/${it.id}`} className="font-medium text-brand-800 hover:underline">
                        {it.requestNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {it.employee?.name}
                      <span className="block text-xs text-muted">{it.employee?.orgUnit?.name ?? ""}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{it.leaveType?.name}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {it.startDate?.slice(0, 10)} – {it.endDate?.slice(0, 10)}
                      <span className="text-muted"> ({it.totalDays} hari)</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{it.waitingFor ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={it.status} />
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
