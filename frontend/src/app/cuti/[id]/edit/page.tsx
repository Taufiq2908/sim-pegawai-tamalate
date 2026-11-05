"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import type { LeaveDetail, LeaveType } from "@/lib/types";
import { Field, FileButton, SubmitButton } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import { toast } from "@/components/toast";

const DOC_LABEL: Record<string, string> = {
  SK_TERAKHIR: "SK terakhir",
  FORM_CUTI: "Formulir cuti",
  SURAT_CUTI_SEBELUMNYA: "Surat cuti sebelumnya",
  SURAT_DOKTER: "Surat dokter",
  KK: "Kartu keluarga",
  LAINNYA: "Dokumen lain",
};

export default function CutiEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [form, setForm] = useState({
    leaveTypeCode: "",
    startDate: "",
    endDate: "",
    reason: "",
    addressDuringLeave: "",
    contactDuringLeave: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [docType, setDocType] = useState("SK_TERAKHIR");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
      setDetail(data);
      setForm({
        leaveTypeCode: data.leaveType?.code ?? "",
        startDate: String(data.startDate).slice(0, 10),
        endDate: String(data.endDate).slice(0, 10),
        reason: data.reason ?? "",
        addressDuringLeave: data.addressDuringLeave ?? "",
        contactDuringLeave: data.contactDuringLeave ?? "",
      });
      const t = await apiFetch<LeaveType[]>("/leave-types").catch(() => null);
      if (t && Array.isArray(t.data)) setTypes(t.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employee?.id;
  // Backend menerapkan self-service: hanya pemilik employee yang boleh mengubah.
  const editable =
    !!detail &&
    ["DRAFT", "REVISION"].includes(detail.status) &&
    isOwner;
  const canUploadDoc = editable && hasPermission("leave.document.upload");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiFetch(`/leave-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          leaveTypeCode: form.leaveTypeCode || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          reason: form.reason || undefined,
          addressDuringLeave: form.addressDuringLeave || undefined,
          contactDuringLeave: form.contactDuringLeave || undefined,
        }),
      });
      toast.success("Perubahan tersimpan.");
      router.replace(`/cuti/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function uploadDocument() {
    if (!docFile) {
      toast.error("Pilih berkas terlebih dahulu.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("file", docFile);
      await apiUpload(`/leave-requests/${id}/documents`, fd);
      setDocFile(null);
      toast.success("Berkas cuti diunggah.");
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah berkas gagal");
    } finally {
      setUploading(false);
    }
  }

  return (
    <RequirePerm perm="leave.create" label="Ubah Pengajuan Cuti">
      <button onClick={() => router.back()} className="text-sm font-medium text-secondary hover:text-ink">
        ← Kembali
      </button>
      <h1 className="mt-2">Ubah pengajuan</h1>
      {loading ? (
        <Skeleton className="mt-3 h-64 w-full max-w-2xl" />
      ) : error ? (
        <div className="mt-3 max-w-2xl"><ErrorBox message={error} onRetry={load} /></div>
      ) : !detail ? (
        <div className="mt-3"><EmptyState title="Data tidak ditemukan" /></div>
      ) : !editable ? (
        <div className="mt-3 max-w-2xl">
          <EmptyState
            title="Tidak bisa diubah"
            hint="Hanya pemilik pengajuan pada status Draft/Perlu perbaikan yang boleh mengubah."
          />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4">
          {detail.revisionNote ? (
            <p className="rounded-lg border border-warn-700/25 bg-warn-100 px-4 py-3 text-sm text-warn-700">
              Catatan perbaikan: {detail.revisionNote}
            </p>
          ) : null}
          <Field label="Jenis cuti">
            <select value={form.leaveTypeCode} onChange={set("leaveTypeCode")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700">
              {types.map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal mulai">
              <input type="date" value={form.startDate} onChange={set("startDate")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Tanggal selesai">
              <input type="date" value={form.endDate} onChange={set("endDate")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <Field label="Alasan cuti">
            <textarea value={form.reason} onChange={set("reason")} rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alamat selama cuti">
              <input value={form.addressDuringLeave} onChange={set("addressDuringLeave")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Kontak selama cuti">
              <input value={form.contactDuringLeave} onChange={set("contactDuringLeave")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <p className="text-xs text-muted">Setelah disimpan, ajukan ulang dari halaman detail.</p>

          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Dokumen persyaratan</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(detail.documents ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                  <span className="font-medium">{d.originalName}</span>
                  <span className="text-xs text-muted">({DOC_LABEL[d.docType] ?? d.docType})</span>
                  <a
                    href={fileUrl(d.downloadUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs font-semibold text-brand-800 hover:underline"
                  >
                    Unduh
                  </a>
                </li>
              ))}
              {(detail.documents ?? []).length === 0 ? (
                <li className="text-muted">Belum ada dokumen. Draf tetap bisa disimpan, tetapi belum bisa diajukan.</li>
              ) : null}
            </ul>
            {canUploadDoc ? (
              <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
                <FileButton hint="PDF/JPG/PNG, maks 5MB" onSelect={setDocFile} />
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
                >
                  {Object.entries(DOC_LABEL).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void uploadDocument()}
                  className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {uploading ? "Mengunggah…" : "Unggah"}
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              Backend belum menyediakan hapus dokumen. Unggah berkas pengganti dengan jenis yang sama bila ada kesalahan.
            </p>
          </section>

          {error ? <ErrorBox message={error} /> : null}
          <SubmitButton loading={saving}>Simpan perubahan</SubmitButton>
        </form>
      )}
    </RequirePerm>
  );
}
