"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { LeaveItem, LeaveStatus } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const FILTERS: Array<{ value: "" | LeaveStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Diajukan" },
  { value: "VERIFIED", label: "Terverifikasi" },
  { value: "PARAF", label: "Paraf" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "REJECTED", label: "Ditolak" },
];

export default function CutiListPage() {
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "20" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const { data } = await apiFetch<LeaveItem[] | { items: LeaveItem[] }>(
        `/leave-requests?${params.toString()}`,
      );
      // Backend aktual: data=array. Kontrak docs: data={items}. Tangani keduanya.
      const list = Array.isArray(data) ? data : (data.items ?? []);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data cuti");
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
          <h1 className="text-xl font-bold">Cuti</h1>
          <p className="mt-0.5 text-sm text-slate-500">Daftar pengajuan cuti sesuai hak akses Anda.</p>
        </div>
        <Link
          href="/cuti/baru"
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Ajukan cuti
        </Link>
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
          placeholder="Cari nama / nomor…"
          className="min-w-48 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          type="submit"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          Cari
        </button>
      </form>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" hint="Klik “Ajukan cuti” untuk membuat pengajuan baru." />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/cuti/${it.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {it.requestNumber} — {it.employee?.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {it.leaveType?.name} • {it.startDate?.slice(0, 10)} → {it.endDate?.slice(0, 10)} •{" "}
                      {it.totalDays} hari
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
