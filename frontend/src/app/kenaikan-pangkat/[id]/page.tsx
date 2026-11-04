"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { FileButton } from "@/components/form";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import type { PromotionBatch, PromotionItem, PromotionItemStatus } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  legalize: "Legalisasi",
  verify: "Verifikasi",
  paraf: "Paraf",
  approve: "Setujui",
  revise: "Minta Revisi",
  reject: "Tolak",
  register: "Register",
  archive: "Arsip",
};

const STEP_MAP: Record<string, number> = {
  DRAFT: 2,
  LEGALIZED: 3,
  VERIFIED: 4,
  PARAF: 5,
  APPROVED: 6,
  REGISTERED: 7,
  ARCHIVED: 8,
  REVISION: 0,
  REJECTED: 0,
};

const STEP_LABELS: Array<{ label: string; statuses: string[] }> = [
  { label: "1. Data calon", statuses: ["DRAFT", "REVISION"] },
  { label: "2. Draf usulan", statuses: ["DRAFT", "REVISION"] },
  { label: "3. Legalisasi", statuses: ["LEGALIZED"] },
  { label: "4. Verifikasi Kasubag", statuses: ["VERIFIED"] },
  { label: "5. Paraf Sekcam", statuses: ["PARAF"] },
  { label: "6. TTD Camat", statuses: ["APPROVED"] },
  { label: "7. Registrasi & Kirim", statuses: ["REGISTERED"] },
  { label: "8. Arsip", statuses: ["ARCHIVED"] },
];

const DOC_LABEL: Record<string, string> = {
  DAFTAR_USUL: "Daftar Usul Mulai Kenaikan Pangkat ASN",
  SK_CPNS: "SK CPNS",
  SK_PNS: "SK PNS/ASN",
  SK_TERAKHIR: "SK Terakhir",
  SKP_3_TAHUN: "SKP 3 Tahun Terakhir",
  KARPEG_NIP_BARU: "Karpeg + NIP Baru",
  IJAZAH_TRANSKRIP: "Ijazah Terakhir + Transkrip Nilai",
  SK_MUTASI: "SK Mutasi",
  SK_KENAIKAN_PANGKAT_TERAKHIR: "SK Kenaikan Pangkat Terakhir",
  SK_JABATAN_ATASAN: "SK Jabatan Atasan",
  LAINNYA: "Dokumen lain",
};

const DOC_OPTIONS = Object.keys(DOC_LABEL);

function periodLabel(y: number, m?: number | null): string {
  const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const downloadHref = (url: string) =>
  "/api" + url.replace(/^\/api\/v1/, "");

export default function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [detail, setDetail] = useState<PromotionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [docType, setDocType] = useState("DAFTAR_USUL");
  const [file, setFile] = useState<File | null>(null);
  const [itemDocType, setItemDocType] = useState("DAFTAR_USUL");
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editTargetRank, setEditTargetRank] = useState("");
  const [editEffectiveDate, setEditEffectiveDate] = useState("");
  const [editCurrentRankTmt, setEditCurrentRankTmt] = useState("");
  const [editItemNote, setEditItemNote] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<PromotionBatch>(`/promotion-requests/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail usulan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmployee = user?.role === "EMPLOYEE";
  const canEdit = detail?.canEdit ?? false;
  const actions = detail?.availableActions ?? [];
  const stepIndex = STEP_MAP[detail?.status ?? "DRAFT"] ?? 0;
  const currentStep = stepIndex > 0 ? stepIndex : 1;

  const trail = (detail?.timeline ?? []).map((t, i, arr) => ({
    title: `${t.action} — ${t.fromStatus} → ${t.toStatus}`,
    subtitle: [t.actorName ?? t.actorRole, t.actorPosition ?? null].filter(Boolean).join(" • "),
    note: t.note,
    time: new Date(t.createdAt).toLocaleString("id-ID"),
    state:
      (i < arr.length - 1 ||
      ["ARCHIVED", "REJECTED"].includes(detail?.status ?? "")
        ? "done"
        : "now") as "done" | "now" | "todo",
  }));

  async function runAction(action: string, body: unknown) {
    if ((action === "revise" || action === "reject") && !note.trim()) {
      toast.error("Catatan wajib minimal 5 karakter.");
      return;
    }
    setActing(action);
    try {
      const { data } = await apiFetch<PromotionBatch>(
        `/promotion-requests/${id}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setDetail(data);
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Aksi ${action} gagal`);
    } finally {
      setActing(null);
    }
  }

  async function uploadDocument(itemId: string) {
    if (!itemFile) {
      toast.error("Pilih berkas terlebih dahulu.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("docType", itemDocType);
      fd.append("file", itemFile);
      await apiUpload(`/promotion-requests/${id}/items/${itemId}/documents`, fd);
      setItemFile(null);
      toast.success("Berkas diunggah.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah berkas gagal");
    } finally {
      setActing(null);
    }
  }

  async function deleteDocument(itemId: string, docId: string) {
    if (!window.confirm("Hapus dokumen ini?")) return;
    setActing("delete");
    try {
      await apiFetch(
        `/promotion-requests/${id}/items/${itemId}/documents/${docId}`,
        { method: "DELETE" },
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hapus dokumen gagal");
    } finally {
      setActing(null);
    }
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("Hapus item ini dari usulan?")) return;
    setActing("delete");
    try {
      await apiFetch(`/promotion-requests/${id}/items/${itemId}`, {
        method: "DELETE",
      });
      toast.success("Item dihapus.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hapus item gagal");
    } finally {
      setActing(null);
    }
  }

  async function deleteDraft() {
    if (!window.confirm("Hapus draf usulan ini beserta item dan dokumennya?")) return;
    setActing("delete");
    try {
      await apiFetch(`/promotion-requests/${id}`, { method: "DELETE" });
      toast.success("Draf usulan dihapus.");
      router.replace("/kenaikan-pangkat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus draf");
    } finally {
      setActing(null);
    }
  }

  async function saveItem(itemId: string) {
    setSavingItemId(itemId);
    try {
      // Backend hanya menerima YYYY-MM-DD; currentRankTmt dari API berbentuk ISO penuh.
      const currentRankTmt = editCurrentRankTmt ? editCurrentRankTmt.slice(0, 10) : undefined;
      await apiFetch(`/promotion-requests/${id}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          targetRank: editTargetRank.trim() || undefined,
          effectiveDate: editEffectiveDate ? editEffectiveDate.slice(0, 10) : undefined,
          currentRankTmt,
          note: editItemNote.trim() || undefined,
        }),
      });
      toast.success("Item usulan diperbarui.");
      setEditItemId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan item usulan");
    } finally {
      setSavingItemId(null);
    }
  }

  if (loading) {
    return (
      <RequirePerm perm="promotion.view" label="Detail Usulan Kenaikan Pangkat">
        <Skeleton className="mt-4 h-64 w-full" />
      </RequirePerm>
    );
  }
  if (error) {
    return (
      <RequirePerm perm="promotion.view" label="Detail Usulan Kenaikan Pangkat">
        <ErrorBox message={error} />
      </RequirePerm>
    );
  }
  if (!detail) {
    return (
      <RequirePerm perm="promotion.view" label="Detail Usulan Kenaikan Pangkat">
        <EmptyState title="Usulan kenaikan pangkat tidak ditemukan" />
      </RequirePerm>
    );
  }

  const isOwner = !!user?.employee && detail.items.some((i) => i.employeeId === user?.employee?.id);

  return (
    <RequirePerm perm="promotion.view" label="Detail Usulan Kenaikan Pangkat">
      <button onClick={() => router.push("/kenaikan-pangkat")} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali ke daftar usulan
      </button>

      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold">{detail.batchNumber}</h1>
          <StatusBadge status={detail.status} />
          {detail.revisionNote ? (
            <span className="rounded bg-warn-100 px-2 py-0.5 text-[11px] font-semibold text-warn-700">
              Perlu revisi
            </span>
          ) : null}
          {detail.rejectionReason ? (
            <span className="rounded bg-bad-100 px-2 py-0.5 text-[11px] font-semibold text-bad-700">
              Ditolak
            </span>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Periode</dt><dd className="font-medium">{periodLabel(detail.periodYear, detail.periodMonth)}</dd></div>
          <div><dt className="text-muted">Jumlah ASN</dt><dd className="font-medium">{detail.items.length}</dd></div>
          <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{detail.outgoingLetterNumber ?? "-"}</dd></div>
          <div><dt className="text-muted">Nomor Agenda</dt><dd className="font-medium">{detail.agendaNumber ?? "-"}</dd></div>
          {detail.note ? <div className="sm:col-span-2"><dt className="text-muted">Catatan</dt><dd className="font-medium">{detail.note}</dd></div> : null}
          {detail.revisionNote ? <div className="sm:col-span-2"><dt className="text-muted">Catatan Revisi</dt><dd className="font-medium text-warn-700">{detail.revisionNote}</dd></div> : null}
          {detail.rejectionReason ? <div className="sm:col-span-2"><dt className="text-muted">Alasan Penolakan</dt><dd className="font-medium text-bad-700">{detail.rejectionReason}</dd></div> : null}
        </dl>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Proses Usulan</h2>
        <ProcessTrail items={trail} />
      </div>

      {/* Panel Aksi */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Aksi</h2>
        {actions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => {
              const disabled = acting !== null;
              let body: unknown = { note: note.trim() || undefined };
              if (a === "legalize") {
                body = { stampNumber: "", legalizedAt: new Date().toISOString().slice(0, 10), note: note.trim() || undefined };
              }
              if (a === "verify") {
                body = { documentsComplete: true, note: note.trim() || undefined };
              }
              if (a === "register") {
                body = { outgoingLetterDate: new Date().toISOString().slice(0, 10), note: note.trim() || undefined };
              }
              if (a === "archive") {
                body = { archiveDate: new Date().toISOString().slice(0, 10), category: "AKTIF", note: note.trim() || undefined };
              }
              return (
                <button
                  key={a}
                  disabled={disabled}
                  onClick={() => void runAction(a, body)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${a === "reject" ? "bg-bad-700 hover:brightness-110" : "bg-brand-900 hover:bg-brand-800"}`}
                >
                  {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">Tidak ada aksi tersedia untuk Anda.</p>
        )}
        {actions.some((a) => a === "revise" || a === "reject") ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan revisi/penolakan (min 5 karakter)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
        ) : null}
      </div>

      {/* Tabel Item */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Daftar ASN ({detail.items.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">NIP</th>
                <th className="px-3 py-2 font-medium">Gol. Saat Ini</th>
                <th className="px-3 py-2 font-medium">Gol. Diusulkan</th>
                <th className="px-3 py-2 font-medium">TMT Pangkat</th>
                <th className="px-3 py-2 font-medium">TMT Kenaikan</th>
                <th className="px-3 py-2 font-medium">Masa Jabatan</th>
                <th className="px-3 py-2 font-medium">Status Item</th>
                <th className="px-3 py-2 font-medium">Dokumen</th>
                {canEdit && !isEmployee ? <th className="px-3 py-2 font-medium">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-3 py-2.5 font-medium">{item.employeeName}</td>
                  <td className="px-3 py-2.5 text-muted">{item.employeeNip ?? "—"}</td>
                  <td className="px-3 py-2.5">{item.currentRank ?? "—"}</td>
                  <td className="px-3 py-2.5">{item.targetRank}</td>
                  <td className="px-3 py-2.5">{fmtDate(item.currentRankTmt)}</td>
                  <td className="px-3 py-2.5">{fmtDate(item.effectiveDate)}</td>
                  <td className="px-3 py-2.5 text-muted">{item.yearsInCurrentRank ?? "—"} th</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded bg-paper px-1.5 py-0.5 text-[11px] ring-1 ring-inset ring-line ${
                      item.status === "VERIFIED" || item.status === "APPROVED" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"
                    }`}>
                      {item.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {item.documents.length} / {item.documentsChecklist.length}
                    {item.missingDocuments.length > 0 ? (
                      <span className="ml-1 text-xs text-bad-700">({item.missingDocuments.join(", ")})</span>
                    ) : null}
                  </td>
                  {canEdit && !isEmployee ? (
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {editItemId === item.id ? (
                          <>
                            <input
                              value={editTargetRank}
                              onChange={(e) => setEditTargetRank(e.target.value)}
                              placeholder="Gol."
                              className="rounded border border-line px-2 py-1 text-[11px] outline-none focus:border-brand-700"
                            />
                            <input
                              type="date"
                              value={editCurrentRankTmt}
                              onChange={(e) => setEditCurrentRankTmt(e.target.value)}
                              aria-label="TMT Pangkat"
                              title="TMT Pangkat"
                              className="rounded border border-line px-2 py-1 text-[11px] outline-none focus:border-brand-700"
                            />
                            <input
                              type="date"
                              value={editEffectiveDate}
                              onChange={(e) => setEditEffectiveDate(e.target.value)}
                              aria-label="TMT Kenaikan"
                              title="TMT Kenaikan"
                              className="rounded border border-line px-2 py-1 text-[11px] outline-none focus:border-brand-700"
                            />
                            <button
                              disabled={savingItemId === item.id}
                              onClick={() => void saveItem(item.id)}
                              className="rounded bg-brand-900 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                            >
                              {savingItemId === item.id ? "Menyimpan…" : "Simpan"}
                            </button>
                            <button
                              disabled={savingItemId === item.id}
                              onClick={() => setEditItemId(null)}
                              className="rounded border border-line px-2 py-1 text-[11px] text-ink disabled:opacity-50"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditItemId(item.id);
                                setEditTargetRank(item.targetRank);
                                setEditEffectiveDate(item.effectiveDate.slice(0, 10));
                                setEditCurrentRankTmt((item.currentRankTmt ?? "").slice(0, 10));
                                setEditItemNote("");
                              }}
                              className="rounded border border-line px-2 py-1 text-[11px] text-brand-800 hover:bg-paper"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void deleteItem(item.id)}
                              className="rounded border border-bad-700/30 px-2 py-1 text-[11px] text-bad-700 hover:bg-bad-50"
                            >
                              Hapus
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit && !isEmployee && detail.status !== "DRAFT" && detail.status !== "REVISION" ? (
          <p className="mt-2 text-xs text-muted">Edit item hanya tersedia pada status Draf atau Perlu Revisi.</p>
        ) : null}

        {canEdit && !isEmployee && (
          <div className="mt-3 rounded-lg border border-dashed border-line bg-paper p-3">
            <h3 className="text-sm font-semibold">Tambah Item ASN</h3>
            <p className="mt-0.5 text-xs text-muted">
              Pilih calon dari halaman Daftar Calon untuk membuat usulan baru. Item hanya bisa ditambah saat status Draf/Revisi.
            </p>
          </div>
        )}
      </div>

      {/* Dokumen per item */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Dokumen per ASN</h2>
        {detail.items.map((item) => (
          <div key={item.id} className="mb-4 border-t border-line pt-3">
            <h3 className="text-sm font-semibold">{item.employeeName} ({item.employeeNip ?? "—"})</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {item.documentsChecklist.map((c) => (
                <span
                  key={c.code}
                  title={c.uploaded ? `Diunggah: ${c.originalName ?? "-"}` : "Belum diunggah"}
                  className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
                    c.uploaded ? "bg-ok-100 text-ok-700 ring-ok-700/30" : "bg-bad-50 text-bad-700 ring-bad-700/30"
                  }`}
                >
                  {c.uploaded ? "✓" : "○"} {c.label}
                </span>
              ))}
              {item.missingDocuments.length > 0 ? (
                <span className="ml-2 rounded bg-bad-100 px-1.5 py-0.5 text-[11px] font-semibold text-bad-700">
                  Kurang: {item.missingDocuments.join(", ")}
                </span>
              ) : null}
            </div>
            <div className="mt-2 space-y-1">
              {item.documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                  <span className="font-medium">{d.originalName}</span>
                  <span className="text-xs text-muted">({DOC_LABEL[d.docType] ?? d.docType})</span>
                  <a
                    href={downloadHref(d.downloadUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded-md border border-line bg-white px-2 py-1 text-[11px] font-medium text-brand-900 hover:bg-paper"
                  >
                    Unduh
                  </a>
                  {canEdit && !isEmployee ? (
                    <button
                      onClick={() => void deleteDocument(item.id, d.id)}
                      className="ml-1 text-bad-700 hover:bg-bad-50 rounded p-1"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {item.documents.length === 0 ? (
                <p className="text-xs text-muted">Belum ada dokumen.</p>
              ) : null}
              {canEdit && !isEmployee && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <select
                    value={itemDocType}
                    onChange={(e) => setItemDocType(e.target.value)}
                    className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  >
                    {DOC_OPTIONS.map((code) => (
                      <option key={code} value={code}>{DOC_LABEL[code]}</option>
                    ))}
                  </select>
                  <FileButton hint="PDF/JPG/PNG, maks 5MB" onSelect={setItemFile} />
                  <button
                    disabled={acting !== null || !itemFile}
                    onClick={() => void uploadDocument(item.id)}
                    className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {acting === "upload" ? "Mengunggah…" : "Unggah"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Surat Keluar & Arsip */}
      {detail.outgoingLetter && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 className="font-semibold mb-3">Surat Keluar</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{detail.outgoingLetter.letterNumber}</dd></div>
            <div><dt className="text-muted">Tanggal Surat</dt><dd className="font-medium">{detail.outgoingLetter.letterDate.slice(0, 10)}</dd></div>
            <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{detail.outgoingLetter.subject}</dd></div>
            <div><dt className="text-muted">Tujuan</dt><dd className="font-medium">{detail.outgoingLetter.recipient ?? "-"}</dd></div>
            <div><dt className="text-muted">Penandatangan</dt><dd className="font-medium">{detail.outgoingLetter.signerName ?? "-"}</dd></div>
            {detail.outgoingLetter.archiveRecord ? (
              <>
                <div><dt className="text-muted">Nomor Arsip</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.archiveNumber}</dd></div>
                <div><dt className="text-muted">Kategori</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.category}</dd></div>
                <div><dt className="text-muted">Lokasi</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.location}</dd></div>
              </>
            ) : null}
          </dl>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Timeline</h2>
        {detail.timeline.length === 0 ? (
          <p className="text-sm text-muted">Belum ada catatan timeline.</p>
        ) : (
          <ul className="space-y-3">
            {detail.timeline.map((t) => (
              <li key={t.createdAt} className="border-b pb-2 last:border-0">
                <p className="text-sm font-medium">{t.action}</p>
                <p className="text-xs text-muted">
                  {t.fromStatus} → {t.toStatus} • {t.actorName ?? t.actorRole}{t.actorPosition ? ` (${t.actorPosition})` : ""}
                </p>
                {t.note ? <p className="text-xs text-muted mt-1">“{t.note}”</p> : null}
                <p className="text-xs text-muted">{new Date(t.createdAt).toLocaleString("id-ID")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Signers */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold mb-3">Pejabat</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Camat</dt><dd className="font-medium">{detail.signers.camat?.name ?? "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{detail.signers.camat?.nip ?? "-"}</dd></div>
          <div><dt className="text-muted">Sekcam</dt><dd className="font-medium">{detail.signers.sekcam?.name ?? "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{detail.signers.sekcam?.nip ?? "-"}</dd></div>
        </dl>
      </div>

      {canEdit && !isEmployee && detail.status === "DRAFT" ? (
        <div className="mt-4">
          <button
            disabled={acting !== null}
            onClick={() => void deleteDraft()}
            className="rounded-lg border border-bad-700/30 bg-surface px-3 py-1.5 text-sm font-medium text-bad-700 hover:bg-bad-100 disabled:opacity-50"
          >
            {acting === "delete" ? "…" : "Hapus Draf Usulan"}
          </button>
        </div>
      ) : null}
    </RequirePerm>
  );
}
