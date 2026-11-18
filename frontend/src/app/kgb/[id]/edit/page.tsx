"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { KgbDetail, KgbPrefill } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import { toast } from "@/components/toast";
import { formatRupiah } from "@/lib/format";

export default function KgbEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [prefill, setPrefill] = useState<KgbPrefill | null>(null);
  const [form, setForm] = useState({
    effectiveDate: "",
    note: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setPrefill(null);
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}`);
      setDetail(data);
      setForm({
        effectiveDate: String(data.effectiveDate).slice(0, 10),
        note: data.note ?? "",
      });
      if (data.employee?.id) {
        apiFetch<KgbPrefill>(`/kgb-requests/prefill?employeeId=${encodeURIComponent(data.employee.id)}`)
          .then(({ data: p }) => setPrefill(p))
          .catch(() => setPrefill(null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data KGB");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employee?.id;
  const editable =
    !!detail &&
    ["DRAFT", "REVISION"].includes(detail.status) &&
    (isOwner || (!!user && user.role !== "EMPLOYEE" && hasPermission("kgb.create")));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (prefill?.atMax) {
      setError(
        `MKG ${prefill.mkg} sudah mencapai batas golongan ${prefill.oldRank}. Gaji pokok tidak dapat naik lagi.`,
      );
      return;
    }
    setSaving(true);
    try {
      // Golongan/gaji tidak dikirim: backend menghitung ulang dari master
      // kepegawaian + skala gaji PP 5/2024 saat PATCH.
      await apiFetch(`/kgb-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          effectiveDate: form.effectiveDate,
          note: form.note || undefined,
        }),
      });
      toast.success("Perubahan KGB tersimpan.");
      router.replace(`/kgb/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan perubahan";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <RequirePerm perm="kgb.create" label="Ubah Pengajuan KGB">
      <button onClick={() => router.back()} className="text-sm font-medium text-secondary hover:text-ink">
        ← Kembali
      </button>
      <h1 className="mt-2">Ubah pengajuan KGB</h1>
      {loading || authLoading ? (
        <Skeleton className="mt-3 h-64 w-full max-w-2xl" />
      ) : error ? (
        <div className="mt-3 max-w-2xl"><ErrorBox message={error} onRetry={load} /></div>
      ) : !detail ? (
        <div className="mt-3"><EmptyState title="Data tidak ditemukan" /></div>
      ) : !editable ? (
        <div className="mt-3 max-w-2xl">
          <EmptyState
            title="Tidak bisa diubah"
            hint="Hanya DRAFT/REVISION yang boleh diubah. Setelah diajukan, gunakan alur persetujuan."
          />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4">
          {detail.revisionNote ? (
            <p className="rounded-lg border border-warn-700/25 bg-warn-100 px-4 py-3 text-sm text-warn-700">
              Catatan perbaikan: {detail.revisionNote}
            </p>
          ) : null}

          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-sm"><span className="text-muted">Pegawai:</span> <b>{detail.employee?.name}</b></p>
            <p className="mt-1 text-sm"><span className="text-muted">Nomor:</span> {detail.requestNumber}</p>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-sm font-semibold">Data otomatis</p>
            <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">Golongan</p>
                <p className="font-semibold">{prefill?.oldRank ?? detail.oldRank}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Masa kerja total</p>
                <p className="font-semibold">{prefill ? `${prefill.totalYears} tahun` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">MKG</p>
                <p className="font-semibold">
                  {prefill ? `${prefill.mkg} → ${prefill.newMkg} tahun` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Gaji pokok saat ini</p>
                <p className="font-semibold tabular-nums">
                  {formatRupiah(prefill?.oldSalary ?? detail.oldSalary)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Gaji pokok setelah KGB</p>
                <p className="font-semibold tabular-nums text-brand-900">
                  {formatRupiah(prefill?.newSalary ?? detail.newSalary)}
                </p>
              </div>
            </div>
            {prefill?.atMax ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                MKG sudah di batas maksimum golongan ini. Gaji pokok tidak dapat naik lagi.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Golongan dan gaji dihitung dari master kepegawaian. Jika tidak sesuai, hubungi staf kepegawaian.
              </p>
            )}
          </div>
          <Field label="TMT">
            <input type="date" required value={form.effectiveDate} onChange={set("effectiveDate")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Catatan (opsional)">
            <textarea value={form.note} onChange={set("note")} rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>

          <p className="text-xs text-muted">
            Berkas persyaratan diunggah di halaman detail.{" "}
            <Link href={`/kgb/${id}`} className="font-semibold text-brand-800 hover:underline">
              Buka halaman detail
            </Link>
          </p>

          {error ? <ErrorBox message={error} /> : null}
          <SubmitButton loading={saving}>Simpan perubahan</SubmitButton>
        </form>
      )}
    </RequirePerm>
  );
}
