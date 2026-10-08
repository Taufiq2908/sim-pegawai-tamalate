"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { LeaveType } from "@/lib/types";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";
import { toast } from "@/components/toast";

function inclusiveDays(a: string, b: string): number | null {
  if (!a || !b) return null;
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  if (isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 86400000) + 1;
}

export default function CutiBaruPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [form, setForm] = useState({
    leaveTypeCode: "TAHUNAN",
    startDate: "",
    endDate: "",
    reason: "",
    addressDuringLeave: "",
    contactDuringLeave: "",
  });
  const [fileSk, setFileSk] = useState<File | null>(null);
  const [fileSecond, setFileSecond] = useState<File | null>(null);
  const [secondType, setSecondType] = useState("FORM_CUTI");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const durasi = useMemo(() => inclusiveDays(form.startDate, form.endDate), [form.startDate, form.endDate]);

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
    if (!fileSk || !fileSecond) {
      const msg = "Wajib unggah minimal 2 berkas: SK terakhir + 1 dokumen pendukung.";
      setError(msg);
      toast.error(msg);
      return;
    }
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
      const fd1 = new FormData();
      fd1.append("docType", "SK_TERAKHIR");
      fd1.append("file", fileSk);
      await apiUpload(`/leave-requests/${id}/documents`, fd1);
      const fd2 = new FormData();
      fd2.append("docType", secondType);
      fd2.append("file", fileSecond);
      await apiUpload(`/leave-requests/${id}/documents`, fd2);
      await apiFetch(`/leave-requests/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Pengajuan cuti dikirim.");
      router.replace(`/cuti/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal mengajukan cuti";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Ajukan Cuti</h1>
      <p className="mt-1 text-sm text-slate-500">Dibuat sebagai DRAFT lalu langsung diajukan (SUBMITTED).</p>

      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-slate-500">A — DATA PEMOHON</h2>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Nama</dt><dd className="font-semibold">{user?.employee?.name ?? user?.username}</dd></div>
            <div><dt className="text-slate-500">NIP</dt><dd className="font-semibold">{user?.employee?.nip ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Jabatan</dt><dd className="font-semibold">{user?.position ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Unit kerja</dt><dd className="font-semibold">{user?.orgUnit?.name ?? "—"}</dd></div>
          </dl>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-slate-500">B — JENIS & PERIODE CUTI</h2>
          <Field label="Jenis cuti">
            <select value={form.leaveTypeCode} onChange={set("leaveTypeCode")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900">
              {types.map((t) => (
                <option key={t.code} value={t.code}>{t.name}{t.maxDays ? ` (maks ${t.maxDays} hari)` : ""}</option>
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
          <p className="text-sm text-slate-600">
            Durasi: <b>{durasi === null ? "—" : `${durasi} hari`}</b>{" "}
            <span className="text-slate-400">(estimasi kalender; angka resmi dihitung backend)</span>
          </p>
          <Field label="Alasan cuti">
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
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-slate-500">C — BERKAS (WAJIB ≥2, SALAH SATUNYA SK TERAKHIR)</h2>
          <Field label="1. SK terakhir* (pdf/jpg/png ≤5MB)">
            <input type="file" required accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFileSk(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="2. Jenis dokumen pendukung*">
              <select value={secondType} onChange={(e) => setSecondType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="FORM_CUTI">Formulir cuti</option>
                <option value="SURAT_CUTI_SEBELUMNYA">Surat cuti sebelumnya</option>
                <option value="SURAT_DOKTER">Surat dokter</option>
                <option value="KK">Kartu keluarga</option>
                <option value="LAINNYA">Lainnya</option>
              </select>
            </Field>
            <Field label="File dokumen pendukung*">
              <input type="file" required accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFileSecond(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
          </div>
        </section>

        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>Ajukan cuti</SubmitButton>
      </form>
    </AppShell>
  );
}
