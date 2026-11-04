"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PromotionBatch, PromotionStatus, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | PromotionStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "DRAFT", label: "Draf" },
  { value: "LEGALIZED", label: "Legalisasi" },
  { value: "VERIFIED", label: "Terverifikasi" },
  { value: "PARAF", label: "Paraf" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REGISTERED", label: "Diregistrasi" },
  { value: "ARCHIVED", label: "Diarsipkan" },
  { value: "REVISION", label: "Perlu revisi" },
  { value: "REJECTED", label: "Ditolak" },
];

const LIMIT = 10;

export default function PromotionListPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<PromotionBatch[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(p: number, st: string, y: string, query: string) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (st) params.set("status", st);
      if (y) params.set("year", y);
      if (query.trim()) params.set("q", query.trim());
      const { data, meta: m } = await apiFetch<{
        items: PromotionBatch[];
        page: number;
        limit: number;
        total: number;
      }>(`/promotion-requests?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat usulan kenaikan pangkat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void load(1, status, year, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, year, q]);

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  function periodLabel(y: number, m?: number | null): string {
    const MONTHS = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ];
    return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
  }

  return (
    <RequirePerm perm="promotion.view" label="Kenaikan Pangkat">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/kenaikan-pangkat/calon"
          className="ml-auto rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
        >
          Daftar Calon
        </Link>
        <Link
          href="/kenaikan-pangkat/register"
          className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
        >
          Buku Register
        </Link>
        <Link
          href="/kenaikan-pangkat/nominatif"
          className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
        >
          Nominatif
        </Link>
        <Link
          href="/kenaikan-pangkat/arsip"
          className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
        >
          Buku Arsip
        </Link>
        {hasPermission("promotion.create") ? (
          <Link
            href="/kenaikan-pangkat/calon"
            className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            + Buat Usulan
          </Link>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load(1, status, year, q);
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${status === f.value ? "border-brand-800 bg-brand-900 font-medium text-white" : "border-line bg-surface text-muted hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Tahun"
          className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nomor usulan, nama, NIP, nomor surat…"
          className="min-w-44 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
      </form>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(page, status, year, q)} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada usulan kenaikan pangkat" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-3 py-2 font-medium">No. Usulan</th>
                    <th className="px-3 py-2 font-medium">Periode</th>
                    <th className="px-3 py-2 font-medium">Jumlah ASN</th>
                    <th className="px-3 py-2 font-medium">Ringkasan Nama</th>
                    <th className="px-3 py-2 font-medium">Nomor Surat</th>
                    <th className="px-3 py-2 font-medium">Nomor Arsip</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-3 py-2.5">
                        <Link href={`/kenaikan-pangkat/${it.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.batchNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{periodLabel(it.periodYear, it.periodMonth)}</td>
                      <td className="px-3 py-2.5 font-medium">{it.items.length}</td>
                      <td className="px-3 py-2.5 text-muted">
                        {it.items.map((i) => i.employeeName).join(", ")}
                      </td>
                      <td className="px-3 py-2.5">{it.outgoingLetterNumber ?? "-"}</td>
                      <td className="px-3 py-2.5">
                        {it.outgoingLetter?.archiveRecord?.archiveNumber ?? "-"}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/kenaikan-pangkat/${it.id}`}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-paper"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-muted">
              <p>{meta ? `Total ${meta.total} usulan` : ""}</p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    void load(p, status, year, q);
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
                    void load(p, status, year, q);
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
    </RequirePerm>
  );
}
