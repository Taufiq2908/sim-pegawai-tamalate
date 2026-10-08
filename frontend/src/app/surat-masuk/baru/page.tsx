"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";

export default function SuratMasukBaruPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Array<{ code: string; name: string }>>([]);
  const [form, setForm] = useState({
    letterNumber: "",
    sender: "",
    subject: "",
    letterDate: "",
    priority: "BIASA",
    secrecy: "B",
    summary: "",
    addressedTo: "",
    pic: "",
    remarks: "",
    classificationCode: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Array<{ code: string; name: string }>>("/letters/classifications")
      .then(({ data }) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/letters", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          summary: form.summary || undefined,
          addressedTo: form.addressedTo || undefined,
          pic: form.pic || undefined,
          remarks: form.remarks || undefined,
          classificationCode: form.classificationCode || undefined,
        }),
      });
      router.replace(`/surat-masuk/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat surat");
    } finally {
      setLoading(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Catat Surat Masuk</h1>
      <p className="mt-1 text-sm text-muted">Nomor agenda dibuat otomatis oleh backend.</p>
      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomor surat (dari pengirim)*">
            <input required value={form.letterNumber} onChange={set("letterNumber")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Pengirim*">
            <input required value={form.sender} onChange={set("sender")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>
        <Field label="Perihal (min 5 karakter)*">
          <input required value={form.subject} onChange={set("subject")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tanggal surat*">
            <input type="date" required value={form.letterDate} onChange={set("letterDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Prioritas">
            <select value={form.priority} onChange={set("priority")} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="BIASA">Biasa</option>
              <option value="SEGERA">Segera</option>
              <option value="SANGAT_SEGERA">Sangat segera</option>
            </select>
          </Field>
          <Field label="Sifat">
            <select value={form.secrecy} onChange={set("secrecy")} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="B">Biasa</option>
              <option value="R">Rahasia</option>
              <option value="SR">Sangat rahasia</option>
            </select>
          </Field>
        </div>
        <Field label="Ringkasan isi">
          <textarea value={form.summary} onChange={set("summary")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ditujukan ke">
            <input value={form.addressedTo} onChange={set("addressedTo")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Penanggung jawab">
            <input value={form.pic} onChange={set("pic")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Klasifikasi arsip">
            <select value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">— tanpa klasifikasi —</option>
              {classes.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Keterangan (tampil di buku agenda — tulis tujuan surat)">
            <input value={form.remarks} onChange={set("remarks")} placeholder="cth: Ditujukan kepada Kasi Trantib untuk ditindaklanjuti" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>Catat surat</SubmitButton>
      </form>
    </AppShell>
  );
}
