"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

interface WarningLetter {
  id: string;
  letterNumber: string;
  employeeId: string;
  weekStart: string;
  weekEnd: string;
  absenceCount: number;
  content: string;
  createdAt: string;
  workflowStatus?: string;
  employee?: { name: string; position: string };
}

export default function TeguranListPage() {
  const { user } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  const [items, setItems] = useState<WarningLetter[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "20" });
      if (followUp) params.set("followUp", followUp);
      const { data } = await apiFetch<WarningLetter[]>(`/attendances/warning-letters?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat teguran");
    } finally {
      setLoading(false);
    }
  }, [followUp]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequireAuth>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">{isEmployee ? "Surat Teguran Saya" : "Surat Teguran"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isEmployee
              ? "Surat teguran dan jadwal pembinaan yang tercatat atas nama Anda."
              : "Diterbitkan otomatis dari pegawai bermasalah mingguan."}
          </p>
        </div>
        {!isEmployee ? (
          <select value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="ml-auto rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
            <option value="">Semua tindak lanjut</option>
            <option value="NONE">Selesai internal</option>
            <option value="BKPSDM">Diteruskan ke BKPSDM</option>
          </select>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title={isEmployee ? "Tidak ada surat teguran untuk Anda" : "Belum ada surat teguran"} />
        ) : (
          <ul className="space-y-2">
            {items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/presensi/teguran/${w.id}`}
                  className="block rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-brand-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{w.letterNumber} — {w.employee?.name ?? w.employeeId}</p>
                    <StatusBadge status={w.workflowStatus ?? "DILAPORKAN"} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Pekan {String(w.weekStart).slice(0, 10)} s.d. {String(w.weekEnd).slice(0, 10)} • {w.absenceCount} sesi tanpa keterangan
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequireAuth>
  );
}
