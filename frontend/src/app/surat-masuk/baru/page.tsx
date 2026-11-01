"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";

export default function SuratMasukBaruPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Array<{ code: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; username: string; name: string; nip: string | null }>>([]);
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
    activityDate: "",
    activityStartTime: "",
    activityEndTime: "",
    activityLocation: "",
    assignedUserIds: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Array<{ code: string; name: string }>>("/letters/classifications")
      .then(({ data }) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
    apiFetch<Array<{ id: string; username: string; employee?: { name: string; nip: string | null } | null }>>(
      "/users?limit=50&active=true",
    )
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setUsers(
          list.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.employee?.name ?? u.username,
            nip: u.employee?.nip ?? null,
          })),
        );
      })
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
          activityDate: form.activityDate || undefined,
          activityStartTime: form.activityStartTime || undefined,
          activityEndTime: form.activityEndTime || undefined,
          activityLocation: form.activityLocation || undefined,
          assignedUserIds: form.assignedUserIds.length ? form.assignedUserIds : undefined,
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

  const toggleUser = (id: string) => {
    setForm((f) => {
      const next = new Set(f.assignedUserIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, assignedUserIds: Array.from(next) };
    });
  };

  const isSelected = (id: string) => form.assignedUserIds.includes(id);

  return (
    <RequirePerm perm="letter.create" label="Catat Surat Masuk">
      <h1 className="text-xl font-bold">Catat Surat Masuk</h1>
      <p className="mt-1 text-sm text-muted">Nomor agenda dibuat otomatis oleh backend.</p>
      <form onSubmit={onSubmit} className="mt-4 max-w-3xl space-y-4 rounded-lg border border-line bg-surface p-5">
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
          <Field label="Keterangan (tampil di buku agenda)">
            <input value={form.remarks} onChange={set("remarks")} placeholder="cth: Ditujukan kepada Kasi Trantib untuk ditindaklanjuti" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>

        <div className="border-t pt-4">
          <h2 className="font-semibold mb-3">Kegiatan (agenda surat)</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Tanggal kegiatan">
              <input type="date" value={form.activityDate} onChange={set("activityDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Waktu mulai">
              <input type="time" value={form.activityStartTime} onChange={set("activityStartTime")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Waktu selesai">
              <input type="time" value={form.activityEndTime} onChange={set("activityEndTime")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Tempat kegiatan">
              <input value={form.activityLocation} onChange={set("activityLocation")} placeholder="cth: Ruang Rapat Camat" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <Field label="Petugas agenda">
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {users.map((u) => (
                <label
                  key={u.id}
                  className={`rounded-lg border p-2 text-sm transition cursor-pointer ${
                    isSelected(u.id)
                      ? "bg-brand-900 border-brand-900 text-white"
                      : "border-line bg-surface text-ink hover:bg-paper"
                  }`}
                >
                  <input type="checkbox" checked={isSelected(u.id)} onChange={() => toggleUser(u.id)} className="sr-only" />
                  <div className="font-medium truncate">{u.name}</div>
                  <div className="text-xs text-muted truncate">{u.username}</div>
                  {u.nip ? <div className="text-xs text-muted">{u.nip}</div> : null}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">Pilih pegawai yang ditugaskan untuk kegiatan ini.</p>
          </Field>
        </div>

        {error ? <ErrorBox message={error} /> : null}
        <SubmitButton loading={loading}>Catat surat</SubmitButton>
      </form>
    </RequirePerm>
  );
}
