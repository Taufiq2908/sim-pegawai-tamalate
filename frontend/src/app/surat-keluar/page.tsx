"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { OutgoingLetter, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS = [
  { value: "", label: "Semua" },
  { value: "RESERVED", label: "Dipesan" },
  { value: "ISSUED", label: "Terbit" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

const LIMIT = 10;

export default function SuratKeluarListPage() {
  const [items, setItems] = useState<OutgoingLetter[]>([]);
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
      const { data, meta: m } = await apiFetch<OutgoingLetter[]>(`/outgoing-letters?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as PageMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat keluar");
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
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/surat-keluar/baru"
          className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          + Buat surat
        </Link>
        <Link href="/surat-keluar/agenda" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-paper">
          Buku agenda keluar
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
          placeholder="Cari nomor / perihal / tujuan…"
          className="min-w-44 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
      </form>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(page, status, q)} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada surat keluar" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Nomor Surat</th>
                    <th className="px-3 py-2 font-medium">Perihal</th>
                    <th className="px-3 py-2 font-medium">Tujuan</th>
                    <th className="px-3 py-2 font-medium">Tgl. Surat</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-3 py-2.5">
                        <Link href={`/surat-keluar/${it.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.letterNumber}
                        </Link>
                      </td>
                      <td className="max-w-72 truncate px-3 py-2.5">{it.subject}</td>
                      <td className="px-3 py-2.5 text-muted">{it.recipient ?? "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{it.letterDate?.slice(0, 10)}</td>
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
    </RequirePerm>
  );
}
