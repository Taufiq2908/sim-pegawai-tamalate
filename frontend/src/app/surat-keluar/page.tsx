"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { OutgoingLetter, OutgoingLetterStatus, PageMeta } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | OutgoingLetterStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "RESERVED", label: "Dipesan" },
  { value: "TERKIRIM", label: "Terkirim" },
  { value: "DIARSIPKAN", label: "Diarsipkan" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

const STATUS_VALUES = new Set<string>(FILTERS.map((f) => f.value).filter(Boolean));
const LIMIT = 10;

function displayDate(value?: string | null) {
  return value ? value.slice(0, 10) : "—";
}

export default function SuratKeluarListPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<OutgoingLetter[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const st = new URLSearchParams(window.location.search).get("status") ?? "";
    if (STATUS_VALUES.has(st)) setStatus(st);
  }, []);

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
        {hasPermission("outgoing.create") || hasPermission("outgoing.reserve") ? (
          <Link
            href="/surat-keluar/baru"
            className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            + Buat / booking nomor
          </Link>
        ) : null}
        <Link href="/surat-keluar/agenda" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-paper">
          Register surat keluar
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load(1, status, q);
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nomor / perihal / tujuan…"
          className="min-w-52 flex-1 rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-brand-700"
        />
        <button type="submit" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-paper">
          Cari
        </button>
      </form>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(page, status, q)} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada surat keluar" hint="Ubah filter status atau kata kunci." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Nomor Surat</th>
                    <th className="px-3 py-2 font-medium">Tujuan</th>
                    <th className="px-3 py-2 font-medium">Perihal</th>
                    <th className="px-3 py-2 font-medium">Tanggal</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Catatan Arsip</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-3 py-2.5">
                        <Link href={`/surat-keluar/${it.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.letterNumber}
                        </Link>
                        <span className="mt-0.5 block text-[11px] text-muted">{it.sequenceNumber ? `Urut ${it.sequenceNumber}` : ""}</span>
                      </td>
                      <td className="px-3 py-2.5">{it.recipient || "—"}</td>
                      <td className="max-w-72 truncate px-3 py-2.5">{it.subject}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{displayDate(it.letterDate)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                      <td className="max-w-64 px-3 py-2.5 text-xs">
                        {it.archiveRejectionNote ? (
                          <span className="text-bad-700">{it.archiveRejectionNote}</span>
                        ) : it.archiveRecord ? (
                          <span className="text-ok-700">{it.archiveRecord.archiveNumber}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-muted">
              <p>{meta ? `Total ${meta.total} surat` : ""}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
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
                  type="button"
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
