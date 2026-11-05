"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiUpload } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { Field, FileButton } from "@/components/form";
import { ErrorBox } from "@/components/ui";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type { LetterType } from "@/lib/types";

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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function SuratMasukBaruPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Classification[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState("");

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

  function validate(send: boolean): string | null {
    if (!form.letterNumber.trim()) return "Nomor surat wajib diisi.";
    if (!form.sender.trim()) return "Pengirim wajib diisi.";
    if (form.subject.trim().length < 5) return "Perihal minimal 5 karakter.";
    if (!form.letterDate) return "Tanggal surat wajib diisi.";
    // Detail draft tidak punya endpoint edit ringkasan/klasifikasi. Wajibkan
    // sekarang agar draft selalu bisa dilengkapi file lalu dikirim ke Sekcam.
    if (!form.summary.trim()) return "Ringkasan isi wajib diisi.";
    if (!form.classificationCode) return "Klasifikasi arsip wajib dipilih.";

    if (form.letterType === "UNDANGAN") {
      if (!form.activityDate) return "Tanggal kegiatan wajib diisi untuk surat undangan.";
      if (!form.activityStartTime || !form.activityEndTime) return "Waktu mulai dan selesai kegiatan wajib diisi.";
      if (form.activityEndTime < form.activityStartTime) return "Waktu selesai tidak boleh sebelum waktu mulai.";
      if (!form.activityLocation.trim()) return "Tempat kegiatan wajib diisi.";
      if (form.assignedUserIds.length === 0) return "Pilih minimal satu petugas agenda untuk surat undangan.";
    }

    if (send && !file) return "File surat wajib diunggah sebelum dikirim ke Sekcam.";

    if (file) {
      if (file.size > MAX_FILE_BYTES) return "File maksimal 10 MB.";
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return "File harus PDF, JPG, atau PNG.";
    }
    return null;
  }

  async function save(send: boolean) {
    setError("");
    const validation = validate(send);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(send ? "send" : "draft");
    try {
      const fd = new FormData();
      fd.append("letterType", form.letterType);
      fd.append("letterNumber", form.letterNumber.trim());
      fd.append("sender", form.sender.trim());
      fd.append("subject", form.subject.trim());
      fd.append("letterDate", form.letterDate);
      fd.append("priority", form.priority);
      fd.append("secrecy", form.secrecy);
      fd.append("submit", send ? "true" : "false");
      if (form.summary.trim()) fd.append("summary", form.summary.trim());
      if (form.addressedTo.trim()) fd.append("addressedTo", form.addressedTo.trim());
      if (form.pic.trim()) fd.append("pic", form.pic.trim());
      if (form.remarks.trim()) fd.append("remarks", form.remarks.trim());
      if (form.classificationCode) fd.append("classificationCode", form.classificationCode);
      if (form.letterType === "UNDANGAN") {
        fd.append("activityDate", form.activityDate);
        fd.append("activityStartTime", form.activityStartTime);
        fd.append("activityEndTime", form.activityEndTime);
        fd.append("activityLocation", form.activityLocation.trim());
        fd.append("assignedUserIds", JSON.stringify(form.assignedUserIds));
      }
      if (file) fd.append("file", file);

      const { data } = await apiUpload<{ id: string }>("/letters", fd);
      toast.success(send ? "Surat dikirim ke Sekcam." : "Draft surat disimpan.");
      refreshNotificationBadge();
      router.replace(`/surat-masuk/${data.id}`);
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

  const toggleUser = (id: string) => {
    setForm((f) => {
      const next = new Set(f.assignedUserIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, assignedUserIds: Array.from(next) };
    });
  };

  const isSelected = (id: string) => form.assignedUserIds.includes(id);
  const isInvitation = form.letterType === "UNDANGAN";

  return (
    <RequirePerm perm="letter.create" label="Catat Surat Masuk">
      <h1 className="text-xl font-bold">Catat Surat Masuk</h1>
      <p className="mt-1 text-sm text-muted">
        Nomor agenda dibuat otomatis oleh backend. Ringkasan dan klasifikasi wajib diisi sejak draft; file dapat diunggah nanti sebelum dikirim ke Sekcam.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="mt-4 max-w-3xl space-y-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis surat*">
            <select
              value={form.letterType}
              onChange={(e) => setForm((f) => ({ ...f, letterType: e.target.value as LetterType }))}
              className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
            >
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
            <input value={form.remarks} onChange={set("remarks")} placeholder="cth: Ditujukan kepada Kasi Trantib" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
        </div>

        {isInvitation ? (
          <div className="border-t border-line pt-4">
            <h2 className="font-semibold">Kegiatan undangan</h2>
            <p className="mt-0.5 text-sm text-muted">
              Tanggal, waktu, tempat, dan minimal satu petugas agenda wajib diisi untuk jenis undangan.
            </p>
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
                <input value={form.activityLocation} onChange={set("activityLocation")} placeholder="cth: Ruang Rapat Camat" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
              </Field>
            </div>
            <Field label="Petugas agenda*">
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className={`cursor-pointer rounded-lg border p-2 text-sm transition ${
                      isSelected(u.id)
                        ? "border-brand-900 bg-brand-900 text-white"
                        : "border-line bg-surface text-ink hover:bg-paper"
                    }`}
                  >
                    <input type="checkbox" checked={isSelected(u.id)} onChange={() => toggleUser(u.id)} className="sr-only" />
                    <div className="truncate font-medium">{u.name}</div>
                    <div className={`truncate text-xs ${isSelected(u.id) ? "text-white/75" : "text-muted"}`}>{u.username}</div>
                    {u.nip ? <div className={`truncate text-xs ${isSelected(u.id) ? "text-white/75" : "text-muted"}`}>{u.nip}</div> : null}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{form.assignedUserIds.length} petugas dipilih.</p>
            </Field>
          </div>
        ) : null}

        <div className="border-t border-line pt-4">
          <h2 className="font-semibold">File surat</h2>
          <p className="mt-0.5 text-sm text-muted">PDF/JPG/PNG, maksimal 10 MB. File wajib saat dikirim ke Sekcam.</p>
          <div className="mt-2">
            <FileButton hint="Dokumen asli yang diterima." onSelect={setFile} />
          </div>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg border border-line bg-field px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50"
          >
            {busy === "draft" ? "Menyimpan…" : "Simpan Draft"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void save(true)}
            className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {busy === "send" ? "Mengirim…" : "Simpan & Kirim ke Sekcam"}
          </button>
        </div>
      </form>
    </RequirePerm>
  );
}
