"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface WarningLetter {
  id: string;
  letterNumber: string;
  weekStart: string;
  weekEnd: string;
  absenceCount: number;
  content: string;
  createdAt: string;
  employee?: { name: string; position: string; nip: string | null };
}

export default function TeguranDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<WarningLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<WarningLetter>(`/attendances/warning-letters/${id}`);
      setItem(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat teguran");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <button onClick={() => router.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !item ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold">{item.letterNumber}</h1>
              <button onClick={() => window.print()} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">
                Cetak
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {item.employee?.name} ({item.employee?.position}) • Pekan {item.weekStart} s.d. {item.weekEnd} • {item.absenceCount} hari
            </p>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed">{item.content}</pre>
          </div>
        )}
      </div>
    </AppShell>
  );
}
