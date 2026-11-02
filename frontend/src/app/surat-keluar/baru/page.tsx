"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch, apiUpload } from "@/lib/api";
import { Field, FileButton, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";

export default function SuratKeluarBaruPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "reserve">("create");
  const [classes, setClasses] = useState<Array<{ code: string; name: string }>>([]);
  const [form, setForm] = useState({
    classificationCode: "",
    subject: "",
    recipient: "",
    letterDate: "",
    priority: "BIASA",
    secrecy: "B",
    signerName: "",
    letterCode: "",
    destinationNumber: "",
    personInCharge: "",
    remarks: "",
    reason: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Array<{ code: string; name: string }>>("/letters/classifications")
      .then(({ data }) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Prefill dari modul lain (mis. Surat pengantar KGB) lewat query string.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const subject = p.get("subject");
    const recipient = p.get("recipient");
    const signerName = p.get("signerName");
    if (!subject && !recipient && !signerName) return;
    setForm((f) => ({
      ...f,
      ...(subject ? { subject } : {}),
      ...(recipient ? { recipient } : {}),
      ...(signerName ? { signerName } : {}),
    }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "create") {
        if (!form.classificationCode) {
          setError("Klasifikasi arsip wajib dipilih.");
          return;
        }
        if (!form.subject.trim()) {
          setError("Perihal wajib diisi.");
          return;
        }
        if (!form.recipient.trim()) {
          setError("Tujuan surat wajib diisi.");
          return;
        }
        const fd = new FormData();
        fd.append("classificationCode", form.classificationCode);
        fd.append("subject", form.subject.trim());
        fd.append("recipient", form.recipient.trim());
        if (form.letterDate) fd.append("letterDate", form.letterDate);
        fd.append("priority", form.priority);
        fd.append("secrecy", form.secrecy);
        if (form.signerName) fd.append("signerName", form.signerName.trim());
        if (form.letterCode) fd.append("letterCode", form.letterCode.trim());
        if (form.destinationNumber) fd.append("destinationNumber", form.destinationNumber.trim());
        if (form.personInCharge) fd.append("personInCharge", form.personInCharge.trim());
        if (form.remarks) fd.append("remarks", form.remarks.trim());
        if (file) fd.append("file", file);
        const { data } = await apiUpload<{ id: string }>("/outgoing-letters", fd);
        router.replace(`/surat-keluar/${(data as { id: string }).id}`);
      } else {
        if (!form.classificationCode || !form.letterDate) {
          setError("Pilih klasifikasi dan tanggal surat dulu.");
          return;
        }
        if (form.reason.trim().length < 5) {
          setError("Alasan reservasi min 5 karakter.");
          return;
        }
        const { data } = await apiFetch<{ id: string }>("/outgoing-letters/reserve", {
          method: "POST",
          body: JSON.stringify({
            classificationCode: form.classificationCode,
            letterDate: form.letterDate,
            reason: form.reason.trim(),
            signerName: form.signerName || undefined,
            letterCode: form.letterCode || undefined,
            destinationNumber: form.destinationNumber || undefined,
            personInCharge: form.personInCharge || undefined,
            remarks: form.remarks || undefined,
          }),
        });
        router.replace(`/surat-keluar/${(data as { id: string }).id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setLoading(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <RequirePerm perm="outgoing.create" label="Buat Surat Keluar">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buat Surat Keluar</h1>
          <p className="mt-0.5 text-sm text-muted">
            Unggah berkas lampiran terlebih dahulu, lalu isi data surat.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-lg px-4 py-2 font-medium transition ${mode === "create" ? "bg-brand-900 text-white" : "text-muted hover:bg-paper"}`}
          >
            Langsung terbit
          </button>
          <button
            type="button"
            onClick={() => setMode("reserve")}
            className={`rounded-lg px-4 py-2 font-medium transition ${mode === "reserve" ? "bg-brand-900 text-white" : "text-muted hover:bg-paper"}`}
          >
            Reservasi nomor
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {/* Lampiran */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-semibold mb-3">Berkas lampiran</h2>
            <p className="text-sm text-muted">Unggah berkas surat (PDF/JPG/PNG, maks 10MB).</p>
            <FileButton hint="PDF/JPG/PNG, maks 10MB" onSelect={setFile} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Klasifikasi arsip*">
              <select required value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="">— pilih —</option>
                {classes.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal surat* (tidak boleh masa depan)">
              <input type="date" required value={form.letterDate} onChange={set("letterDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            {mode === "create" ? (
              <>
                <Field label="Perihal (min 5 karakter)*">
                  <input required value={form.subject} onChange={set("subject")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Tujuan surat*">
                  <input required value={form.recipient} onChange={set("recipient")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
              </>
            ) : (
              <Field label="Alasan reservasi (min 5 karakter)*">
                <textarea required value={form.reason} onChange={set("reason")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prioritas">
              <select value={form.priority} onChange={set("priority")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="BIASA">Biasa</option>
                <option value="SEGERA">Segera</option>
                <option value="SANGAT_SEGERA">Sangat segera</option>
              </select>
            </Field>
            <Field label="Sifat">
              <select value={form.secrecy} onChange={set("secrecy")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="B">Biasa</option>
                <option value="R">Rahasia</option>
                <option value="SR">Sangat rahasia</option>
              </select>
            </Field>
            <Field label="Penandatangan">
              <input value={form.signerName} onChange={set("signerName")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          {mode === "create" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Kode surat">
                <input value={form.letterCode} onChange={set("letterCode")} placeholder="cth: 800.1" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
              <Field label="Nomor tujuan">
                <input value={form.destinationNumber} onChange={set("destinationNumber")} placeholder="cth: 001/KT/XI/2026" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
              <Field label="Penanggung jawab">
                <input value={form.personInCharge} onChange={set("personInCharge")} placeholder="Nama pegawai" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
              <Field label="Keterangan">
                <input value={form.remarks} onChange={set("remarks")} placeholder="Catatan tambahan" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
            </div>
          ) : null}

          {error ? <ErrorBox message={error} /> : null}
          <SubmitButton loading={loading}>
            {mode === "create" ? "Terbitkan surat" : "Reservasi nomor"}
          </SubmitButton>
        </form>
      </div>
    </RequirePerm>
  );
}
