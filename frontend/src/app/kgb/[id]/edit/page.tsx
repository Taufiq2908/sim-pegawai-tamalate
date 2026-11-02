"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { KgbDetail } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import { toast } from "@/components/toast";

export default function KgbEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [form, setForm] = useState({
    oldRank: "",
    newRank: "",
    oldSalary: "",
    newSalary: "",
    effectiveDate: "",
    note: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}`);
      setDetail(data);
      setForm({
        oldRank: data.oldRank ?? "",
        newRank: data.newRank ?? "",
        oldSalary: String(data.oldSalary ?? ""),
        newSalary: String(data.newSalary ?? ""),
        effectiveDate: String(data.effectiveDate).slice(0, 10),
        note: data.note ?? "",
      });
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
    const oldS = Number(form.oldSalary);
    const newS = Number(form.newSalary);
    if (!(newS > oldS)) {
      setError("Gaji baru harus lebih besar dari gaji lama.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/kgb-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          oldRank: form.oldRank,
          newRank: form.newRank,
          oldSalary: oldS,
          newSalary: newS,
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Golongan lama">
              <input required value={form.oldRank} onChange={set("oldRank")} placeholder="cth: III/a" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Golongan baru">
              <input required value={form.newRank} onChange={set("newRank")} placeholder="cth: III/b" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gaji lama (rupiah)">
              <input required inputMode="numeric" value={form.oldSalary} onChange={set("oldSalary")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Gaji baru (rupiah)">
              <input required inputMode="numeric" value={form.newSalary} onChange={set("newSalary")} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
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
