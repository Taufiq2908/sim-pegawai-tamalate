"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { IncomingLetter, LetterStatus, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | LetterStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "RECEIVED", label: "Diterima" },
  { value: "PARAF", label: "Diparaaf" },
  { value: "DISPOSED", label: "Didisposisi" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "ARCHIVED", label: "Arsip" },
];

const LIMIT = 10;

export default function SuratMasukListPage() {
  const [items, setItems] = useState<IncomingLetter[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const st = new URLSearchParams(window.location.search).get("status") ?? "";
    if (st) setStatus(st);
  }, []);

  async function load(p: number, st: string, query: string) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (st) params.set("status", st);
      if (query.trim()) params.set("q", query.trim());
      const { data, meta: m } = await apiFetch<IncomingLetter[]>(`/letters?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat");
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
          href="/surat-masuk/baru"
          className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          + Catat surat
        </Link>
        <Link href="/surat-masuk/agenda" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-paper">
          Buku agenda
        </Link>
        <Link href="/surat-masuk/ekspedisi" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-paper">
          Buku ekspedisi
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
          placeholder="Cari perihal / pengirim / nomor…"
          className="min-w-44 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
      </form>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(page, status, q)} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada surat" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-3 py-2 font-medium">No. Agenda</th>
                    <th className="px-3 py-2 font-medium">Asal Surat</th>
                    <th className="px-3 py-2 font-medium">Perihal</th>
                    <th className="px-3 py-2 font-medium">Tgl. Surat</th>
                    <th className="px-3 py-2 font-medium">Disposisi</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-3 py-2.5">
                        <Link href={`/surat-masuk/${it.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.agendaNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{it.sender}<span className="block text-xs text-muted">{it.letterNumber}</span></td>
                      <td className="max-w-64 truncate px-3 py-2.5">{it.subject}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{it.letterDate?.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{it.dispositions?.length ?? 0}×</td>
                      <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-muted">
              <p>{meta ? `Total ${meta.total} surat` : ""}</p>
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
