"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { EmployeeRef, KgbPrefill } from "@/lib/types";
import { Field, FileButton } from "@/components/form";
import { EmployeePicker } from "@/components/employee-picker";
import { ErrorBox } from "@/components/ui";
import { formatRupiah } from "@/lib/format";

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

function monthYear(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

export default function KgbBaruPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [form, setForm] = useState({ effectiveDate: "", note: "" });
  const [prefill, setPrefill] = useState<KgbPrefill | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRef | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEmployee = user?.role === "EMPLOYEE";
  const canSubmit = hasPermission("kgb.submit");
  const targetEmployeeId = isEmployee ? user?.employee?.id : selectedEmployee?.id;

  // Deep link dari monitoring: /kgb/baru?employeeId=...
  useEffect(() => {
    if (isEmployee || typeof window === "undefined") return;
    const employeeId = new URLSearchParams(window.location.search).get("employeeId");
    if (!employeeId) return;
    apiFetch<EmployeeRef>(`/employees/${employeeId}`)
      .then(({ data }) => setSelectedEmployee(data))
      .catch(() => {});
  }, [isEmployee]);

  // Golongan, gaji pokok, MKG, dan TMT diambil otomatis dari backend.
  useEffect(() => {
    if (!targetEmployeeId) {
      setPrefill(null);
      return;
    }
    let alive = true;
    setPrefill(null);
    setPrefillLoading(true);
    setPrefillError("");
    apiFetch<KgbPrefill>(`/kgb-requests/prefill?employeeId=${encodeURIComponent(targetEmployeeId)}`)
      .then(({ data }) => {
        if (!alive) return;
        setPrefill(data);
        setForm((f) => ({
          ...f,
          effectiveDate: data.effectiveDate,
        }));
      })
      .catch((err) => {
        if (alive) setPrefillError(err instanceof Error ? err.message : "Gagal memuat data KGB");
      })
      .finally(() => {
        if (alive) setPrefillLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [targetEmployeeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    // Hanya tombol "Ajukan" eksplisit yang memanggil endpoint submit.
    // Enter/default submit dan operator tanpa kgb.submit selalu menyimpan draft.
    const draftOnly = !(submitter?.value === "ajukan" && canSubmit);
    setError("");
    if (!prefill) {
      setError("Data golongan/gaji belum tersedia. Pilih pegawai terlebih dahulu.");
      return;
    }
    if (prefill.atMax) {
      setError(
        `MKG ${prefill.mkg} sudah mencapai batas golongan ${prefill.oldRank}. Gaji pokok tidak dapat naik lagi.`,
      );
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
      // Backend menghitung ulang golongan/gaji dari master + PP 5/2024,
      // jadi form tidak perlu mengirim nominal manual.
      const { data } = await apiFetch<{ id: string }>("/kgb-requests", {
        method: "POST",
        body: JSON.stringify({
          effectiveDate: form.effectiveDate || prefill.effectiveDate,
          note: form.note || undefined,
          employeeId: !isEmployee ? selectedEmployee?.id : undefined,
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
          ? "Golongan, gaji pokok, dan masa kerja terisi otomatis. Lengkapi berkas lalu simpan draft atau ajukan."
          : "Anda dapat menyimpan draft dan melengkapi berkas; pengajuan dilakukan oleh pemilik atau petugas berwenang."}
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-5">
        {!isEmployee ? (
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Pegawai yang diajukan</p>
            <EmployeePicker
              value={selectedEmployee?.id ?? ""}
              onChange={(_, employee) => setSelectedEmployee(employee)}
            />
            <p className="mt-1 text-xs text-muted">
              Pilih pegawai yang KGB-nya diusulkan. Data gaji diambil dari master kepegawaian.
            </p>
          </div>
        ) : null}

        {prefillLoading ? (
          <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted">
            Memuat data golongan dan gaji…
          </p>
        ) : null}
        {prefillError ? <ErrorBox message={prefillError} /> : null}

        {prefill ? (
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{prefill.employeeName}</p>
                <p className="text-xs text-muted">
                  NIP {prefill.nip ?? "-"} • TMT pangkat {prefill.rankTmt ?? "-"}
                </p>
              </div>
              <span className="rounded-full border border-line bg-surface px-2 py-1 text-xs text-muted">
                {prefill.regulation}
              </span>
            </div>

            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Golongan</p>
                <p className="font-semibold">{prefill.oldRank}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Masa kerja total</p>
                <p className="font-semibold">{prefill.totalYears} tahun</p>
              </div>
              <div>
                <p className="text-xs text-muted">Masa kerja golongan (MKG)</p>
                <p className="font-semibold">
                  {prefill.mkg} tahun → {prefill.newMkg} tahun
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Gaji pokok saat ini</p>
                <p className="font-semibold tabular-nums">{formatRupiah(prefill.oldSalary)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Gaji pokok setelah KGB</p>
                <p className="font-semibold tabular-nums text-brand-900">{formatRupiah(prefill.newSalary)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Jadwal KGB</p>
                <p className="font-semibold">{monthYear(prefill.scheduledDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">MKG maksimum golongan</p>
                <p className="font-semibold">{prefill.maxMkg} tahun</p>
              </div>
            </div>

            {prefill.atMax ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                MKG sudah di batas maksimum golongan ini. KGB tidak dapat menaikkan gaji pokok lagi.
              </p>
            ) : prefill.overdueMonths > 0 ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Jadwal KGB {monthYear(prefill.scheduledDate)} sudah lewat {prefill.overdueMonths} bulan. TMT di
                bawah otomatis diisi hari ini; ubah bila perlu.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              Data di atas dihitung dari golongan + masa kerja pada master kepegawaian. Jika tidak sesuai,
              hubungi staf kepegawaian.
            </p>
          </div>
        ) : null}

        <Field label="TMT KGB (effective date)*">
          <input
            type="date"
            required
            value={form.effectiveDate}
            onChange={set("effectiveDate")}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
        </Field>
        <Field label="Catatan (opsional)">
          <textarea
            value={form.note}
            onChange={set("note")}
            rows={2}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
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
            disabled={loading || prefillLoading || !prefill || prefill.atMax}
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
              disabled={loading || prefillLoading || !prefill || prefill.atMax}
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
