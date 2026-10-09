"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { LeaveType } from "@/lib/types";
import { Field, FileButton } from "@/components/form";
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
  const [fileDoctor, setFileDoctor] = useState<File | null>(null);
  const [balance, setBalance] = useState<{ entitlement: number; used: number; remaining: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const durasi = useMemo(() => inclusiveDays(form.startDate, form.endDate), [form.startDate, form.endDate]);
  const selectedType = types.find((t) => t.code === form.leaveTypeCode);
  const masaKerja = useMemo(() => {
    const jd = user?.employee?.joinDate;
    if (!jd) return "—";
    const start = new Date(jd + "T00:00:00");
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (isNaN(months) || months < 0) return "—";
    return `${Math.floor(months / 12)} tahun ${months % 12} bulan`;
  }, [user?.employee?.joinDate]);

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
    if (user?.employee?.id) {
      apiFetch<{ entitlement: number; used: number; remaining: number }>(
        `/employees/${user.employee.id}/leave-balance`,
      )
        .then(({ data }) => setBalance(data))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employee?.id]);

  async function save(draftOnly: boolean) {
    setError("");
    if (!fileSk || !fileSecond) {
      const msg = "Wajib unggah minimal 2 berkas: SK terakhir + 1 dokumen pendukung.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (selectedType?.requiresDocument && !fileDoctor) {
      const msg = `Jenis ${selectedType.name} wajib melampirkan surat dokter.`;
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
      if (fileDoctor) {
        const fd3 = new FormData();
        fd3.append("docType", "SURAT_DOKTER");
        fd3.append("file", fileDoctor);
        await apiUpload(`/leave-requests/${id}/documents`, fd3);
      }
      if (!draftOnly) {
        await apiFetch(`/leave-requests/${id}/submit`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        toast.success("Pengajuan cuti dikirim.");
      } else {
        toast.success("Draft tersimpan.");
      }
      router.replace(`/cuti/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan pengajuan";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void save(submitter?.value === "draft");
  }

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <h1>Pengajuan cuti</h1>
      <p className="mt-1 text-sm text-muted">Lengkapi data di bawah. Data pegawai diambil dari profil.</p>

      <form onSubmit={onSubmit} className="mt-6 max-w-2xl pb-28">
        <section>
          <h2 className="text-xs font-semibold tracking-wider text-muted">DATA PEGAWAI</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">Nama</dt><dd className="font-medium">{user?.employee?.name ?? user?.username}</dd></div>
            <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">NIP</dt><dd className="font-medium">{user?.employee?.nip ?? "—"}</dd></div>
            <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">Jabatan</dt><dd className="font-medium">{user?.position ?? "—"}</dd></div>
            <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">Unit kerja</dt><dd className="font-medium">{user?.orgUnit?.name ?? "—"}</dd></div>
            <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">Masa kerja</dt><dd className="font-medium">{masaKerja}</dd></div>
            {balance ? (
              <div className="flex justify-between border-b border-line py-1.5 sm:block"><dt className="text-muted sm:text-xs">Sisa cuti tahunan</dt><dd className="font-medium">{balance.remaining} hari <span className="font-normal text-muted">(hak {balance.entitlement}, terpakai {balance.used})</span></dd></div>
            ) : null}
          </dl>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="border-b border-line pb-2 text-xs font-semibold tracking-wider text-muted">JENIS & PERIODE</h2>
          <Field label="Jenis cuti">
            <select value={form.leaveTypeCode} onChange={set("leaveTypeCode")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
              {types.map((t) => (
                <option key={t.code} value={t.code}>{t.name}{t.maxDays ? ` (maks ${t.maxDays} hari)` : ""}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal mulai">
              <input type="date" required value={form.startDate} onChange={set("startDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Tanggal selesai">
              <input type="date" required value={form.endDate} onChange={set("endDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <p className="text-sm text-muted">
            Durasi: <b>{durasi === null ? "—" : `${durasi} hari`}</b>{" "}
            <span className="text-slate-400">(estimasi kalender; angka resmi dihitung backend)</span>
          </p>
          <Field label="Alasan cuti">
            <textarea required value={form.reason} onChange={set("reason")} rows={3} placeholder="Keperluan cuti…" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alamat selama cuti (opsional)">
              <input value={form.addressDuringLeave} onChange={set("addressDuringLeave")} placeholder="cth: Makassar" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Kontak selama cuti (opsional)">
              <input value={form.contactDuringLeave} onChange={set("contactDuringLeave")} placeholder="cth: 0812…" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="border-b border-line pb-2 text-xs font-semibold tracking-wider text-muted">DOKUMEN — WAJIB ≥2, SALAH SATUNYA SK TERAKHIR</h2>
          <Field label="1. SK terakhir* (pdf/jpg/png ≤5MB)">
            <FileButton required hint="PDF/JPG/PNG, maks 5MB" onSelect={setFileSk} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="2. Jenis dokumen pendukung*">
              <select value={secondType} onChange={(e) => setSecondType(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                <option value="FORM_CUTI">Formulir cuti</option>
                <option value="SURAT_CUTI_SEBELUMNYA">Surat cuti sebelumnya</option>
                <option value="SURAT_DOKTER">Surat dokter</option>
                <option value="KK">Kartu keluarga</option>
                <option value="LAINNYA">Lainnya</option>
              </select>
            </Field>
            <Field label="File dokumen pendukung*">
              <FileButton required hint="PDF/JPG/PNG, maks 5MB" onSelect={setFileSecond} />
            </Field>
          </div>
          {selectedType?.requiresDocument ? (
            <Field label={`Surat dokter* (wajib untuk ${selectedType.name})`}>
              <FileButton required hint="PDF/JPG/PNG, maks 5MB" onSelect={setFileDoctor} />
            </Field>
          ) : null}
        </section>

        {error ? <ErrorBox message={error} /> : null}

        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-2xl gap-2">
            <button
              type="submit"
              name="aksi"
              value="draft"
              disabled={loading}
              className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-paper disabled:opacity-50"
            >
              {loading ? "Memproses…" : "Simpan draft"}
            </button>
            <button
              type="submit"
              name="aksi"
              value="ajukan"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {loading ? "Memproses…" : "Ajukan cuti"}
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
