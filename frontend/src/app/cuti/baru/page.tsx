"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch, apiUpload } from "@/lib/api";
import type { LeaveType } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";

export default function CutiBaruPage() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [form, setForm] = useState({
    leaveTypeCode: "TAHUNAN",
    startDate: "",
    endDate: "",
    reason: "",
    addressDuringLeave: "",
    contactDuringLeave: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<LeaveType[]>("/leave-types")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setTypes(list);
        if (list.length && !list.some((t) => t.code === form.leaveTypeCode)) {
          setForm((f) => ({ ...f, leaveTypeCode: list[0].code }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/leave-requests", {
        method: "POST",
        body: JSON.stringify({
          leaveTypeCode: form.leaveTypeCode,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
          addressDuringLeave: form.addressDuringLeave || undefined,
          contactDuringLeave: form.contactDuringLeave || undefined,
        }),
      });
      const id = (data as { id: string }).id;
      if (file) {
        const fd = new FormData();
        fd.append("docType", "FORM_CUTI");
        fd.append("file", file);
        await apiUpload(`/leave-requests/${id}/documents`, fd);
      }
      await apiFetch(`/leave-requests/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.replace(`/cuti/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengajukan cuti");
    } finally {
      setLoading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Ajukan Cuti</h1>
      <p className="mt-1 text-sm text-slate-500">Dibuat sebagai DRAFT lalu langsung diajukan (SUBMITTED).</p>

      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Field label="Jenis cuti">
          <select
            value={form.leaveTypeCode}
            onChange={set("leaveTypeCode")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            {types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal mulai">
            <input type="date" required value={form.startDate} onChange={set("startDate")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
          <Field label="Tanggal selesai">
            <input type="date" required value={form.endDate} onChange={set("endDate")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
        </div>
        <Field label="Alasan">
          <textarea required value={form.reason} onChange={set("reason")} rows={3} placeholder="Keperluan cuti…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alamat selama cuti (opsional)">
            <input value={form.addressDuringLeave} onChange={set("addressDuringLeave")} placeholder="cth: Makassar" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
          <Field label="Kontak selama cuti (opsional)">
            <input value={form.contactDuringLeave} onChange={set("contactDuringLeave")} placeholder="cth: 0812…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
        </div>
        <Field label="Dokumen pendukung (opsional, pdf/jpg/png ≤5MB)">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>Ajukan cuti</SubmitButton>
      </form>
    </AppShell>
  );
}
