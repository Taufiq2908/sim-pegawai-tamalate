"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { KgbMonitoringItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function KgbMonitoringPage() {
  const [items, setItems] = useState<KgbMonitoringItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbMonitoringItem[]>("/kgb-requests/monitoring");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat monitoring KGB");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter((it) =>
        [it.employee.name, it.employee.nip, it.employee.position, it.employee.orgUnit]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      )
    : items;

  const sudah = items.filter((it) => it.lastKgb).length;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Monitoring KGB</h1>
          <p className="text-sm text-muted">Daftar pegawai aktif beserta pengajuan KGB terakhirnya.</p>
        </div>
        <Link
          href="/kgb"
          className="ml-auto rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
        >
          Daftar pengajuan
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, NIP, jabatan, atau unit…"
          className="min-w-52 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
        <span className="self-center text-sm text-muted">
          {items.length} pegawai • {sudah} punya KGB
        </span>
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Tidak ada pegawai yang cocok" hint="Ubah kata kunci pencarian." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">No</th>
                  <th className="px-3 py-2 font-medium">Pegawai</th>
                  <th className="px-3 py-2 font-medium">Jabatan</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Golongan</th>
                  <th className="px-3 py-2 font-medium">KGB terakhir</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => (
                  <tr key={it.employee.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5 tabular-nums text-muted">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{it.employee.name}</p>
                      <p className="text-xs text-muted">NIP {it.employee.nip ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{it.employee.position}</td>
                    <td className="px-3 py-2.5 text-muted">{it.employee.orgUnit}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{it.employee.rank ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {it.lastKgb ? (
                        <Link href={`/kgb/${it.lastKgb.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.lastKgb.requestNumber}
                          <span className="block text-xs font-normal text-muted">
                            {it.lastKgb.oldRank} → {it.lastKgb.newRank} • TMT {it.lastKgb.effectiveDate.slice(0, 10)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">Belum ada</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {it.lastKgb ? <StatusBadge status={it.lastKgb.status} /> : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
