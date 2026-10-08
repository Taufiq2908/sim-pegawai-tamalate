"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { WarningLetterDetail } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";
import { toast } from "@/components/toast";

export default function TeguranDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("attendance.manage");
  const [item, setItem] = useState<WarningLetterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [schedAt, setSchedAt] = useState("");
  const [summonNote, setSummonNote] = useState("");
  const [result, setResult] = useState("");
  const [followUp, setFollowUp] = useState<"NONE" | "BKPSDM">("NONE");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}`);
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

  async function summon() {
    if (!schedAt) {
      toast.error("Isi jadwal pemanggilan dulu.");
      return;
    }
    setActing("summon");
    try {
      const { data } = await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/summon`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: new Date(schedAt).toISOString(), note: summonNote || undefined }),
      });
      setItem(data);
      toast.success("Panggilan pembinaan dijadwalkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menjadwalkan");
    } finally {
      setActing(null);
    }
  }

  async function coaching() {
    if (result.trim().length < 5) {
      toast.error("Hasil pembinaan wajib diisi (min 5 karakter).");
      return;
    }
    setActing("coaching");
    try {
      const { data } = await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/coaching`, {
        method: "PATCH",
        body: JSON.stringify({ result: result.trim(), followUp }),
      });
      setItem(data);
      toast.success("Hasil pembinaan dicatat.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat");
    } finally {
      setActing(null);
    }
  }

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
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{item.letterNumber}</h1>
                {item.coachingFollowUp ? <StatusBadge status={item.coachingFollowUp} /> : null}
                <button onClick={() => window.print()} className="no-print ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">
                  Cetak
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {item.employee?.name} ({item.employee?.position}) • Pekan {String(item.weekStart).slice(0, 10)} s.d. {String(item.weekEnd).slice(0, 10)} • {item.absenceCount} sesi
              </p>
              <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed">{item.content}</pre>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Pembinaan</h2>
              {item.summonScheduledAt ? (
                <p className="mt-1 text-sm text-slate-600">
                  Dipanggil: <b>{new Date(item.summonScheduledAt).toLocaleString("id-ID")}</b>
                  {item.summonNote ? ` — ${item.summonNote}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Belum ada panggilan pembinaan.</p>
              )}
              {item.coachingResult ? (
                <p className="mt-1 text-sm text-slate-600">
                  Hasil: <b>{item.coachingResult}</b> ({item.coachingFollowUp}
                  {item.coachedAt ? ` • ${new Date(item.coachedAt).toLocaleString("id-ID")}` : ""})
                </p>
              ) : null}

              {canManage ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {!item.summonScheduledAt ? (
                    <div className="flex flex-wrap gap-2">
                      <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                      <input value={summonNote} onChange={(e) => setSummonNote(e.target.value)} placeholder="Catatan panggilan (opsional)" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                      <button disabled={acting !== null} onClick={() => void summon()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {acting === "summon" ? "…" : "Buat panggilan"}
                      </button>
                    </div>
                  ) : !item.coachingResult ? (
                    <div className="flex flex-wrap gap-2">
                      <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="Hasil pembinaan (min 5 karakter)*" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                      <select value={followUp} onChange={(e) => setFollowUp(e.target.value as "NONE" | "BKPSDM")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <option value="NONE">Selesai internal</option>
                        <option value="BKPSDM">Teruskan ke BKPSDM</option>
                      </select>
                      <button disabled={acting !== null} onClick={() => void coaching()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {acting === "coaching" ? "…" : "Catat hasil"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Pembinaan selesai dicatat.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
