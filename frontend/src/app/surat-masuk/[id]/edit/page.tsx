"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { Field } from "@/components/form";
import { ErrorBox, Skeleton } from "@/components/ui";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type { IncomingLetter, LetterType } from "@/lib/types";

interface Classification {
  code: string;
  name: string;
}

interface UserOption {
  id: string;
  username: string;
  name: string;
  nip: string | null;
}

export default function SuratMasukEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [classes, setClasses] = useState<Classification[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState("");
  const [hasDocument, setHasDocument] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({
    letterType: "BIASA" as LetterType,
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

  useEffect(() => {
    apiFetch<Classification[]>("/letters/classifications")
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

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch<IncomingLetter>(`/letters/${id}`)
      .then(({ data }) => {
        setStatus(data.status);
        setHasDocument(Boolean(data.documents?.length));
        setForm({
          letterType: data.letterType,
          letterNumber: data.letterNumber,
          sender: data.sender,
          subject: data.subject,
          letterDate: data.letterDate.slice(0, 10),
          priority: data.priority,
          secrecy: data.secrecy,
          summary: data.summary ?? "",
          addressedTo: data.addressedTo ?? "",
          pic: data.pic ?? "",
          remarks: data.remarks ?? "",
          classificationCode: data.classification?.code ?? "",
          activityDate: data.activityDate ? data.activityDate.slice(0, 10) : "",
          activityStartTime: data.activityStartTime ?? "",
          activityEndTime: data.activityEndTime ?? "",
          activityLocation: data.activityLocation ?? "",
          assignedUserIds: (data.assignedStaff ?? []).map((s) => s.id),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat surat"))
      .finally(() => setLoading(false));
  }, [id]);

  function validate(send: boolean): string | null {
    if (!form.letterNumber.trim()) return "Nomor surat wajib diisi.";
    if (!form.sender.trim()) return "Pengirim wajib diisi.";
    if (form.subject.trim().length < 5) return "Perihal minimal 5 karakter.";
    if (!form.letterDate) return "Tanggal surat wajib diisi.";
    if (!form.summary.trim()) return "Ringkasan isi wajib diisi.";
    if (!form.classificationCode) return "Klasifikasi arsip wajib dipilih.";
    if (form.letterType === "UNDANGAN") {
      if (!form.activityDate) return "Tanggal kegiatan wajib diisi untuk surat undangan.";
      if (!form.activityStartTime || !form.activityEndTime) return "Waktu mulai dan selesai kegiatan wajib diisi.";
      if (form.activityEndTime < form.activityStartTime) return "Waktu selesai tidak boleh sebelum waktu mulai.";
      if (!form.activityLocation.trim()) return "Tempat kegiatan wajib diisi.";
      if (form.assignedUserIds.length === 0) return "Pilih minimal satu petugas agenda untuk surat undangan.";
    }
    if (send && !hasDocument) return "File surat wajib sudah diunggah sebelum dikirim ke Sekcam.";
    return null;
  }

  async function save(send: boolean) {
    setError("");
    const validation = validate(send);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(send ? "send" : "save");
    try {
      await apiFetch<IncomingLetter>(`/letters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          letterType: form.letterType,
          letterNumber: form.letterNumber.trim(),
          sender: form.sender.trim(),
          subject: form.subject.trim(),
          letterDate: form.letterDate,
          priority: form.priority,
          secrecy: form.secrecy,
          summary: form.summary.trim(),
          addressedTo: form.addressedTo.trim() || null,
          pic: form.pic.trim() || null,
          remarks: form.remarks.trim() || null,
          classificationCode: form.classificationCode,
          activityDate: form.letterType === "UNDANGAN" ? form.activityDate : null,
          activityStartTime: form.letterType === "UNDANGAN" ? form.activityStartTime : null,
          activityEndTime: form.letterType === "UNDANGAN" ? form.activityEndTime : null,
          activityLocation: form.letterType === "UNDANGAN" ? form.activityLocation.trim() : null,
          assignedUserIds: form.letterType === "UNDANGAN" ? form.assignedUserIds : [],
        }),
      });
      if (send) {
        await apiFetch<IncomingLetter>(`/letters/${id}/submit`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }
      refreshNotificationBadge();
      toast.success(send ? "Surat dikirim ulang ke Sekcam." : "Perubahan surat disimpan.");
      router.replace(`/surat-masuk/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan surat");
    } finally {
      setBusy(null);
    }
  }

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleUser = (userId: string) => {
    setForm((f) => {
      const next = new Set(f.assignedUserIds);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...f, assignedUserIds: Array.from(next) };
    });
  };

  const isInvitation = form.letterType === "UNDANGAN";

  return (
    <RequirePerm perm="letter.create" label="Edit Surat Masuk">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/surat-masuk/${id}`} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          ← Kembali
        </Link>
        <span className="text-xs text-muted">Status: {status || "—"}</span>
      </div>
      <h1 className="mt-3 text-xl font-bold">Edit Surat Masuk</h1>
      <p className="mt-1 text-sm text-muted">
        Perbaiki isi surat sesuai catatan Sekcam, lalu simpan atau kirim ulang untuk diperiksa.
      </p>
      {loading ? (
        <Skeleton className="mt-4 h-64 w-full max-w-3xl" />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="mt-4 max-w-3xl space-y-4 rounded-lg border border-line bg-surface p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis surat*">
              <select value={form.letterType} onChange={(e) => setForm((f) => ({ ...f, letterType: e.target.value as LetterType }))} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="BIASA">Biasa</option>
                <option value="UNDANGAN">Undangan / kegiatan</option>
              </select>
            </Field>
            <Field label="Sifat surat">
              <select value={form.secrecy} onChange={set("secrecy")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="B">Biasa</option>
                <option value="R">Rahasia</option>
                <option value="SR">Sangat rahasia</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomor surat (dari pengirim)*">
              <input required value={form.letterNumber} onChange={set("letterNumber")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Pengirim*">
              <input required value={form.sender} onChange={set("sender")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          <Field label="Perihal (min 5 karakter)*">
            <input required value={form.subject} onChange={set("subject")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal surat*">
              <input type="date" required value={form.letterDate} onChange={set("letterDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Prioritas">
              <select value={form.priority} onChange={set("priority")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="BIASA">Biasa</option>
                <option value="SEGERA">Segera</option>
                <option value="SANGAT_SEGERA">Sangat segera</option>
              </select>
            </Field>
          </div>

          <Field label="Ringkasan isi*">
            <textarea required value={form.summary} onChange={set("summary")} rows={3} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ditujukan ke">
              <input value={form.addressedTo} onChange={set("addressedTo")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Penanggung jawab">
              <input value={form.pic} onChange={set("pic")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Klasifikasi arsip*">
              <select required value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="">— pilih klasifikasi —</option>
                {classes.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Keterangan (tampil di buku agenda)">
              <input value={form.remarks} onChange={set("remarks")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>

          {isInvitation ? (
            <div className="border-t border-line pt-4">
              <h2 className="font-semibold">Kegiatan undangan</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-4">
                <Field label="Tanggal kegiatan*">
                  <input type="date" required value={form.activityDate} onChange={set("activityDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Waktu mulai*">
                  <input type="time" required value={form.activityStartTime} onChange={set("activityStartTime")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Waktu selesai*">
                  <input type="time" required value={form.activityEndTime} onChange={set("activityEndTime")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
                <Field label="Tempat kegiatan*">
                  <input value={form.activityLocation} onChange={set("activityLocation")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </Field>
              </div>
              <Field label="Petugas agenda*">
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  {users.map((u) => {
                    const selected = form.assignedUserIds.includes(u.id);
                    return (
                      <label key={u.id} className={`cursor-pointer rounded-lg border p-2 text-sm ${selected ? "border-brand-900 bg-brand-900 text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
                        <input type="checkbox" checked={selected} onChange={() => toggleUser(u.id)} className="sr-only" />
                        <div className="truncate font-medium">{u.name}</div>
                        <div className={`truncate text-xs ${selected ? "text-white/75" : "text-muted"}`}>{u.username}</div>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted">{form.assignedUserIds.length} petugas dipilih.</p>
              </Field>
            </div>
          ) : null}

          <div className="rounded-lg bg-paper p-3 text-sm text-muted">
            {hasDocument ? "File surat sudah tersedia. Gunakan halaman detail untuk mengganti/menambah dokumen." : "Belum ada file surat. Unggah file dari halaman detail sebelum mengirim."}
          </div>

          {error ? <ErrorBox message={error} /> : null}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="submit" disabled={busy !== null} className="rounded-lg border border-line bg-field px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50">
              {busy === "save" ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void save(true)} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
              {busy === "send" ? "Mengirim…" : "Simpan & Kirim ke Sekcam"}
            </button>
          </div>
        </form>
      )}
    </RequirePerm>
  );
}
