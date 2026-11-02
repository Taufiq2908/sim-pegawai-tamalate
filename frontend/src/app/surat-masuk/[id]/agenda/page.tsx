"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
import { toast } from "@/components/toast";
import type { IncomingLetter } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface UserOption {
  id: string;
  username: string;
  name: string;
  nip: string | null;
  position: string | null;
}

/** Atur agenda kegiatan & petugas surat masuk (PATCH /letters/:id/agenda, perm letter.register). */
export default function AturAgendaSuratPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<IncomingLetter | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [activityDate, setActivityDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}`);
      setDetail(data);
      setActivityDate(data.activityDate ? data.activityDate.slice(0, 10) : "");
      setStartTime(data.activityStartTime ?? "");
      setEndTime(data.activityEndTime ?? "");
      setLocation(data.activityLocation ?? "");
      setAssignedUserIds((data.agendaAssignments ?? []).map((a) => a.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat surat");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    apiFetch<Array<{ id: string; username: string; employee?: { name: string; nip: string | null; position?: string | null } | null }>>(
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
            position: u.employee?.position ?? null,
          })),
        );
      })
      .catch(() => {});
  }, [load]);

  function toggleUser(userId: string) {
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startTime && endTime && endTime < startTime) {
      toast.error("Waktu selesai tidak boleh sebelum waktu mulai.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/letters/${id}/agenda`, {
        method: "PATCH",
        body: JSON.stringify({
          activityDate: activityDate || null,
          activityStartTime: startTime || null,
          activityEndTime: endTime || null,
          activityLocation: location || null,
          assignedUserIds,
        }),
      });
      toast.success("Agenda surat diperbarui");
      router.push(`/surat-masuk/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan agenda");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePerm perm="letter.register" label="Atur Agenda Surat">
      <button onClick={() => router.push(`/surat-masuk/${id}`)} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali ke detail surat
      </button>

      <div className="mt-2">
        <h1 className="text-xl font-bold">Atur Agenda Kegiatan &amp; Petugas</h1>
        {detail ? (
          <p className="mt-0.5 text-sm text-muted">
            {detail.agendaNumber} — {detail.subject}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !detail ? (
        <EmptyState title="Surat tidak ditemukan" />
      ) : (
        <form onSubmit={onSubmit} className="mt-4 max-w-3xl space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">Kegiatan</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tanggal kegiatan">
                <input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                />
              </Field>
              <Field label="Waktu mulai">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                />
              </Field>
              <Field label="Waktu selesai">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Tempat kegiatan">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="cth: Ruang Rapat Camat"
                  maxLength={200}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-semibold">Petugas agenda</h2>
            <p className="mt-0.5 text-sm text-muted">
              Pilih petugas yang ditugaskan ({assignedUserIds.length} dipilih). Tersimpan sebagai penugasan agenda.
            </p>
            {users.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Tidak ada daftar petugas aktif.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {users.map((u) => {
                  const selected = assignedUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        selected ? "border-brand-900 bg-brand-900/5" : "border-line bg-white hover:bg-paper"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleUser(u.id)}
                        className="rounded border-brand-700 text-brand-700 focus:ring-brand-700"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {u.username}
                          {u.position ? ` • ${u.position}` : ""}
                          {u.nip ? ` • NIP ${u.nip}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <SubmitButton loading={saving}>Simpan agenda</SubmitButton>
            <button
              type="button"
              onClick={() => router.push(`/surat-masuk/${id}`)}
              className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
            >
              Batal
            </button>
          </div>
        </form>
      )}
    </RequirePerm>
  );
}
