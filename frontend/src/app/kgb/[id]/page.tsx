"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { FileButton } from "@/components/form";
import { SignaturePad } from "@/components/signature";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import { loadSignature } from "@/lib/signature";
import type { KgbDetail } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";
import { formatRupiah } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  verify: "Verifikasi & tanda tangan",
  revise: "Minta revisi",
  paraf: "Paraf Sekcam",
  approve: "Validasi akhir & setujui (Camat)",
  reject: "Tolak",
  register: "Register",
  tobkpsdm: "Teruskan ke BKPSDM",
  complete: "Selesai",
  archive: "Arsip",
};

const NOTE_REQUIRED = ["revise", "reject", "register"];

const KGB_REQUIRED_DOCS = ["SK_CPNS_TERAKHIR", "SK_PANGKAT_TERAKHIR", "SKP_2_TAHUN"];

const DOC_LABEL: Record<string, string> = {
  SK_CPNS_TERAKHIR: "SK KGB/CPNS terakhir",
  SK_PANGKAT_TERAKHIR: "SK kenaikan pangkat terakhir",
  SKP_2_TAHUN: "SKP 2 tahun terakhir",
  KP4: "KP4",
  KTP: "KTP",
  NPWP: "NPWP",
  REKENING_GAJI: "Rekening gaji",
  LAINNYA: "Dokumen lain",
};

const DOC_OPTIONS = Object.keys(DOC_LABEL);

export default function KgbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [docType, setDocType] = useState("SK_CPNS_TERAKHIR");
  const [file, setFile] = useState<File | null>(null);

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
    if (action === "submit" && detail) {
      const have = new Set((detail.documents ?? []).map((d) => d.docType));
      const missing = KGB_REQUIRED_DOCS.filter((code) => !have.has(code));
      if (missing.length) {
        toast.error(
          `Lengkapi berkas wajib sebelum mengajukan: ${missing
            .map((code) => DOC_LABEL[code] ?? code)
            .join(", ")}.`,
        );
        return;
      }
    }
    if (NOTE_REQUIRED.includes(action) && !note.trim()) {
      toast.error(
        action === "register"
          ? "Nomor surat keluar wajib diisi untuk Register."
          : "Catatan wajib diisi untuk aksi ini.",
      );
      return;
    }
    if ((action === "verify" || action === "approve") && user && !loadSignature(user.username)) {
      toast.error("Simpan tanda tangan Anda terlebih dahulu sebelum memproses aksi ini.");
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

  async function uploadDocument() {
    if (!file) {
      toast.error("Pilih berkas terlebih dahulu.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("file", file);
      await apiUpload(`/kgb-requests/${id}/documents`, fd);
      setFile(null);
      toast.success("Berkas KGB diunggah.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah berkas gagal");
    } finally {
      setActing(null);
    }
  }

  async function removeDraft() {
    if (!window.confirm("Hapus draf KGB ini beserta dokumennya?")) return;
    setActing("delete");
    try {
      await apiFetch(`/kgb-requests/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Draf KGB dihapus.");
      router.replace("/kgb");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus draf");
    } finally {
      setActing(null);
    }
  }

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employee?.id;
  const isDraftEditable = !!detail && ["DRAFT", "REVISION"].includes(detail.status);
  const canManageDraft =
    isDraftEditable &&
    (isOwner || (!!user && user.role !== "EMPLOYEE" && hasPermission("kgb.create")));
  const canUpload = canManageDraft && hasPermission("kgb.document.upload");
  const canDelete = !!detail && detail.status === "DRAFT" && (isOwner || user?.role === "SUPER_ADMIN");
  const isSekcamActor = user?.role === "SUPER_ADMIN" || user?.position === "SEKCAM";
  const isCamatActor = user?.role === "SUPER_ADMIN" || user?.position === "CAMAT";
  // Permission kgb.paraf/kgb.approve dimiliki bersama oleh LEADER. Batasi UI
  // agar Sekcam hanya memparaf dan Camat yang melakukan validasi akhir.
  const visibleActions = (detail?.availableActions ?? []).filter((a) => {
    if (a === "paraf" && !isSekcamActor) return false;
    if (a === "approve" && !isCamatActor) return false;
    return true;
  });
  const needsSignature =
    !!detail &&
    ((detail.status === "SUBMITTED" && visibleActions.includes("verify")) ||
      (detail.status === "PARAF" && visibleActions.includes("approve")));

  return (
    <RequirePerm perm="kgb.view" label="KGB">
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
            {detail.revisionNote ? (
              <div className="rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3">
                <p className="text-sm font-semibold text-warn-700">Perlu perbaikan</p>
                <p className="mt-0.5 text-sm text-secondary">{detail.revisionNote}</p>
                {canManageDraft ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={`/kgb/${detail.id}/edit`}
                      className="inline-block rounded-lg bg-warn-700 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                    >
                      Perbaiki data
                    </Link>
                    {canUpload ? (
                      <a
                        href="#dokumen-kgb"
                        className="inline-block rounded-lg border border-warn-700/30 bg-surface px-3 py-1.5 text-sm font-semibold text-warn-700 hover:bg-warn-100"
                      >
                        Unggah berkas
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.requestNumber}</h1>
                <StatusBadge status={detail.status} />
                {canManageDraft ? (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Link
                      href={`/kgb/${detail.id}/edit`}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                    >
                      Edit data
                    </Link>
                    {canDelete ? (
                      <button
                        disabled={acting !== null}
                        onClick={() => void removeDraft()}
                        className="rounded-lg border border-bad-700/30 bg-surface px-3 py-1.5 text-sm font-medium text-bad-700 hover:bg-bad-100 disabled:opacity-50"
                      >
                        {acting === "delete" ? "…" : "Hapus draf"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Pegawai</dt><dd className="font-medium">{detail.employee?.name}</dd></div>
                <div><dt className="text-muted">TMT</dt><dd className="font-medium">{detail.effectiveDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-muted">Golongan</dt><dd className="font-medium">{detail.oldRank} → {detail.newRank}</dd></div>
                <div><dt className="text-muted">Gaji</dt><dd className="font-medium">{formatRupiah(detail.oldSalary)} → {formatRupiah(detail.newSalary)}</dd></div>
                {detail.note ? <div className="sm:col-span-2"><dt className="text-muted">Catatan pengajuan</dt><dd className="font-medium">{detail.note}</dd></div> : null}
                {detail.rejectionReason ? <div><dt className="text-muted">Alasan penolakan</dt><dd className="font-medium text-bad-700">{detail.rejectionReason}</dd></div> : null}
              </dl>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Aksi persetujuan</h2>
              {detail.status === "VERIFIED" && isSekcamActor ? (
                <div className="mt-2 rounded-lg border border-info-700/30 bg-info-100 px-3 py-2 text-sm text-secondary">
                  Kasubag sudah memverifikasi. Lakukan <b>Paraf Sekcam</b> untuk meneruskan ke Camat.
                </div>
              ) : null}
              {detail.status === "VERIFIED" && isCamatActor && !isSekcamActor ? (
                <div className="mt-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted">
                  Menunggu paraf Sekcam. Validasi akhir Camat tersedia setelah tahap paraf selesai.
                </div>
              ) : null}
              {detail.status === "PARAF" && isCamatActor ? (
                <div className="mt-2 rounded-lg border border-ok-700/30 bg-ok-100 px-3 py-2 text-sm text-secondary">
                  Sudah diparaf Sekcam. Lakukan <b>Validasi akhir &amp; setujui (Camat)</b> dan simpan tanda tangan Camat.
                </div>
              ) : null}
              {visibleActions.length ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visibleActions.map((a) => (
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
                  {needsSignature && user ? (
                    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                      <p className="text-sm font-semibold">
                        {detail.status === "SUBMITTED"
                          ? "Tanda tangan Kasubag (verifikasi)"
                          : "Tanda tangan Camat (validasi akhir)"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Tanda tangan disimpan di browser ini dan dipakai pada pratinjau surat KGB.
                      </p>
                      <div className="mt-2">
                        <SignaturePad username={user.username} />
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      visibleActions.includes("register")
                        ? "Nomor surat keluar (wajib untuk Register), mis. 800/001/KT/XI/2026"
                        : NOTE_REQUIRED.some((a) => visibleActions.includes(a))
                          ? "Catatan (wajib untuk revisi/tolak)"
                          : "Catatan (opsional)"
                    }
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  {visibleActions.includes("register") ? (
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
                <h2 className="font-semibold">Surat pengantar ke BKPSDM</h2>
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
                  Penandatangan: {detail.camat?.name ?? "................"}
                  {detail.camat?.nip ? ` • NIP ${detail.camat.nip}` : ""}
                </p>
              </div>
            ) : null}

            <div id="dokumen-kgb" className="scroll-mt-4 rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-semibold">{d.originalName}</span>
                    <span className="text-xs text-muted">({DOC_LABEL[d.docType] ?? d.docType})</span>
                    <a
                      href={fileUrl(d.downloadUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto rounded-lg bg-brand-900 px-3 py-1 text-xs font-bold text-white hover:brightness-110"
                    >
                      Unduh
                    </a>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? <li className="text-muted">Belum ada dokumen.</li> : null}
              </ul>

              {canUpload ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm font-semibold">
                    {detail.status === "REVISION" ? "Unggah berkas perbaikan" : "Lengkapi berkas KGB"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Backend belum menyediakan hapus dokumen; unggah ulang berkas pengganti dengan jenis yang sama bila perlu.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto] print:block">
                    <FileButton
                      hint="PDF/JPG/PNG, maks 5MB"
                      onSelect={setFile}
                    />
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
                    >
                      {DOC_OPTIONS.map((code) => (
                        <option key={code} value={code}>{DOC_LABEL[code]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => void uploadDocument()}
                      className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {acting === "upload" ? "Mengunggah…" : "Unggah"}
                    </button>
                  </div>
                </div>
              ) : null}
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
                    i < arr.length - 1 || ["COMPLETED", "REJECTED", "ARCHIVED"].includes(detail.status)
                      ? "done"
                      : "now",
                }))}
              />
            </div>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
