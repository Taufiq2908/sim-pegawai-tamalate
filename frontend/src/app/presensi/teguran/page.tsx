"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface WarningLetter {
  id: string;
  letterNumber: string;
  employeeId: string;
  weekStart: string;
  weekEnd: string;
  absenceCount: number;
  content: string;
  createdAt: string;
  employee?: { name: string; position: string };
}

export default function TeguranListPage() {
  const [items, setItems] = useState<WarningLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<WarningLetter[]>("/attendances/warning-letters?page=1&limit=20");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat teguran");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Surat Teguran</h1>
      <p className="mt-0.5 text-sm text-slate-500">Diterbitkan otomatis dari pegawai bermasalah mingguan.</p>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada surat teguran" />
        ) : (
          <ul className="space-y-2">
            {items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/presensi/teguran/${w.id}`}
                  className="block rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-900"
                >
                  <p className="text-sm font-semibold">{w.letterNumber} — {w.employee?.name ?? w.employeeId}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Pekan {w.weekStart} s.d. {w.weekEnd} • {w.absenceCount} hari tanpa hadir
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
