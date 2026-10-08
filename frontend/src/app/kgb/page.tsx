"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { KgbItem, KgbStatus, PageMeta } from "@/lib/types";
import { formatRupiah } from "@/lib/format";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | KgbStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Diajukan" },
  { value: "VERIFIED", label: "Terverifikasi" },
  { value: "PARAF", label: "Paraf" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "REJECTED", label: "Ditolak" },
];

const LIMIT = 10;

export default function KgbListPage() {
  const [items, setItems] = useState<KgbItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(p: number, st: string, query: string) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (st) params.set("status", st);
      if (query.trim()) params.set("q", query.trim());
      const { data, meta: m } = await apiFetch<KgbItem[]>(`/kgb-requests?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat KGB");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void load(1, status, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/kgb/baru"
          className="ml-auto rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          + Ajukan KGB
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load(1, status, q);
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${
                status === f.value ? "border-brand-800 bg-brand-900 font-medium text-white" : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama pegawai…"
          className="min-w-44 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
      </form>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(page, status, q)} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada pengajuan KGB" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-3 py-2 font-medium">No. Pengajuan</th>
                    <th className="px-3 py-2 font-medium">Pegawai</th>
                    <th className="px-3 py-2 font-medium">Golongan</th>
                    <th className="px-3 py-2 font-medium">Gaji</th>
                    <th className="px-3 py-2 font-medium">TMT</th>
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
                      <td className="px-3 py-2.5 text-muted">{it.oldRank} → {it.newRank}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{formatRupiah(it.oldSalary)} → {formatRupiah(it.newSalary)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{it.effectiveDate?.slice(0, 10)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-muted">
              <p>{meta ? `Total ${meta.total} pengajuan` : ""}</p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    void load(p, status, q);
                  }}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="px-2 tabular-nums">Hal {page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    void load(p, status, q);
                  }}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
