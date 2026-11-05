"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { EmployeeRef } from "@/lib/types";
import { Field, FileButton } from "@/components/form";
import { EmployeePicker } from "@/components/employee-picker";
import { ErrorBox } from "@/components/ui";

const DOKUMEN_WAJIB = [
  { code: "SK_CPNS_TERAKHIR", label: "SK KGB/CPNS terakhir*" },
  { code: "SK_PANGKAT_TERAKHIR", label: "SK Kenaikan Pangkat terakhir*" },
  { code: "SKP_2_TAHUN", label: "SKP 2 tahun terakhir*" },
];

const DOKUMEN_OPSIONAL = [
  { code: "KP4", label: "KP4" },
  { code: "KTP", label: "KTP" },
  { code: "NPWP", label: "NPWP" },
  { code: "REKENING_GAJI", label: "Rekening gaji" },
];

export default function KgbBaruPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [form, setForm] = useState({
    oldRank: "",
    newRank: "",
    oldSalary: "",
    newSalary: "",
    effectiveDate: "",
    note: "",
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRef | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEmployee = user?.role === "EMPLOYEE";
  const canSubmit = hasPermission("kgb.submit");

  // Deep link dari monitoring: /kgb/baru?employeeId=...
  useEffect(() => {
    if (isEmployee || typeof window === "undefined") return;
    const employeeId = new URLSearchParams(window.location.search).get("employeeId");
    if (!employeeId) return;
    apiFetch<EmployeeRef>(`/employees/${employeeId}`)
      .then(({ data }) => setSelectedEmployee(data))
      .catch(() => {});
  }, [isEmployee]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    // Hanya tombol "Ajukan" eksplisit yang memanggil endpoint submit.
    // Enter/default submit dan operator tanpa kgb.submit selalu menyimpan draft.
    const draftOnly = !(submitter?.value === "ajukan" && canSubmit);
    setError("");
    if (!isEmployee && !selectedEmployee && !user?.employee) {
      setError("Pilih pegawai yang akan diajukan KGB-nya.");
      return;
    }
    const oldS = Number(form.oldSalary);
    const newS = Number(form.newSalary);
    if (!(newS > oldS)) {
      setError("Gaji baru harus lebih besar dari gaji lama.");
      return;
    }
    if (!draftOnly) {
      const kurang = DOKUMEN_WAJIB.filter((d) => !files[d.code]);
      if (kurang.length) {
        setError(`Berkas wajib belum lengkap: ${kurang.map((d) => d.label.replace("*", "")).join(", ")}.`);
        return;
      }
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
          employeeId: !isEmployee && selectedEmployee ? selectedEmployee.id : undefined,
        }),
      });
      const id = (data as { id: string }).id;

      for (const doc of [...DOKUMEN_WAJIB, ...DOKUMEN_OPSIONAL]) {
        const file = files[doc.code];
        if (!file) continue;
        const fd = new FormData();
        fd.append("docType", doc.code);
        fd.append("file", file);
        await apiUpload(`/kgb-requests/${id}/documents`, fd);
      }

      if (!draftOnly) {
        await apiFetch(`/kgb-requests/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
      }
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
    <RequirePerm perm="kgb.create" label="Pengajuan KGB">
      <h1 className="text-xl font-bold">Ajukan KGB</h1>
      <p className="mt-1 text-sm text-muted">
        {canSubmit
          ? "Dapat disimpan sebagai draft atau langsung diajukan setelah berkas wajib lengkap."
          : "Anda dapat menyimpan draft dan melengkapi berkas; pengajuan dilakukan oleh pemilik atau petugas berwenang."}
      </p>
      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-5">
        {!isEmployee ? (
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Pegawai yang diajukan</p>
            <EmployeePicker
              value={selectedEmployee?.id ?? user?.employee?.id ?? ""}
              onChange={(_, employee) => setSelectedEmployee(employee)}
            />
            <p className="mt-1 text-xs text-muted">
              Pilih pegawai yang KGB-nya diusulkan. Data dapat diubah selama status masih Draft.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Golongan lama*">
            <input required value={form.oldRank} onChange={set("oldRank")} placeholder="cth: III/a" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Golongan baru*">
            <input required value={form.newRank} onChange={set("newRank")} placeholder="cth: III/b" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gaji lama (rupiah)*">
            <input required inputMode="numeric" value={form.oldSalary} onChange={set("oldSalary")} placeholder="cth: 3000000" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Gaji baru (rupiah, harus lebih besar)*">
            <input required inputMode="numeric" value={form.newSalary} onChange={set("newSalary")} placeholder="cth: 3200000" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>
        <Field label="TMT (effective date)*">
          <input type="date" required value={form.effectiveDate} onChange={set("effectiveDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
        </Field>
        <Field label="Catatan (opsional)">
          <textarea value={form.note} onChange={set("note")} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
        </Field>

        <div className="border-t border-line pt-3">
          <p className="text-sm font-semibold">Berkas persyaratan</p>
          <p className="mt-0.5 text-xs text-muted">PDF/JPG/PNG, maks 5MB per berkas.</p>
          <div className="mt-2 space-y-3">
            {DOKUMEN_WAJIB.map((d) => (
              <Field key={d.code} label={d.label}>
                <FileButton
                  hint="PDF/JPG/PNG, maks 5MB"
                  onSelect={(f) => setFiles((prev) => ({ ...prev, [d.code]: f }))}
                />
              </Field>
            ))}
          </div>
          <details className="mt-3 rounded-lg border border-dashed border-line bg-paper px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Berkas tambahan (opsional)</summary>
            <div className="mt-2 space-y-3">
              {DOKUMEN_OPSIONAL.map((d) => (
                <Field key={d.code} label={d.label}>
                  <FileButton
                    hint="PDF/JPG/PNG, maks 5MB"
                    onSelect={(f) => setFiles((prev) => ({ ...prev, [d.code]: f }))}
                  />
                </Field>
              ))}
            </div>
          </details>
        </div>

        {error ? <ErrorBox message={error} /> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="aksi"
            value="draft"
            disabled={loading}
            className={`rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-paper disabled:opacity-50 ${
              canSubmit ? "" : "flex-1"
            }`}
          >
            {loading ? "Memproses…" : "Simpan draft"}
          </button>
          {canSubmit ? (
            <button
              type="submit"
              name="aksi"
              value="ajukan"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {loading ? "Memproses…" : "Ajukan KGB"}
            </button>
          ) : null}
        </div>
      </form>
    </RequirePerm>
  );
}
