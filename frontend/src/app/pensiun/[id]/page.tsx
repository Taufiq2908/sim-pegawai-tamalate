"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import { FileButton } from "@/components/form";
import { toast } from "@/components/toast";
import type { PensionBatch, PensionItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge, ProcessTrail, TrailEntry } from "@/components/ui";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
function periodLabel(y: number, m?: number | null): string {
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  VERIFIED: "Terverifikasi",
  REVISION: "Perlu revisi",
  REJECTED: "Ditolak",
};

const DOC_TYPES = [
  "SK_CPNS",
  "SK_PNS",
  "SK_PANGKAT_TERAKHIR",
  "SK_JABATAN_TERAKHIR",
  "KTP",
  "KK",
  "NPWP",
  "REKENING_GAJI",
  "PAS_FOTO",
  "SKP_2_TAHUN",
  "SURAT_KETERANGAN_SEHAT",
  "SURAT_PERNYATAAN",
  "LAINNYA",
];

const ACTION_LABEL: Record<string, string> = {
  verify: "Verifikasi",
  revise: "Minta Revisi",
  reject: "Tolak",
  paraf: "Paraf",
  approve: "Setujui",
  register: "Register",
  expedite: "Ekspedisi",
  send: "Kirim",
  complete: "Selesai",
  archive: "Arsipkan",
};

export default function PensiunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("pension.document.upload");

  const [batch, setBatch] = useState<PensionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<PensionBatch>(`/pension-requests/${id}`);
      setBatch(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail usulan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <div className="mt-4"><Skeleton className="h-64 w-full" /></div>
      </RequirePerm>
    );
  }
  if (error) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <ErrorBox message={error} onRetry={load} />
      </RequirePerm>
    );
  }
  if (!batch) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <EmptyState title="Usulan pensiun tidak ditemukan" />
      </RequirePerm>
    );
  }

  const statusIndex = ["DRAFT","VERIFIED","PARAF","APPROVED","REGISTERED","EXPEDITED","SENT","COMPLETED"].indexOf(batch.status);
  const currentStep = statusIndex >= 0 ? statusIndex : 0;

  const trail: TrailEntry[] = (batch.timeline ?? []).map((t) => ({
    title: t.action,
    subtitle: t.note ?? undefined,
    time: t.createdAt,
    state:
      t.toStatus === batch.status
        ? "now"
        : ["DRAFT","VERIFIED","PARAF","APPROVED","REGISTERED","EXPEDITED","SENT","COMPLETED"].indexOf(t.fromStatus) < currentStep
          ? "done"
          : "todo",
  }));

  const isDraftOrRevision = batch.status === "DRAFT" || batch.status === "REVISION";

  async function uploadDocument(itemId: string) {
    if (!docFile) {
      toast.error("Pilih file dulu (pdf/jpg/png, max 5MB).");
      return;
    }
    if (!docType) {
      toast.error("Pilih jenis dokumen.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("file", docFile);
      fd.append("docType", docType);
      await apiUpload(`/pension-requests/${id}/items/${itemId}/documents`, fd);
      setDocFile(null);
      setDocType("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah gagal");
    } finally {
      setActing(null);
    }
  }

  async function deleteDocument(itemId: string, docId: string) {
    if (!confirm("Hapus dokumen ini?")) return;
    setActing("delete");
    try {
      await apiFetch(`/pension-requests/${id}/items/${itemId}/documents/${docId}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hapus gagal");
    } finally {
      setActing(null);
    }
  }

  async function runAction(action: string, body: unknown) {
    setActing(action);
    try {
      await apiFetch(`/pension-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Aksi ${action} gagal`);
    } finally {
      setActing(null);
    }
  }

  return (
    <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-4 space-y-4">
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">{batch.batchNumber}</h1>
              <p className="text-sm text-muted">
                {batch.statusLabel} • {batch.items?.length ?? 0} PNS
              </p>
            </div>
            <div className="flex gap-2">
              {batch.availableActions?.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    if (a === "verify") {
                      if (!confirm("Konfirmasi dokumen lengkap?")) return;
                      void runAction(a, { documentsComplete: true, note: "" });
                    } else if (a === "revise" || a === "reject") {
                      const note = prompt("Catatan revisi/penolakan (min 5 karakter):");
                      if (!note) return;
                      void runAction(a, { note });
                    } else if (a === "register") {
                      const date = prompt("Tanggal surat keluar (YYYY-MM-DD):");
                      if (!date) return;
                      void runAction(a, {
                        createOutgoingLetter: true,
                        outgoingLetterDate: date,
                        classificationCode: "800.1.6.6",
                        note: "Dicatat di buku agenda keluar",
                      });
                    } else if (a === "expedite") {
                      const courier = prompt("Nama pendistribusi:");
                      if (!courier) return;
                      void runAction(a, {
                        expeditionNumber: `EKSP-${batch.batchNumber}`,
                        expeditionDate: new Date().toISOString().slice(0, 10),
                        courierName: courier,
                        note: "",
                      });
                    } else if (a === "send") {
                      const receipt = prompt("Nomor tanda terima:");
                      if (!receipt) return;
                      const date = prompt("Tanggal tanda terima (YYYY-MM-DD):");
                      if (!date) return;
                      void runAction(a, { receiptNumber: receipt, receiptDate: date, note: "" });
                    } else {
                      void runAction(a, { note: "" });
                    }
                  }}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper disabled:opacity-50"
                  disabled={acting !== null}
                >
                  {ACTION_LABEL[a] ?? a}
                </button>
              ))}
            </div>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Nomor Usulan</dt><dd className="font-medium">{batch.batchNumber}</dd></div>
            <div><dt className="text-muted">Periode</dt><dd className="font-medium">{periodLabel(batch.periodYear, batch.periodMonth)}</dd></div>
            <div><dt className="text-muted">Usia BUP</dt><dd className="font-medium">{batch.bupAge} tahun</dd></div>
            <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={batch.status} /></dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">Catatan</dt><dd className="font-medium">{batch.note ?? "-"}</dd></div>
            {batch.outgoingLetterNumber && (
              <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{batch.outgoingLetterNumber}</dd></div>
            )}
            {batch.agendaNumber && (
              <div><dt className="text-muted">Nomor Agenda</dt><dd className="font-medium">{batch.agendaNumber}</dd></div>
            )}
            {batch.expeditionNumber && (
              <div><dt className="text-muted">Nomor Ekspedisi</dt><dd className="font-medium">{batch.expeditionNumber}</dd></div>
            )}
            {batch.receiptNumber && (
              <div><dt className="text-muted">Nomor Tanda Terima</dt><dd className="font-medium">{batch.receiptNumber}</dd></div>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 print:hidden">
            <a
              href={`/pensiun/${batch.id}/cetak/nominatif`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
            >
              Cetak daftar nominatif
            </a>
            <a
              href={`/pensiun/${batch.id}/cetak/surat`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Cetak surat usulan
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Proses Usulan</h2>
          <ProcessTrail items={trail} />
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Daftar PNS ({batch.items?.length ?? 0})</h2>
          {batch.items.length === 0 ? (
            <p className="text-sm text-muted">Belum ada PNS dalam usulan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-paper text-xs text-muted">
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">NIP</th>
                    <th className="px-3 py-2">Golongan</th>
                    <th className="px-3 py-2">Jabatan</th>
                    <th className="px-3 py-2">Tgl. Pensiun</th>
                    <th className="px-3 py-2">Masa Kerja</th>
                    <th className="px-3 py-2">Status Item</th>
                    <th className="px-3 py-2">Dokumen</th>
                    {canUpload && isDraftOrRevision ? <th className="px-3 py-2">Aksi</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {batch.items.map((item) => (
                    <Fragment key={item.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.employeeName}</td>
                        <td className="px-3 py-2">{item.employeeNip ?? "-"}</td>
                        <td className="px-3 py-2">{item.rank ?? "-"}</td>
                        <td className="px-3 py-2">{item.position}</td>
                        <td className="px-3 py-2">{item.retirementDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{item.yearsOfService ?? "-"} th</td>
                        <td className="px-3 py-2">
                          <span className={`rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line ${item.status === "VERIFIED" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
                            {ITEM_STATUS_LABEL[item.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.documentsChecklist.filter((c) => c.uploaded).length} / {item.documentsChecklist.length}
                          {item.missingDocuments.length > 0 ? (
                            <span className="ml-1 text-xs text-bad-700">({item.missingDocuments.length} kurang)</span>
                          ) : null}
                        </td>
                        {canUpload && isDraftOrRevision ? (
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <select
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                className="rounded-lg border border-line px-2.5 py-1 text-[11px] outline-none focus:border-brand-700"
                              >
                                <option value="">— pilih —</option>
                                {DOC_TYPES.map((dt) => (
                                  <option key={dt} value={dt}>{dt.replace(/_/g, " ")}</option>
                                ))}
                              </select>
                              <FileButton hint="max 5MB" onSelect={setDocFile} />
                              <button
                                disabled={acting !== null || !docFile || !docType}
                                onClick={() => void uploadDocument(item.id)}
                                className="rounded-md bg-brand-900 px-2.5 py-1 text-[11px] text-white disabled:opacity-60 hover:bg-brand-800"
                              >
                                Unggah
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      {item.documentsChecklist.length > 0 && (
                        <tr className="border-b last:border-0 bg-slate-50">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {item.documentsChecklist.map((c) => (
                                <span
                                  key={c.code}
                                  title={c.uploaded ? `Diunggah: ${c.originalName ?? "-"}` : "Belum diunggah"}
                                  className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
                                    c.uploaded
                                      ? "bg-ok-100 text-ok-700 ring-ok-700/30"
                                      : "bg-bad-50 text-bad-700 ring-bad-700/30"
                                  }`}
                                >
                                  {c.uploaded ? "✓" : "○"} {c.label}
                                </span>
                              ))}
                            </div>
                            {item.missingDocuments.length > 0 ? (
                              <p className="mt-1.5 text-[11px] font-medium text-bad-700">
                                Dokumen kurang: {item.missingDocuments.join(", ")}
                              </p>
                            ) : null}
                            <ul className="mt-1.5 flex flex-wrap gap-2 text-xs text-muted">
                              {item.documents.map((d) => (
                                <li key={d.id} className="flex items-center gap-1 rounded bg-white px-2 py-1">
                                  <a href={fileUrl(d.downloadUrl)} className="text-brand-900 hover:underline">{d.originalName}</a>
                                  {canUpload && isDraftOrRevision ? (
                                    <button
                                      onClick={() => void deleteDocument(item.id, d.id)}
                                      className="ml-1 text-bad-700 hover:bg-bad-50 rounded p-1"
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Timeline</h2>
          {batch.timeline.length === 0 ? (
            <p className="text-sm text-muted">Belum ada catatan timeline.</p>
          ) : (
            <ul className="space-y-3">
              {batch.timeline.map((t) => (
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

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Pejabat</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Camat</dt><dd className="font-medium">{batch.signers.camat?.name ?? "-"} ({batch.signers.camat?.position ?? "-"})</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{batch.signers.camat?.nip ?? "-"}</dd></div>
            <div><dt className="text-muted">Sekcam</dt><dd className="font-medium">{batch.signers.sekcam?.name ?? "-"} ({batch.signers.sekcam?.position ?? "-"})</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{batch.signers.sekcam?.nip ?? "-"}</dd></div>
          </dl>
        </div>
      </div>
    </RequirePerm>
  );
}
