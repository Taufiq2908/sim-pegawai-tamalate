"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
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
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reserved, setReserved] = useState<string[]>([]);
  const [reserving3, setReserving3] = useState(false);

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
      const endpoint = mode === "create" ? "/outgoing-letters" : "/outgoing-letters/reserve";
      const body =
        mode === "create"
          ? {
              classificationCode: form.classificationCode,
              subject: form.subject,
              recipient: form.recipient,
              letterDate: form.letterDate || undefined,
              priority: form.priority,
              secrecy: form.secrecy,
              signerName: form.signerName || undefined,
            }
          : {
              classificationCode: form.classificationCode,
              letterDate: form.letterDate,
              reason: form.reason,
              signerName: form.signerName || undefined,
            };
      const { data } = await apiFetch<{ id: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.replace(`/surat-keluar/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setLoading(false);
    }
  }

  async function reserve3() {
    setError("");
    if (!form.classificationCode || !form.letterDate) {
      setError("Pilih klasifikasi dan tanggal surat dulu.");
      return;
    }
    if (form.reason.trim().length < 5) {
      setError("Alasan reservasi min 5 karakter.");
      return;
    }
    setReserving3(true);
    try {
      const nums: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const { data } = await apiFetch<{ letterNumber: string }>("/outgoing-letters/reserve", {
          method: "POST",
          body: JSON.stringify({
            classificationCode: form.classificationCode,
            letterDate: form.letterDate,
            reason: `${form.reason.trim()} (${i}/3)`,
            signerName: form.signerName || undefined,
          }),
        });
        nums.push((data as { letterNumber: string }).letterNumber);
      }
      setReserved(nums);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reservasi 3 nomor gagal");
    } finally {
      setReserving3(false);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <h1 className="text-xl font-bold">Buat Surat Keluar</h1>
      <div className="mt-3 flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
        {(["create", "reserve"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-2 font-medium ${mode === m ? "bg-brand-900 text-white" : "text-muted hover:bg-paper"}`}
          >
            {m === "create" ? "Langsung terbit" : "Reservasi nomor"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-4 max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-5">
        <Field label="Klasifikasi arsip*">
          <select required value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
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
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Field label="Penandatangan">
                <input value={form.signerName} onChange={set("signerName")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Alasan reservasi (min 5 karakter)*">
              <textarea required value={form.reason} onChange={set("reason")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Penandatangan (opsional)">
              <input value={form.signerName} onChange={set("signerName")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </>
        )}
        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>{mode === "create" ? "Terbitkan surat" : "Reservasi nomor"}</SubmitButton>
        {mode === "reserve" ? (
          <div className="rounded-lg bg-paper p-3">
            <button
              type="button"
              disabled={reserving3}
              onClick={() => void reserve3()}
              className="w-full rounded-lg border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-paper disabled:opacity-50"
            >
              {reserving3 ? "Mereservasi…" : "Reservasi 3 nomor sekaligus (untuk surat menyusul/backdate)"}
            </button>
            {reserved.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {reserved.map((n) => (
                  <li key={n} className="rounded bg-white px-3 py-1.5 font-medium">✓ {n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </RequirePerm>
  );
}
