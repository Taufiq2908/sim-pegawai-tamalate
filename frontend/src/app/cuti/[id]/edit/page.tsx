"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { LeaveDetail, LeaveType } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import { toast } from "@/components/toast";

export default function CutiEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
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
  const editable = !!detail && ["DRAFT", "REVISION"].includes(detail.status) && isOwner;

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

  return (
    <AppShell>
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
            hint="Hanya pemilik pada status Draft/Perlu perbaikan yang boleh mengubah."
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
          {error ? <ErrorBox message={error} /> : null}
          <SubmitButton loading={saving}>Simpan perubahan</SubmitButton>
        </form>
      )}
    </AppShell>
  );
}
