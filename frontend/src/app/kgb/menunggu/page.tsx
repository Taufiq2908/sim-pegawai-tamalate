"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { KgbItem, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";
import { formatRupiah } from "@/lib/format";

export default function KgbMenungguPage() {
  const [items, setItems] = useState<KgbItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, meta: m } = await apiFetch<KgbItem[]>("/kgb-requests/pending-approval");
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tugas persetujuan KGB");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = meta?.count ?? items.length;

  return (
    <RequirePerm perm="kgb.view" label="Menunggu Persetujuan KGB">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/kgb" className="text-sm font-semibold text-muted hover:text-ink">
          ← KGB
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
            title="Tidak ada tugas persetujuan KGB"
            hint="Dokumen akan muncul di sini saat berada pada tahap jabatan atau permission Anda."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">No. Pengajuan</th>
                  <th className="px-3 py-2 font-medium">Pegawai</th>
                  <th className="px-3 py-2 font-medium">Golongan</th>
                  <th className="px-3 py-2 font-medium">Gaji</th>
                  <th className="px-3 py-2 font-medium">Sedang menunggu</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <Link href={`/kgb/${it.id}`} className="font-medium text-brand-800 hover:underline">
                        {it.requestNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{it.employee?.name}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {it.oldRank} → {it.newRank}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">
                      {formatRupiah(it.oldSalary)} → {formatRupiah(it.newSalary)}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{it.waitingFor ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        status={it.status}
                        label={it.status === "APPROVED" ? "Disetujui Camat" : undefined}
                      />
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
