"use client";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { KgbDetail } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";
import { formatRupiah } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  verify: "Verifikasi",
  revise: "Minta revisi",
  paraf: "Paraf",
  approve: "Setujui",
  reject: "Tolak",
  register: "Register",
  tobkpsdm: "Kirim ke BKD",
  complete: "Selesai",
  archive: "Arsip",
};

const NOTE_REQUIRED = ["revise", "reject", "register"];

export default function KgbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string) {
    if (NOTE_REQUIRED.includes(action) && !note.trim()) {
      toast.error(
        action === "register"
          ? "Nomor surat keluar wajib diisi untuk Register."
          : "Catatan wajib diisi untuk aksi ini.",
      );
      return;
    }
    setActing(action);
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setDetail(data);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setActing(null);
    }
  }

  return (
    <AppShell>
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.requestNumber}</h1>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Pegawai</dt><dd className="font-medium">{detail.employee?.name}</dd></div>
                <div><dt className="text-muted">TMT</dt><dd className="font-medium">{detail.effectiveDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-muted">Golongan</dt><dd className="font-medium">{detail.oldRank} → {detail.newRank}</dd></div>
                <div><dt className="text-muted">Gaji</dt><dd className="font-medium">{formatRupiah(detail.oldSalary)} → {formatRupiah(detail.newSalary)}</dd></div>
                {detail.revisionNote ? <div><dt className="text-muted">Catatan revisi</dt><dd className="font-medium text-warn-700">{detail.revisionNote}</dd></div> : null}
                {detail.rejectionReason ? <div><dt className="text-muted">Alasan penolakan</dt><dd className="font-medium text-bad-700">{detail.rejectionReason}</dd></div> : null}
              </dl>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Aksi persetujuan</h2>
              {detail.availableActions?.length ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.availableActions.map((a) => (
                      <button
                        key={a}
                        disabled={acting !== null}
                        onClick={() => void act(a)}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                          a === "reject" ? "bg-bad-700 hover:brightness-110" : "bg-brand-900 hover:bg-brand-800"
                        }`}
                      >
                        {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      detail.availableActions?.includes("register")
                        ? "Nomor surat keluar (wajib untuk Register), mis. 800/001/KT/XI/2026"
                        : NOTE_REQUIRED.some((a) => detail.availableActions?.includes(a))
                          ? "Catatan (wajib untuk revisi/tolak)"
                          : "Catatan (opsional)"
                    }
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  {detail.availableActions?.includes("register") ? (
                    <p className="mt-1 text-xs text-muted">
                      Register mencatat nomor surat keluar. Buat nomornya di modul Surat Keluar lebih dulu bila belum ada.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Tidak ada aksi tersedia untuk Anda.</p>
              )}
            </div>

            {["APPROVED", "REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED"].includes(detail.status) ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Surat pengantar ke BKD</h2>
                <p className="mt-1 text-sm text-muted">
                  Cetak surat pengantar usulan KGB, lalu catat nomor surat keluar dan ekspedisinya
                  lewat modul Surat Keluar. Status KGB diperbarui terpisah dengan aksi di atas.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={`/kgb/${detail.id}/surat`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                  >
                    Buka surat pengantar (cetak)
                  </a>
                  {hasPermission("outgoing.create") ? (
                    <a
                      href={`/surat-keluar/baru?${new URLSearchParams({
                        subject: `Usulan Kenaikan Gaji Berkala a.n. ${detail.employee?.name ?? ""}`,
                        recipient: "Kepala Badan Kepegawaian dan Pengembangan SDM Daerah Kota Makassar",
                        signerName: detail.camat?.name ?? "",
                      }).toString()}`}
                      className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800"
                    >
                      Catat surat keluar
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Penandatangan: {detail.camat?.name ?? "Camat Tamalate"}
                  {detail.camat?.nip ? ` • NIP ${detail.camat.nip}` : ""}
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-semibold">{d.originalName}</span>
                    <span className="text-xs text-muted">({d.docType})</span>
                    <a href={`/api${d.downloadUrl}`} target="_blank" rel="noreferrer" className="ml-auto rounded-lg bg-brand-900 px-3 py-1 text-xs font-bold text-white hover:brightness-110">
                      Unduh
                    </a>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? <li className="text-muted">Belum ada dokumen.</li> : null}
              </ul>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Riwayat proses</h2>
              <ProcessTrail
                items={(detail.timeline ?? []).map((t, i, arr) => ({
                  title: `${t.action} — ${t.fromStatus} → ${t.toStatus}`,
                  subtitle: [t.actorName ?? t.actor, t.actorNip ? `NIP ${t.actorNip}` : null, t.actorPosition ?? null].filter(Boolean).join(" • "),
                  note: t.note,
                  time: new Date(t.createdAt).toLocaleString("id-ID"),
                  state:
                    i < arr.length - 1 || ["COMPLETED", "REJECTED"].includes(detail.status)
                      ? "done"
                      : "now",
                }))}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
