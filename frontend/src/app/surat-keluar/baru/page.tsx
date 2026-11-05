"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { Field, FileButton } from "@/components/form";
import { ErrorBox, EmptyState } from "@/components/ui";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type { OutgoingLetter } from "@/lib/types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Tanggal hari ini menurut WITA (UTC+8), sama dengan todayYMD backend.
const today = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function SuratKeluarBaruPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("outgoing.create");
  const canReserve = hasPermission("outgoing.reserve");

  const [mode, setMode] = useState<"create" | "reserve">(canCreate ? "create" : "reserve");
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
  const [count, setCount] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<OutgoingLetter[]>([]);

  useEffect(() => {
    if (!canCreate && canReserve) setMode("reserve");
  }, [canCreate, canReserve]);

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

  // Halaman bisa dibuka langsung oleh pemegang outgoing.view saja; tanpa
  // salah satu izin operasi, jangan tampilkan formulir yang pasti ditolak API.
  if (!canCreate && !canReserve) {
    return (
      <RequirePerm perm="outgoing.view" label="Buat Surat Keluar">
        <EmptyState
          title="Tidak ada akses membuat surat keluar"
          hint="Akun ini hanya dapat melihat daftar surat keluar."
        />
      </RequirePerm>
    );
  }

  function validate(): string | null {
    if (!form.classificationCode) return "Klasifikasi arsip wajib dipilih.";
    if (!form.letterDate) return "Tanggal surat wajib diisi.";
    if (form.letterDate > today()) return "Tanggal surat tidak boleh masa depan.";
    if (mode === "create") {
      if (form.subject.trim().length < 5) return "Perihal minimal 5 karakter.";
      if (!form.recipient.trim()) return "Tujuan surat wajib diisi.";
      if (file) {
        if (file.size > MAX_FILE_BYTES) return "File maksimal 10 MB.";
        if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return "File harus PDF, JPG, atau PNG.";
      }
    } else {
      const n = Number(count);
      if (!Number.isInteger(n) || n < 1 || n > 50) return "Jumlah nomor harus 1–50.";
      if (form.reason.trim().length < 5) return "Alasan booking minimal 5 karakter.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBooked([]);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    try {
      if (mode === "create") {
        const fd = new FormData();
        fd.append("classificationCode", form.classificationCode);
        fd.append("subject", form.subject.trim());
        fd.append("recipient", form.recipient.trim());
        fd.append("letterDate", form.letterDate);
        fd.append("priority", form.priority);
        fd.append("secrecy", form.secrecy);
        if (form.signerName) fd.append("signerName", form.signerName.trim());
        if (form.letterCode) fd.append("letterCode", form.letterCode.trim());
        if (form.destinationNumber) fd.append("destinationNumber", form.destinationNumber.trim());
        if (form.personInCharge) fd.append("personInCharge", form.personInCharge.trim());
        if (form.remarks) fd.append("remarks", form.remarks.trim());
        if (file) fd.append("file", file);
        const { data } = await apiUpload<OutgoingLetter>("/outgoing-letters", fd);
        toast.success("Surat keluar diterbitkan.");
        refreshNotificationBadge();
        router.replace(`/surat-keluar/${data.id}`);
        return;
      }

      const { data } = await apiFetch<OutgoingLetter[]>("/outgoing-letters/reserve-bulk", {
        method: "POST",
        body: JSON.stringify({
          count: Number(count),
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
      setBooked(Array.isArray(data) ? data : []);
      refreshNotificationBadge();
      toast.success(`${data.length} nomor berhasil dibooking.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan surat keluar");
    } finally {
      setLoading(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <RequirePerm perm="outgoing.view" label="Buat Surat Keluar">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buat Surat Keluar</h1>
          <p className="mt-0.5 text-sm text-muted">
            Nomor surat dibuat otomatis oleh backend. Langsung terbitkan atau booking nomor terlebih dahulu.
          </p>
        </div>
      </div>

      <div className="mt-4 max-w-3xl rounded-lg border border-line bg-surface p-4">
        {canCreate && canReserve ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`rounded-lg px-4 py-2 font-medium transition ${mode === "create" ? "bg-brand-900 text-white" : "border border-line bg-field text-muted hover:bg-paper"}`}
            >
              Langsung terbit
            </button>
            <button
              type="button"
              onClick={() => setMode("reserve")}
              className={`rounded-lg px-4 py-2 font-medium transition ${mode === "reserve" ? "bg-brand-900 text-white" : "border border-line bg-field text-muted hover:bg-paper"}`}
            >
              Booking nomor
            </button>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          {mode === "create" && canCreate ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-2 font-semibold">Berkas lampiran</h2>
              <p className="text-sm text-muted">Opsional saat penerbitan langsung. PDF/JPG/PNG, maksimal 10 MB.</p>
              <div className="mt-2">
                <FileButton hint="PDF/JPG/PNG, maksimal 10 MB." onSelect={setFile} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Klasifikasi arsip*">
              <select required value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="">— pilih —</option>
                {classes.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal surat* (tidak boleh masa depan)">
              <input type="date" required max={today()} value={form.letterDate} onChange={set("letterDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            {mode === "create" ? (
              <>
                <Field label="Perihal (min 5 karakter)*">
                  <input required value={form.subject} onChange={set("subject")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Tujuan surat*">
                  <input required value={form.recipient} onChange={set("recipient")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Jumlah nomor yang dibooking*">
                  <input type="number" min={1} max={50} required value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Alasan booking (min 5 karakter)*">
                  <textarea required value={form.reason} onChange={set("reason")} rows={3} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prioritas">
              <select value={form.priority} onChange={set("priority")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="BIASA">Biasa</option>
                <option value="SEGERA">Segera</option>
                <option value="SANGAT_SEGERA">Sangat segera</option>
              </select>
            </Field>
            <Field label="Sifat">
              <select value={form.secrecy} onChange={set("secrecy")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="B">Biasa</option>
                <option value="R">Rahasia</option>
                <option value="SR">Sangat rahasia</option>
              </select>
            </Field>
            <Field label="Penandatangan">
              <input value={form.signerName} onChange={set("signerName")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode surat">
              <input value={form.letterCode} onChange={set("letterCode")} placeholder="cth: 800.1" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Nomor tujuan">
              <input value={form.destinationNumber} onChange={set("destinationNumber")} placeholder="cth: 001/KT/XI/2026" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Penanggung jawab">
              <input value={form.personInCharge} onChange={set("personInCharge")} placeholder="Nama pegawai" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Keterangan">
              <input value={form.remarks} onChange={set("remarks")} placeholder="Catatan tambahan" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          {error ? <ErrorBox message={error} /> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {loading ? "Memproses…" : mode === "create" ? "Terbitkan surat" : `Booking ${count || 0} nomor`}
          </button>
        </form>

        {booked.length ? (
          <div className="mt-4 rounded-lg border border-ok-700/20 bg-ok-100/40 p-4">
            <h2 className="font-semibold text-ok-700">Nomor berhasil dibooking</h2>
            <p className="mt-0.5 text-sm text-secondary">
              Lengkapi perihal dan tujuan saat menerbitkan. Nomor tidak perlu diisi manual.
            </p>
            <ul className="mt-3 space-y-2">
              {booked.map((letter) => (
                <li key={letter.id} className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm">
                  <span className="font-mono font-semibold">{letter.letterNumber}</span>
                  <span className="text-muted">urut {letter.sequenceNumber ?? "—"}</span>
                  <Link href={`/surat-keluar/${letter.id}`} className="ml-auto text-sm font-semibold text-brand-800 hover:underline">
                    Buka detail
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/surat-keluar?status=RESERVED" className="mt-3 inline-block text-sm font-semibold text-brand-800 hover:underline">
              Lihat semua surat dipesan
            </Link>
          </div>
        ) : null}
      </div>
    </RequirePerm>
  );
}
