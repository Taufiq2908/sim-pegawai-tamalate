"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { IncomingLetter, LetterStatus } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | LetterStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "RECEIVED", label: "Diterima" },
  { value: "PARAF", label: "Diparaaf" },
  { value: "DISPOSED", label: "Didisposisi" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "ARCHIVED", label: "Arsip" },
];

export default function SuratMasukListPage() {
  const [items, setItems] = useState<IncomingLetter[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        ["RECEIVED", "DISPOSED", "COMPLETED", "ARCHIVED"].map(async (s) => {
          try {
            const { meta } = await apiFetch<unknown>(`/letters?status=${s}&limit=1`);
            out[s] = (meta as { total?: number } | null)?.total ?? 0;
          } catch {
            /* abaikan */
          }
        }),
      );
      setCounts(out);
    })();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "20" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const { data } = await apiFetch<IncomingLetter[]>(`/letters?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Surat Masuk</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hanya surat yang melibatkan Anda (kecuali admin/verifier).</p>
        </div>
        <Link
          href="/surat-masuk/baru"
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Catat surat
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/surat-masuk/agenda" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50">
          Buku agenda
        </Link>
        <Link href="/surat-masuk/ekspedisi" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50">
          Buku ekspedisi
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTERS.filter((f) => f.value).map((f) => (
          <div key={f.value} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-2xl font-bold">{counts[f.value] ?? "—"}</p>
            <p className="text-xs text-slate-500">{f.label}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="mt-4 flex flex-wrap gap-2"
      >
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                status === f.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
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
          className="min-w-48 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button type="submit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          Cari
        </button>
      </form>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada surat" />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/surat-masuk/${it.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{it.agendaNumber} — {it.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {it.sender} • {it.letterNumber} • {it.dispositions?.length ?? 0} disposisi
                    </p>
                  </div>
                  <StatusBadge status={it.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
