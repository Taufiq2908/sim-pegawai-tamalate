"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ArchiveRecord } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const CATEGORIES: Array<ArchiveRecord["category"]> = ["AKTIF", "INAKTIF", "PENTING"];

export default function ArsipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const canUpdate = hasPermission("archive.update");

  const [record, setRecord] = useState<ArchiveRecord | null>(null);
  const [classes, setClasses] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    classificationCode: "",
    code: "",
    bundleCode: "",
    category: "AKTIF" as ArchiveRecord["category"],
    archiveDate: "",
    retentionUntil: "",
    physicalLocation: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<ArchiveRecord>(`/archives/${id}`);
      setRecord(data);
      if (data) {
        setEditForm({
          classificationCode: data.classification?.code ?? "",
          code: data.code,
          bundleCode: data.bundleCode ?? "",
          category: data.category,
          archiveDate: data.archiveDate.slice(0, 10),
          retentionUntil: data.retentionUntil?.slice(0, 10) ?? "",
          physicalLocation: data.physicalLocation ?? "",
          notes: data.notes ?? "",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail arsip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isSuper) return;
    apiFetch<Array<{ code: string; name: string }>>("/letters/classifications")
      .then(({ data }) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [isSuper]);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!editForm.code.trim()) {
      setError("Kode arsip wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const body = isSuper
        ? {
            classificationCode: editForm.classificationCode || null,
            code: editForm.code.trim(),
            bundleCode: editForm.bundleCode.trim() || null,
            category: editForm.category,
            archiveDate: editForm.archiveDate || undefined,
            retentionUntil: editForm.retentionUntil || null,
            physicalLocation: editForm.physicalLocation.trim() || null,
            notes: editForm.notes.trim() || null,
          }
        : {
            code: editForm.code.trim(),
            bundleCode: editForm.bundleCode.trim() || null,
          };

      const { data } = await apiFetch<ArchiveRecord>(`/archives/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRecord(data);
      setEditForm({
        classificationCode: data.classification?.code ?? "",
        code: data.code,
        bundleCode: data.bundleCode ?? "",
        category: data.category,
        archiveDate: data.archiveDate.slice(0, 10),
        retentionUntil: data.retentionUntil?.slice(0, 10) ?? "",
        physicalLocation: data.physicalLocation ?? "",
        notes: data.notes ?? "",
      });
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui arsip");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = canUpdate;

  const locationLabel = (loc: string): string => {
    switch (loc) {
      case "LEMARI_ARSIP": return "Lemari Arsip";
      case "GUDANG_ARSIP": return "Gudang Arsip";
      case "LURAH": return "Lurah";
      default: return loc;
    }
  };
  const categoryLabel = (c: string): string => {
    switch (c) {
      case "AKTIF": return "Aktif";
      case "INAKTIF": return "Tidak Aktif";
      case "PENTING": return "Penting";
      default: return c;
    }
  };
  const sourceLabel = (s: string): string => {
    if (s === "INCOMING") return "Surat Masuk";
    if (s === "OUTGOING") return "Surat Keluar";
    return "Surat Cuti";
  };

  return (
    <RequirePerm perm="archive.view" label="Detail Arsip">
      <button type="button" onClick={() => router.back()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
        ← Kembali
      </button>
      {loading ? (
        <div className="mt-4"><Skeleton className="h-64 w-full" /></div>
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !record ? (
        <EmptyState title="Data arsip tidak ditemukan" />
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">{record.archiveNumber}</h1>
              <p className="text-sm text-muted">
                {sourceLabel(record.sourceType)} •{" "}
                {categoryLabel(record.category)} • {record.physicalLocation || locationLabel(record.location)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {record.list?.status === "SIGNED" ? (
                <span className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted">
                  Dalam daftar {record.list.listNumber} (ditandatangani)
                </span>
              ) : (
                <span className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted">
                  {record.list ? `Dalam daftar ${record.list.listNumber}` : "Belum masuk daftar"}
                </span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                >
                  {record.list?.status === "SIGNED" ? "Beri kode" : "Ubah data"}
                </button>
              ) : null}
            </div>
          </div>

          {!isSuper ? (
            <p className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-muted">
              {record.list?.status === "SIGNED"
                ? "Daftar sudah ditandatangani. Staf arsip masih dapat melengkapi kode arsip dan kode berkas."
                : "Staf arsip dapat melengkapi kode arsip dan kode berkas. Perubahan metadata lain hanya oleh SUPER_ADMIN."}
            </p>
          ) : null}

          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-3 font-semibold">Data Arsip</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Nomor Arsip</dt><dd className="font-medium">{record.archiveNumber}</dd></div>
              <div><dt className="text-muted">Sumber</dt><dd className="font-medium">{sourceLabel(record.sourceType)}</dd></div>
              <div><dt className="text-muted">Tanggal Arsip</dt><dd className="font-medium">{record.archiveDate.slice(0, 10)}</dd></div>
              <div><dt className="text-muted">Kategori</dt><dd className="font-medium">{categoryLabel(record.category)}</dd></div>
              <div><dt className="text-muted">Lokasi Kategori</dt><dd className="font-medium">{locationLabel(record.location)}</dd></div>
              <div><dt className="text-muted">Lokasi Fisik</dt><dd className="font-medium">{record.physicalLocation || "—"}</dd></div>
              <div><dt className="text-muted">Kode Arsip</dt><dd className="font-medium">{record.code}</dd></div>
              <div><dt className="text-muted">Kode Berkas</dt><dd className="font-medium">{record.bundleCode ?? "—"}</dd></div>
              <div><dt className="text-muted">Uraian</dt><dd className="font-medium">{record.title}</dd></div>
              <div><dt className="text-muted">Nomor Dokumen</dt><dd className="font-medium">{record.documentNumber ?? "—"}</dd></div>
              <div><dt className="text-muted">Tanggal Dokumen</dt><dd className="font-medium">{record.documentDate ? record.documentDate.slice(0, 10) : "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Klasifikasi</dt><dd className="font-medium">{record.classification?.code ?? "—"} — {record.classification?.name ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Catatan</dt><dd className="font-medium">{record.notes ?? "—"}</dd></div>
              <div><dt className="text-muted">Retensi Sampai</dt><dd className="font-medium">{record.retentionUntil ? record.retentionUntil.slice(0, 10) : "—"}</dd></div>
              <div><dt className="text-muted">Dibuat</dt><dd className="font-medium">{record.createdAt.slice(0, 10)}</dd></div>
              <div><dt className="text-muted">Diperbarui</dt><dd className="font-medium">{record.updatedAt.slice(0, 10)}</dd></div>
            </dl>

            {record.incomingLetter ? (
              <div className="mt-4 border-t border-line pt-3">
                <h3 className="text-sm font-semibold">Sumber: Surat Masuk</h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted">Agenda</dt><dd className="font-medium">{record.incomingLetter.agendaNumber}</dd></div>
                  <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{record.incomingLetter.letterNumber}</dd></div>
                  <div><dt className="text-muted">Pengirim</dt><dd className="font-medium">{record.incomingLetter.sender}</dd></div>
                  <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{record.incomingLetter.subject}</dd></div>
                  <div><dt className="text-muted">Tanggal Surat</dt><dd className="font-medium">{record.incomingLetter.letterDate.slice(0, 10)}</dd></div>
                  <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={record.incomingLetter.status} /></dd></div>
                </dl>
                <p className="mt-2">
                  <Link href={`/surat-masuk/${record.incomingLetter.id}`} className="text-sm font-semibold text-brand-900 hover:underline">
                    Buka surat masuk
                  </Link>
                </p>
              </div>
            ) : null}
            {record.outgoingLetter ? (
              <div className="mt-4 border-t border-line pt-3">
                <h3 className="text-sm font-semibold">Sumber: Surat Keluar</h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{record.outgoingLetter.letterNumber}</dd></div>
                  <div><dt className="text-muted">Penerima</dt><dd className="font-medium">{record.outgoingLetter.recipient ?? "—"}</dd></div>
                  <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{record.outgoingLetter.subject}</dd></div>
                  <div><dt className="text-muted">Tanggal Surat</dt><dd className="font-medium">{record.outgoingLetter.letterDate.slice(0, 10)}</dd></div>
                  <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={record.outgoingLetter.status} /></dd></div>
                </dl>
                <p className="mt-2">
                  <Link href={`/surat-keluar/${record.outgoingLetter.id}`} className="text-sm font-semibold text-brand-900 hover:underline">
                    Buka surat keluar
                  </Link>
                </p>
              </div>
            ) : null}
            {record.leaveRequest ? (
              <div className="mt-4 border-t border-line pt-3">
                <h3 className="text-sm font-semibold">Sumber: Surat Cuti</h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted">Nomor Permohonan</dt><dd className="font-medium">{record.leaveRequest.requestNumber}</dd></div>
                  <div><dt className="text-muted">Pegawai</dt><dd className="font-medium">{record.leaveRequest.employee?.name ?? "—"}</dd></div>
                  <div><dt className="text-muted">Jenis Cuti</dt><dd className="font-medium">{record.leaveRequest.leaveType?.name ?? "—"}</dd></div>
                  <div><dt className="text-muted">Periode</dt><dd className="font-medium">{record.leaveRequest.startDate.slice(0, 10)} → {record.leaveRequest.endDate.slice(0, 10)} ({record.leaveRequest.totalDays} hari)</dd></div>
                  <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={record.leaveRequest.status} /></dd></div>
                </dl>
                <p className="mt-2">
                  <Link href={`/cuti/${record.leaveRequest.id}`} className="text-sm font-semibold text-brand-900 hover:underline">
                    Buka pengajuan cuti
                  </Link>
                </p>
              </div>
            ) : null}
          </div>

          {record.list ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold">Daftar Arsip</h2>
              <p className="text-sm text-muted">
                Masuk daftar <b>{record.list.listNumber}</b>
                {record.list.status === "SIGNED" ? " (sudah ditandatangani)" : " (belum ditandatangani)"}.
              </p>
              <Link href={`/arsip/daftar/${record.list.id}`} className="mt-2 inline-block rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
                Buka daftar arsip
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold">Daftar Arsip</h2>
              <p className="text-sm text-muted">
                Arsip ini belum masuk daftar. Sekcam/Camat dapat menyusun daftar arsip dari arsip yang belum terdaftar.
              </p>
            </div>
          )}

          {editMode ? (
            <div className="rounded-lg border border-warn-700/30 bg-warm-100 p-4">
              <h2 className="mb-3 font-semibold">{record.list?.status === "SIGNED" ? "Beri Kode Arsip" : "Ubah Data Arsip"}</h2>
              <form onSubmit={onUpdate} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {isSuper ? (
                    <Field label="Klasifikasi">
                      <select value={editForm.classificationCode} onChange={(e) => setEditForm((f) => ({ ...f, classificationCode: e.target.value }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                        <option value="">— tanpa klasifikasi —</option>
                        {classes.map((c) => (
                          <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Kode arsip*">
                    <input required value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  </Field>
                  <Field label="Kode berkas">
                    <input value={editForm.bundleCode} onChange={(e) => setEditForm((f) => ({ ...f, bundleCode: e.target.value }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  </Field>
                  {isSuper ? (
                    <>
                      <Field label="Kategori">
                        <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value as ArchiveRecord["category"] }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{categoryLabel(c)}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Tanggal arsip">
                        <input type="date" value={editForm.archiveDate} onChange={(e) => setEditForm((f) => ({ ...f, archiveDate: e.target.value }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Retensi sampai">
                        <input type="date" value={editForm.retentionUntil} onChange={(e) => setEditForm((f) => ({ ...f, retentionUntil: e.target.value }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Lokasi fisik">
                        <input value={editForm.physicalLocation} onChange={(e) => setEditForm((f) => ({ ...f, physicalLocation: e.target.value }))} placeholder="cth: Lemari A, rak 2" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                    </>
                  ) : null}
                </div>
                {isSuper ? (
                  <Field label="Catatan">
                    <textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  </Field>
                ) : null}
                {error ? <ErrorBox message={error} /> : null}
                <div className="flex gap-2">
                  <SubmitButton loading={saving}>Simpan</SubmitButton>
                  <button type="button" onClick={() => setEditMode(false)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink hover:bg-paper">
                    Batal
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </RequirePerm>
  );
}
