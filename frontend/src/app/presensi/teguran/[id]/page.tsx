"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { WarningLetterDetail } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";
import { toast } from "@/components/toast";

export default function TeguranDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("attendance.manage");
  const canForward = hasPermission("attendance.forward");
  const isEmployee = user?.role === "EMPLOYEE";
  const isSekcam = user?.role === "SUPER_ADMIN" || user?.position === "SEKCAM";
  const isCamat = user?.role === "SUPER_ADMIN" || user?.position === "CAMAT";
  const isKasi = user?.role === "SUPER_ADMIN" || user?.position === "KASI";
  const [item, setItem] = useState<WarningLetterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [schedAt, setSchedAt] = useState("");
  const [summonNote, setSummonNote] = useState("");
  const [result, setResult] = useState("");
  const [followUp, setFollowUp] = useState<"NONE" | "BKPSDM">("NONE");
  const [forwardNote, setForwardNote] = useState("");
  const [instruction, setInstruction] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
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
      await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/summon`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: new Date(schedAt).toISOString(), note: summonNote || undefined }),
      });
      toast.success("Panggilan pembinaan dijadwalkan.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menjadwalkan");
    } finally {
      setActing(null);
    }
  }

  async function forward() {
    setActing("forward");
    try {
      await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/forward`, {
        method: "POST",
        body: JSON.stringify({ note: forwardNote || undefined }),
      });
      toast.success("Laporan diteruskan ke Camat.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal meneruskan");
    } finally {
      setActing(null);
    }
  }

  async function decide(kind: "FOLLOW_UP" | "NO_FOLLOW_UP") {
    if (kind === "FOLLOW_UP" && instruction.trim().length > 0 && instruction.trim().length < 5) {
      toast.error("Instruksi tindak lanjut minimal 5 karakter atau kosongkan.");
      return;
    }
    setActing(kind);
    try {
      await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          decision: kind,
          note: decisionNote.trim() || undefined,
          instruction: instruction.trim() || undefined,
        }),
      });
      toast.success(
        kind === "FOLLOW_UP"
          ? "Keputusan dicatat: surat teguran diterbitkan."
          : "Keputusan dicatat: diselesaikan melalui pembinaan Kasi.",
      );
      setInstruction("");
      setDecisionNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat keputusan");
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
      await apiFetch<WarningLetterDetail>(`/attendances/warning-letters/${id}/coaching`, {
        method: "PATCH",
        body: JSON.stringify({ result: result.trim(), followUp }),
      });
      toast.success("Hasil pembinaan dicatat.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat");
    } finally {
      setActing(null);
    }
  }

  return (
    <RequireAuth>
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
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
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{item.letterNumber}</h1>
                <StatusBadge status={item.workflowStatus ?? "DILAPORKAN"} />
                <button onClick={() => window.print()} className="no-print ml-auto rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                  Cetak
                </button>
              </div>
              <p className="mt-1 text-sm text-muted">
                {item.employee?.name} ({item.employee?.position}) • Pekan {String(item.weekStart).slice(0, 10)} s.d. {String(item.weekEnd).slice(0, 10)} • {item.absenceCount} TK
              </p>
              <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-relaxed">{item.content}</pre>
              {isEmployee ? (
                <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted">
                  Surat ini tercatat atas nama Anda. Gunakan tombol Cetak untuk menyimpan salinan.
                </p>
              ) : null}
            </div>

            {!isEmployee ? (
            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Alur laporan & keputusan</h2>
              <p className="mt-1 text-sm text-muted">
                Dibuat {new Date(item.createdAt).toLocaleString("id-ID", { hour12: false })}
              </p>
              {item.forwardAt ? (
                <p className="mt-1 text-sm text-muted">
                  Diteruskan Sekcam ke Camat{item.forwardNote ? `: ${item.forwardNote}` : ""} •{" "}
                  {new Date(item.forwardAt).toLocaleString("id-ID", { hour12: false })}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Belum diteruskan ke Camat.</p>
              )}
              {item.decision !== "PENDING" ? (
                <div className={`mt-3 rounded-lg border p-3 text-sm ${item.decision === "FOLLOW_UP" ? "border-warn-300 bg-warn-50 text-warn-800" : "border-info-200 bg-info-50 text-info-700"}`}>
                  <p className="font-semibold">
                    Keputusan Camat: {item.decision === "FOLLOW_UP" ? "Tindak lanjut dengan surat teguran" : "Tidak ada surat teguran — pembinaan Kasi"}
                  </p>
                  {item.decisionNote ? <p className="mt-1 whitespace-pre-wrap">{item.decisionNote}</p> : null}
                  {item.instruction ? <p className="mt-1"><b>Instruksi:</b> {item.instruction}</p> : null}
                  {item.decidedAt ? <p className="mt-1 text-xs opacity-80">{new Date(item.decidedAt).toLocaleString("id-ID", { hour12: false })}</p> : null}
                </div>
              ) : null}
              {canForward ? (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {!item.forwardAt && isSekcam ? (
                    <div className="flex flex-wrap gap-2">
                      <input value={forwardNote} onChange={(e) => setForwardNote(e.target.value)} placeholder="Catatan penerusan (opsional)" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      <button disabled={acting !== null} onClick={() => void forward()} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        {acting === "forward" ? "…" : "Teruskan ke Camat"}
                      </button>
                    </div>
                  ) : item.forwardAt && item.decision === "PENDING" && isCamat ? (
                    <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
                      <div>
                        <p className="text-sm font-semibold">Keputusan Camat</p>
                        <p className="text-xs text-muted">Pilih apakah laporan ditindaklanjuti dengan surat teguran atau diselesaikan melalui pembinaan Kasi.</p>
                      </div>
                      <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Instruksi tindak lanjut (opsional, min 5 karakter)" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Catatan keputusan (opsional)" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      <div className="flex flex-wrap gap-2">
                        <button disabled={acting !== null} onClick={() => void decide("FOLLOW_UP")} className="rounded-lg bg-warn-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                          {acting === "FOLLOW_UP" ? "…" : "Tindak lanjut — terbitkan surat teguran"}
                        </button>
                        <button disabled={acting !== null} onClick={() => void decide("NO_FOLLOW_UP")} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                          {acting === "NO_FOLLOW_UP" ? "…" : "Tidak tindak lanjut — pembinaan Kasi"}
                        </button>
                      </div>
                    </div>
                  ) : !item.forwardAt && isCamat ? (
                    <p className="text-sm text-muted">Menunggu laporan diteruskan oleh Sekcam.</p>
                  ) : item.forwardAt && item.decision === "PENDING" ? (
                    <p className="text-sm text-muted">Sudah diteruskan ke Camat; menunggu keputusan tindak lanjut.</p>
                  ) : (
                    <p className="text-sm text-muted">Keputusan Camat sudah dicatat.</p>
                  )}
                </div>
              ) : null}
            </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Pembinaan</h2>
              {item.decision === "NO_FOLLOW_UP" ? (
                <p className="mt-1 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-700">
                  Camat memutuskan tidak menerbitkan surat teguran. Laporan diselesaikan melalui pembinaan Kasi.
                </p>
              ) : item.summonScheduledAt ? (
                <p className="mt-1 text-sm text-muted">
                  Dipanggil: <b>{new Date(item.summonScheduledAt).toLocaleString("id-ID", { hour12: false })}</b>
                  {item.summonNote ? ` — ${item.summonNote}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Belum ada panggilan pembinaan.</p>
              )}
              {item.coachingResult ? (
                <p className="mt-1 text-sm text-muted">
                  Hasil: <b>{item.coachingResult}</b>{" "}
                  ({item.coachingFollowUp === "BKPSDM" ? "diteruskan ke BKPSDM" : "selesai internal"}
                  {item.coachedAt ? ` • ${new Date(item.coachedAt).toLocaleString("id-ID", { hour12: false })}` : ""})
                </p>
              ) : null}

              {(canManage || isKasi) && !isEmployee ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {item.decision === "PENDING" ? (
                    <p className="rounded-lg border border-warn-700/30 bg-warn-100 px-3 py-2 text-sm text-secondary">
                      {!item.forwardAt
                        ? "Laporan sudah masuk ke Sekcam. Pembinaan baru dapat dijadwalkan setelah Sekcam meneruskan laporan ke Camat dan Camat memutuskan tindak lanjut."
                        : "Menunggu keputusan Camat. Pembinaan baru dapat dijadwalkan setelah keputusan dicatat."}
                    </p>
                  ) : item.decision === "FOLLOW_UP" && !item.summonScheduledAt ? (
                    <div className="flex flex-wrap gap-2">
                      <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      <input value={summonNote} onChange={(e) => setSummonNote(e.target.value)} placeholder="Catatan panggilan (opsional)" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      <button disabled={acting !== null} onClick={() => void summon()} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        {acting === "summon" ? "…" : "Buat panggilan"}
                      </button>
                    </div>
                  ) : !item.coachingResult ? (
                    <div className="flex flex-wrap gap-2">
                      <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="Hasil pembinaan (min 5 karakter)*" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      {canManage ? (
                        <select value={followUp} onChange={(e) => setFollowUp(e.target.value as "NONE" | "BKPSDM")} className="rounded-lg border border-line px-3 py-2 text-sm">
                          <option value="NONE">Selesai internal</option>
                          <option value="BKPSDM">Teruskan ke BKPSDM</option>
                        </select>
                      ) : (
                        <span className="self-center rounded-lg bg-paper px-3 py-2 text-sm text-muted">Selesai melalui pembinaan Kasi</span>
                      )}
                      <button disabled={acting !== null} onClick={() => void coaching()} className="rounded-lg bg-ok-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        {acting === "coaching" ? "…" : "Catat hasil pembinaan"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Pembinaan selesai dicatat.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
