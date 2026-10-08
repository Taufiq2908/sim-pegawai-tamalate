"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch, apiUpload } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";

export default function KgbBaruPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    oldRank: "",
    newRank: "",
    oldSalary: "",
    newSalary: "",
    effectiveDate: "",
    note: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const oldS = Number(form.oldSalary);
    const newS = Number(form.newSalary);
    if (!(newS > oldS)) {
      setError("Gaji baru harus lebih besar dari gaji lama.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/kgb-requests", {
        method: "POST",
        body: JSON.stringify({
          oldRank: form.oldRank,
          newRank: form.newRank,
          oldSalary: oldS,
          newSalary: newS,
          effectiveDate: form.effectiveDate,
          note: form.note || undefined,
        }),
      });
      const id = (data as { id: string }).id;
      if (file) {
        const fd = new FormData();
        fd.append("docType", "SK_TERAKHIR");
        fd.append("file", file);
        await apiUpload(`/kgb-requests/${id}/documents`, fd);
      }
      await apiFetch(`/kgb-requests/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
      router.replace(`/kgb/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengajukan KGB");
    } finally {
      setLoading(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Ajukan KGB</h1>
      <p className="mt-1 text-sm text-slate-500">Dibuat sebagai DRAFT lalu langsung diajukan.</p>
      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Golongan lama*">
            <input required value={form.oldRank} onChange={set("oldRank")} placeholder="cth: III/a" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
          <Field label="Golongan baru*">
            <input required value={form.newRank} onChange={set("newRank")} placeholder="cth: III/b" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gaji lama (rupiah)*">
            <input required inputMode="numeric" value={form.oldSalary} onChange={set("oldSalary")} placeholder="cth: 3000000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
          <Field label="Gaji baru (rupiah, harus lebih besar)*">
            <input required inputMode="numeric" value={form.newSalary} onChange={set("newSalary")} placeholder="cth: 3200000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </Field>
        </div>
        <Field label="TMT (effective date)*">
          <input type="date" required value={form.effectiveDate} onChange={set("effectiveDate")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
        </Field>
        <Field label="Catatan (opsional)">
          <textarea value={form.note} onChange={set("note")} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
        </Field>
        <Field label="Dokumen SK terakhir (opsional, pdf/jpg/png ≤5MB)">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>Ajukan KGB</SubmitButton>
      </form>
    </AppShell>
  );
}
