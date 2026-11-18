"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import type { PromotionBatch, PromotionItem } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  legalize: "Legalisasi",
  verify: "Verifikasi",
  paraf: "Paraf",
  approve: "Setujui",
  revise: "Minta Revisi",
  reject: "Tolak",
  register: "Catat Buku Agenda",
  tobkpsdm: "Catat Buku Ekspedisi",
  complete: "Catat Bukti Terima",
  archive: "Arsip",
};

const STEP_MAP: Record<string, number> = {
  DRAFT: 2,
  LEGALIZED: 3,
  VERIFIED: 4,
  PARAF: 5,
  APPROVED: 6,
  REGISTERED: 7,
  SUBMITTED_BKPSDMD: 8,
  COMPLETED: 9,
  ARCHIVED: 10,
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
  { label: "7. Buku Agenda", statuses: ["REGISTERED"] },
  { label: "8. Buku Ekspedisi", statuses: ["SUBMITTED_BKPSDMD"] },
  { label: "9. Bukti Terima", statuses: ["COMPLETED"] },
  { label: "10. Arsip", statuses: ["ARCHIVED"] },
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

// Lima berkas inti untuk demo/testing. Jenis lain tetap dapat diunduh bila
// sudah pernah diunggah, tetapi tidak lagi diminta sebagai checklist utama.
const CORE_DOCS = [
  { code: "DAFTAR_USUL", label: "Daftar Usul", hint: "Daftar usul mulai kenaikan pangkat ASN" },
  { code: "SK_CPNS", label: "SK CPNS", hint: "SK pengangkatan CPNS" },
  { code: "SK_PNS", label: "SK PNS/ASN", hint: "SK pengangkatan PNS/ASN" },
  {
    code: "SK_KENAIKAN_PANGKAT_TERAKHIR",
    label: "SK Pangkat Terakhir",
    hint: "SK kenaikan pangkat terakhir",
  },
  { code: "SKP_3_TAHUN", label: "SKP 3 Tahun", hint: "SKP tiga tahun terakhir" },
] as const;

type CoreDocCode = (typeof CORE_DOCS)[number]["code"];
type UploadSelection = Partial<Record<CoreDocCode, File>>;

const CORE_DOC_CODES: CoreDocCode[] = CORE_DOCS.map((d) => d.code);

function inferDocCode(name: string): CoreDocCode | null {
  const n = name.toLowerCase();
  if (n.includes("usul") || n.includes("daftar")) return "DAFTAR_USUL";
  if (n.includes("cpns")) return "SK_CPNS";
  if (n.includes("skp")) return "SKP_3_TAHUN";
  if (n.includes("pangkat") || n.includes("terakhir")) {
    return "SK_KENAIKAN_PANGKAT_TERAKHIR";
  }
  if (n.includes("pns")) return "SK_PNS";
  return null;
}

function uploadedCoreDoc(item: PromotionItem, code: string) {
  return item.documents.find((d) => d.docType === code) ?? null;
}

function selectedFileCount(selection?: UploadSelection): number {
  return Object.values(selection ?? {}).filter(Boolean).length;
}

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
  const [uploadSelections, setUploadSelections] = useState<Record<string, UploadSelection>>({});
  const [uploadEpoch, setUploadEpoch] = useState(0);
  const [uploading, setUploading] = useState<{ itemId: string; done: number; total: number } | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editTargetRank, setEditTargetRank] = useState("");
  const [editEffectiveDate, setEditEffectiveDate] = useState("");
  const [editCurrentRankTmt, setEditCurrentRankTmt] = useState("");
  const [editItemNote, setEditItemNote] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [expeditionSentDate, setExpeditionSentDate] = useState(new Date().toISOString().slice(0, 10));
  const [expeditionCourier, setExpeditionCourier] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedByName, setReceivedByName] = useState("BKPSDMD Kota Makassar");
  const [letterDate, setLetterDate] = useState(new Date().toISOString().slice(0, 10));
  const [agendaNumber, setAgendaNumber] = useState("");

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
    time: new Date(t.createdAt).toLocaleString("id-ID", { hour12: false }),
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

  function setSelectedFile(itemId: string, code: CoreDocCode, file: File | null) {
    if (file && file.size > 5 * 1024 * 1024) {
      toast.error(`${file.name} lebih dari 5MB.`);
      setUploadEpoch((n) => n + 1);
      return;
    }
    setUploadSelections((prev) => {
      const next = { ...(prev[itemId] ?? {}) };
      if (file) next[code] = file;
      else delete next[code];
      return { ...prev, [itemId]: next };
    });
  }

  function clearSelection(itemId: string, code: CoreDocCode) {
    setSelectedFile(itemId, code, null);
    setUploadEpoch((n) => n + 1);
  }

  function handleBulkSelect(itemId: string, files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const next = { ...(uploadSelections[itemId] ?? {}) };
    let added = 0;
    for (const file of list) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} lebih dari 5MB dan dilewati.`);
        continue;
      }
      const inferred = inferDocCode(file.name);
      const code =
        (inferred && !next[inferred] ? inferred : CORE_DOC_CODES.find((c) => !next[c])) ?? null;
      if (!code) {
        toast.error("Maksimal 5 berkas inti.");
        break;
      }
      next[code] = file;
      added += 1;
    }
    if (added > 0) setUploadSelections((prev) => ({ ...prev, [itemId]: next }));
    setUploadEpoch((n) => n + 1);
  }

  async function uploadDocuments(itemId: string) {
    const selection = uploadSelections[itemId] ?? {};
    const entries = Object.entries(selection).filter(([, file]) => Boolean(file)) as Array<
      [CoreDocCode, File]
    >;
    if (entries.length === 0) {
      toast.error("Pilih minimal satu berkas terlebih dahulu.");
      return;
    }

    setUploading({ itemId, done: 0, total: entries.length });
    const failed: UploadSelection = {};
    let failedCount = 0;
    let lastError = "";

    for (const [code, file] of entries) {
      const fd = new FormData();
      fd.append("docType", code);
      fd.append("file", file);
      try {
        await apiUpload(`/promotion-requests/${id}/items/${itemId}/documents`, fd);
      } catch (err) {
        failed[code] = file;
        failedCount += 1;
        lastError = err instanceof Error ? err.message : "Unggah gagal";
      } finally {
        setUploading((prev) =>
          prev && prev.itemId === itemId ? { ...prev, done: prev.done + 1 } : prev,
        );
      }
    }

    setUploading(null);
    setUploadEpoch((n) => n + 1);
    setUploadSelections((prev) => ({ ...prev, [itemId]: failed }));
    await load();

    if (failedCount > 0) {
      toast.error(`${entries.length - failedCount} berhasil, ${failedCount} gagal: ${lastError}`);
    } else {
      toast.success(`${entries.length} berkas berhasil diunggah sekaligus.`);
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
            {actions.filter((a) => a !== "tobkpsdm" && a !== "complete" && a !== "register").map((a) => {
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
                    {item.documentsChecklist.filter((c) => c.uploaded).length} / {item.documentsChecklist.length}
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
        {detail.items.map((item) => {
          const extraDocs = item.documents.filter((d) => !CORE_DOC_CODES.includes(d.docType as CoreDocCode));
          const coreUploaded = CORE_DOCS.filter((d) => uploadedCoreDoc(item, d.code)).length;
          const selectedCount = selectedFileCount(uploadSelections[item.id]);
          return (
            <div key={item.id} className="mb-4 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{item.employeeName} ({item.employeeNip ?? "—"})</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Cukup 5 berkas inti. Pilih beberapa berkas sekaligus, lalu unggah sekali.
                  </p>
                </div>
                <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line">
                  {coreUploaded} / 5 terunggah
                </span>
              </div>

              {item.missingDocuments.length > 0 ? (
                <p className="mt-2 rounded bg-bad-100 px-2 py-1 text-[11px] font-semibold text-bad-700">
                  Kurang: {item.missingDocuments.join(", ")}
                </p>
              ) : (
                <p className="mt-2 rounded bg-ok-100 px-2 py-1 text-[11px] font-semibold text-ok-700">
                  Lima dokumen inti sudah lengkap.
                </p>
              )}

              {canEdit && !isEmployee ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-white px-3 py-1.5 text-xs font-semibold hover:border-brand-700">
                    <span className="rounded bg-brand-900 px-2 py-1 text-white">Pilih beberapa berkas</span>
                    <span className="text-muted">atau pilih per dokumen</span>
                    <input
                      key={`bulk-${item.id}-${uploadEpoch}`}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => handleBulkSelect(item.id, e.target.files)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={acting !== null || uploading !== null || selectedCount === 0}
                    onClick={() => void uploadDocuments(item.id)}
                    className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {uploading && uploading.itemId === item.id
                      ? `Mengunggah ${uploading.done}/${uploading.total}…`
                      : `Unggah semua (${selectedCount})`}
                  </button>
                  {selectedCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadSelections((prev) => ({ ...prev, [item.id]: {} }));
                        setUploadEpoch((n) => n + 1);
                      }}
                      className="text-xs font-semibold text-muted hover:text-bad-700"
                    >
                      Bersihkan pilihan
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {CORE_DOCS.map((doc) => {
                  const uploaded = uploadedCoreDoc(item, doc.code);
                  const selected = uploadSelections[item.id]?.[doc.code];
                  return (
                    <div key={doc.code} className="rounded-lg border border-line bg-paper p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">{doc.label}</p>
                          <p className="text-[10px] text-muted">{doc.hint}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                            selected
                              ? "bg-info-100 text-info-700 ring-info-700/30"
                              : uploaded
                                ? "bg-ok-100 text-ok-700 ring-ok-700/30"
                                : "bg-bad-50 text-bad-700 ring-bad-700/30"
                          }`}
                        >
                          {selected ? "Siap" : uploaded ? "Ada" : "Belum"}
                        </span>
                      </div>

                      {uploaded ? (
                        <div className="mt-2 flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px]">
                          <a
                            href={fileUrl(uploaded.downloadUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-brand-900 hover:underline"
                          >
                            {uploaded.originalName}
                          </a>
                          {canEdit && !isEmployee ? (
                            <button
                              type="button"
                              onClick={() => void deleteDocument(item.id, uploaded.id)}
                              className="shrink-0 rounded p-0.5 text-bad-700 hover:bg-bad-50"
                              title="Hapus dokumen"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {canEdit && !isEmployee ? (
                        <div className="mt-2">
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold hover:bg-paper">
                            {uploaded ? "Ganti berkas" : "Pilih berkas"}
                            <input
                              key={`${item.id}-${doc.code}-${uploadEpoch}`}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              onChange={(e) =>
                                setSelectedFile(item.id, doc.code, e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {selected ? (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-brand-800">
                              <span className="min-w-0 flex-1 truncate">{selected.name}</span>
                              <button
                                type="button"
                                onClick={() => clearSelection(item.id, doc.code)}
                                className="shrink-0 text-muted hover:text-bad-700"
                              >
                                Batal
                              </button>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {extraDocs.length > 0 ? (
                <div className="mt-3 rounded-lg border border-line bg-paper p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Dokumen tambahan / lama
                  </p>
                  <div className="mt-1 space-y-1">
                    {extraDocs.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-2 rounded bg-white px-2 py-1 text-[11px]">
                        <span className="font-medium">{d.originalName}</span>
                        <span className="text-muted">({DOC_LABEL[d.docType] ?? d.docType})</span>
                        <a
                          href={downloadHref(d.downloadUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto rounded-md border border-line bg-white px-2 py-0.5 font-medium text-brand-900 hover:bg-paper"
                        >
                          Unduh
                        </a>
                        {canEdit && !isEmployee ? (
                          <button
                            type="button"
                            onClick={() => void deleteDocument(item.id, d.id)}
                            className="rounded p-0.5 text-bad-700 hover:bg-bad-50"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Surat Pengantar, Buku Agenda, Ekspedisi & Arsip */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Surat Pengantar &amp; Buku Ekspedisi</h2>
          <Link
            href={`/kenaikan-pangkat/${detail.id}/cetak/surat`}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand-900 hover:bg-paper"
          >
            Cetak surat pengantar
          </Link>
        </div>

        {actions.includes("register") ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted">Tanggal surat pengantar</label>
              <input
                type="date"
                value={letterDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setLetterDate(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Nomor agenda (opsional)</label>
              <input
                value={agendaNumber}
                onChange={(e) => setAgendaNumber(e.target.value)}
                placeholder="Otomatis memakai nomor surat"
                className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                disabled={acting !== null}
                onClick={() => void runAction("register", {
                  outgoingLetterDate: letterDate || undefined,
                  agendaNumber: agendaNumber.trim() || undefined,
                  note: note.trim() || undefined,
                })}
                className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {acting === "register" ? "Memproses…" : "Catat di Buku Agenda Surat Keluar"}
              </button>
            </div>
          </div>
        ) : null}

        {detail.outgoingLetter ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{detail.outgoingLetter.letterNumber}</dd></div>
            <div><dt className="text-muted">Tanggal Surat</dt><dd className="font-medium">{fmtDate(detail.outgoingLetter.letterDate)}</dd></div>
            <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{detail.outgoingLetter.subject}</dd></div>
            <div><dt className="text-muted">Tujuan</dt><dd className="font-medium">{detail.outgoingLetter.recipient ?? "-"}</dd></div>
            <div><dt className="text-muted">Penandatangan</dt><dd className="font-medium">{detail.outgoingLetter.signerName ?? "-"}</dd></div>
            <div><dt className="text-muted">Nomor Agenda</dt><dd className="font-medium">{detail.agendaNumber ?? "-"}</dd></div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Surat pengantar masih berupa pratinjau. Nomor surat terbit setelah dicatat di Buku Agenda Surat Keluar.
          </p>
        )}

        {detail.outgoingLetter ? (
          <div className="mt-4 rounded-lg border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Buku Ekspedisi Surat Keluar</p>
              <span className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-secondary ring-1 ring-inset ring-line">
                {detail.expeditionStatus === "DITERIMA" ? "Bukti terima lengkap"
                  : detail.expeditionStatus === "DIKIRIM" ? "Sudah diserahkan ke caraka"
                    : detail.expeditionStatus === "BELUM_DIKIRIM" ? "Belum diserahkan"
                      : "Belum dicatat"}
              </span>
            </div>
            {detail.outgoingLetter.outgoingExpedition ? (
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Nomor Ekspedisi</dt><dd className="font-medium">{detail.outgoingLetter.outgoingExpedition.regNumber}</dd></div>
                <div><dt className="text-muted">Tanggal Kirim</dt><dd className="font-medium">{fmtDate(detail.outgoingLetter.outgoingExpedition.sentDate)}</dd></div>
                <div><dt className="text-muted">Caraka</dt><dd className="font-medium">{detail.outgoingLetter.outgoingExpedition.courierName ?? "-"}</dd></div>
                <div><dt className="text-muted">Penerima Tujuan</dt><dd className="font-medium">{detail.outgoingLetter.outgoingExpedition.recipientName}</dd></div>
                <div><dt className="text-muted">Nomor Bukti Terima</dt><dd className="font-medium">{detail.outgoingLetter.outgoingExpedition.receiptNumber ?? "-"}</dd></div>
                <div><dt className="text-muted">Tanggal Terima</dt><dd className="font-medium">{fmtDate(detail.outgoingLetter.outgoingExpedition.receivedDate)}</dd></div>
                <div><dt className="text-muted">Diterima Oleh</dt><dd className="font-medium">{detail.outgoingLetter.outgoingExpedition.receivedByName ?? "-"}</dd></div>
              </dl>
            ) : null}

            {actions.includes("tobkpsdm") ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted">Tanggal ekspedisi</label>
                  <input
                    type="date"
                    value={expeditionSentDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setExpeditionSentDate(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Nama caraka</label>
                  <input
                    value={expeditionCourier}
                    onChange={(e) => setExpeditionCourier(e.target.value)}
                    placeholder="Kosongkan untuk memakai nama Anda"
                    className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    disabled={acting !== null}
                    onClick={() => void runAction("tobkpsdm", {
                      sentDate: expeditionSentDate || undefined,
                      courierName: expeditionCourier.trim() || undefined,
                      note: note.trim() || undefined,
                    })}
                    className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "tobkpsdm" ? "Memproses…" : "Catat penyerahan ke caraka"}
                  </button>
                </div>
              </div>
            ) : null}

            {actions.includes("complete") ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted">Nomor bukti terima</label>
                  <input
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="Nomor tanda terima BKPSDMD"
                    className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Tanggal terima</label>
                  <input
                    type="date"
                    value={receivedDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted">Diterima oleh</label>
                  <input
                    value={receivedByName}
                    onChange={(e) => setReceivedByName(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand-700"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    disabled={acting !== null || !receivedByName.trim()}
                    onClick={() => void runAction("complete", {
                      receivedDate: receivedDate || undefined,
                      receivedByName: receivedByName.trim() || undefined,
                      receiptNumber: receiptNumber.trim() || undefined,
                      note: note.trim() || undefined,
                    })}
                    className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "complete" ? "Memproses…" : "Catat bukti terima BKPSDMD"}
                  </button>
                </div>
              </div>
            ) : null}

            {detail.outgoingLetter.archiveRecord ? (
              <dl className="mt-3 grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Nomor Arsip</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.archiveNumber}</dd></div>
                <div><dt className="text-muted">Kategori</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.category}</dd></div>
                <div><dt className="text-muted">Lokasi</dt><dd className="font-medium">{detail.outgoingLetter.archiveRecord.location}</dd></div>
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>

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
                <p className="text-xs text-muted">{new Date(t.createdAt).toLocaleString("id-ID", { hour12: false })}</p>
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
