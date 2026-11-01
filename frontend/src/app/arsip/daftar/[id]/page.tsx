"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ArchiveList, ArchiveRecord } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function ArsipDaftarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canSign = hasPermission("archive.sign") && (user?.position === "SEKCAM" || user?.position === "CAMAT");
  const canUpdate = hasPermission("archive.update");

  const [list, setList] = useState<ArchiveList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<ArchiveList>(`/archives/lists/${id}`);
      setList(data);
      setEditNotes(data.notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail daftar arsip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpdateNotes() {
    setError("");
    setSaving(true);
    try {
      const { data } = await apiFetch<ArchiveList>(`/archives/lists/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: editNotes.trim() || null }),
      });
      setList(data);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui catatan");
    } finally {
      setSaving(false);
    }
  }

  async function onSign() {
    if (!confirm("Yakin ingin menandatangani daftar arsip ini? Tanda tangan tidak dapat diubah kembali.")) return;
    setSigning(true);
    try {
      await apiFetch(`/archives/lists/${id}/sign`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tanda tangan gagal");
    } finally {
      setSigning(false);
    }
  }

  async function addRecords(ids: string[]) {
    setError("");
    try {
      await apiFetch<ArchiveList>(`/archives/lists/${id}/records`, {
        method: "POST",
        body: JSON.stringify({ recordIds: ids }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan arsip ke daftar");
    }
  }

  async function removeRecord(recordId: string) {
    if (!confirm("Keluarkan arsip ini dari daftar?")) return;
    setError("");
    try {
      await apiFetch(`/archives/lists/${id}/records/${recordId}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengeluarkan arsip dari daftar");
    }
  }

  const locationLabel = (loc: string): string => {
    switch (loc) {
      case "LEMARI_ARSIP": return "Lemari Arsip";
      case "GUDANG_ARSIP": return "Gudang Arsip";
      case "LURAH": return "Lurah";
      default: return loc;
    }
  };

  return (
    <RequirePerm perm="archive.view" label="Detail Daftar Arsip">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      {loading ? (
        <div className="mt-4"><Skeleton className="h-64 w-full" /></div>
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !list ? (
        <EmptyState title="Daftar arsip tidak ditemukan" />
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">{list.listNumber}</h1>
              <p className="text-sm text-muted">
                Periode {list.periodStart.slice(0, 10)} s.d. {list.periodEnd.slice(0, 10)} •
                {list.records.length} record
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={list.status} />
              {list.status === "DRAFT" && canSign ? (
                <button
                  disabled={signing || list.records.length === 0}
                  onClick={onSign}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${
                    list.records.length === 0
                      ? "bg-slate-200 text-slate-500 disabled:cursor-not-allowed"
                      : "bg-brand-900 text-white hover:bg-brand-800"
                  }`}
                >
                  {signing ? "Menandatangani…" : "Tandatangani"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="font-semibold mb-3">Informasi Daftar</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Nomor Daftar</dt><dd className="font-medium">{list.listNumber}</dd></div>
              <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={list.status} /></dd></div>
              <div><dt className="text-muted">Periode Mulai</dt><dd className="font-medium">{list.periodStart.slice(0, 10)}</dd></div>
              <div><dt className="text-muted">Periode Akhir</dt><dd className="font-medium">{list.periodEnd.slice(0, 10)}</dd></div>
              <div><dt className="text-muted">Jumlah Record</dt><dd className="font-medium">{list.records.length}</dd></div>
              <div><dt className="text-muted">Dibuat oleh</dt><dd className="font-medium">{list.createdBy}</dd></div>
              {list.status === "SIGNED" ? (
                <>
                  <div><dt className="text-muted">Penandatangan</dt><dd className="font-medium">{list.signerName ?? "-"}</dd></div>
                  <div><dt className="text-muted">NIP</dt><dd className="font-medium">{list.signerNip ?? "-"}</dd></div>
                  <div><dt className="text-muted">Jabatan</dt><dd className="font-medium">{list.signerPosition ?? "-"}</dd></div>
                  <div><dt className="text-muted">Tanggal Tanda Tangan</dt><dd className="font-medium">{list.signedAt ? list.signedAt.slice(0, 16) : "-"}</dd></div>
                </>
              ) : null}
              {list.notes ? (
                <div className="sm:col-span-2"><dt className="text-muted">Catatan</dt><dd className="font-medium">{list.notes}</dd></div>
              ) : null}
            </dl>

            {list.status === "DRAFT" && canUpdate ? (
              <div className="mt-4 border-t pt-3">
                {editMode ? (
                  <form onSubmit={(e) => { e.preventDefault(); void onUpdateNotes(); }} className="space-y-3">
                    <Field label="Catatan">
                      <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                    </Field>
                    <div className="flex gap-2">
                      <button type="submit" disabled={saving} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                        Simpan
                      </button>
                      <button type="button" onClick={() => setEditMode(false)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper">
                        Batal
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="text-sm text-muted">{list.notes ?? "Tidak ada catatan."}</p>
                    <button
                      onClick={() => setEditMode(true)}
                      className="mt-2 inline-block rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
                    >
                      Ubah catatan
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="font-semibold mb-3">Record Arsip ({list.records.length})</h2>
            {list.records.length === 0 ? (
              <p className="text-sm text-muted">Belum ada arsip dalam daftar ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-paper text-xs text-muted">
                      <th className="px-3 py-2">Nomor Arsip</th>
                      <th className="px-3 py-2">Uraian</th>
                      <th className="px-3 py-2">Sumber</th>
                      <th className="px-3 py-2">Tgl. Arsip</th>
                      <th className="px-3 py-2">Kategori</th>
                      <th className="px-3 py-2">Lokasi</th>
                      <th className="px-3 py-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.records.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{r.archiveNumber}</td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.sourceType === "INCOMING" ? "Masuk" : "Keluar"}</td>
                        <td className="px-3 py-2">{r.archiveDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{r.category}</td>
                        <td className="px-3 py-2">{locationLabel(r.location)}</td>
                        <td className="px-3 py-2">
                          {list.status === "DRAFT" && canUpdate ? (
                            <button
                              onClick={() => void removeRecord(r.id)}
                              className="rounded-md text-bad-700 text-xs font-medium hover:bg-bad-50"
                            >
                              Keluarkan
                            </button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {list.status === "DRAFT" && canUpdate ? (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold mb-3">Tambah Arsip ke Daftar</h2>
              <AddRecordsForm listId={id} onAdded={load} />
            </div>
          ) : null}
        </div>
      )}
    </RequirePerm>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function AddRecordsForm({ listId, onAdded }: { listId: string; onAdded: () => void }) {
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ unlisted: "true", limit: "1000" });
      const { data } = await apiFetch<{ items: ArchiveRecord[] }>(`/archives?${params.toString()}`);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat arsip");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  return (
    <AddRecordsFormInner records={records} selectedIds={selectedIds} setSelectedIds={setSelectedIds} setError={setError} loading={loading} error={error} listId={listId} onAdded={onAdded} loadRecords={loadRecords} />
  );
}

function AddRecordsFormInner({
  records,
  selectedIds,
  setSelectedIds,
  setError,
  loading,
  error,
  listId,
  onAdded,
  loadRecords,
}: {
  records: ArchiveRecord[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setError: (msg: string) => void;
  loading: boolean;
  error: string;
  listId: string;
  onAdded: () => void;
  loadRecords: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSelected = (id: string) => selectedIds.has(id);

  async function onSubmit() {
    if (selectedIds.size === 0) {
      setError("Pilih minimal satu arsip.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/archives/lists/${listId}/records`, {
        method: "POST",
        body: JSON.stringify({ recordIds: Array.from(selectedIds) }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan arsip");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSubmit(); }} className="space-y-3">
      {error ? <div className="text-xs text-bad-700">{error}</div> : null}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : records.length === 0 ? (
        <p className="text-sm text-muted">Tidak ada arsip belum terdaftar.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-3">
          {records.map((r) => (
            <label
              key={r.id}
              className={`rounded-lg border p-2 text-sm transition cursor-pointer ${
                isSelected(r.id)
                  ? "bg-brand-900 border-brand-900 text-white"
                  : "border-line bg-surface text-ink hover:bg-paper"
              }`}
            >
              <input type="checkbox" checked={isSelected(r.id)} onChange={() => toggle(r.id)} className="sr-only" />
              <div className="font-medium truncate">{r.title}</div>
              <div className="text-xs text-muted truncate">{r.archiveNumber}</div>
              <div className="text-xs text-muted">{r.category} • {r.sourceType === "INCOMING" ? "Masuk" : "Keluar"}</div>
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Terpilih {selectedIds.size} arsip.
      </p>
      <button type="submit" disabled={submitting || selectedIds.size === 0} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
        {submitting ? "Menambahkan…" : "Tambahkan ke Daftar"}
      </button>
    </form>
  );
}
