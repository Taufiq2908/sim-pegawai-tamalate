"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ArchiveRecord } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

export default function ArsipDaftarBaruPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({
    periodStart: "",
    periodEnd: "",
    notes: "",
  });
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!form.periodStart || !form.periodEnd) return;
    setRecordsLoading(true);
    try {
      const params = new URLSearchParams({
        unlisted: "true",
        dateFrom: form.periodStart,
        dateTo: form.periodEnd,
        limit: "1000",
      });
      const { data } = await apiFetch<{ items: ArchiveRecord[] }>(
        `/archives?${params.toString()}`,
      );
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pilihan arsip");
    } finally {
      setRecordsLoading(false);
    }
  }, [form.periodStart, form.periodEnd]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const toggleRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSelected = (id: string) => selectedRecordIds.has(id);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.periodStart || !form.periodEnd) {
      setError("Pilih periode mulai dan akhir.");
      return;
    }
    if (form.periodStart > form.periodEnd) {
      setError("Periode mulai tidak boleh setelah periode akhir.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        notes: form.notes.trim() || undefined,
      };
      if (selectedRecordIds.size > 0) {
        body.recordIds = Array.from(selectedRecordIds);
      }
      const { data } = await apiFetch<{ id: string }>("/archives/lists", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.replace(`/arsip/daftar/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat daftar arsip");
    } finally {
      setLoading(false);
    }
  }

  const recordCount = selectedRecordIds.size;
  const autoMode = recordCount === 0;

  return (
    <RequirePerm perm="archive.update" label="Buat Daftar Arsip">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buat Daftar Arsip</h1>
          <p className="mt-0.5 text-sm text-muted">
            Susun kumpulan record arsip dalam satu periode sebelum ditandatangani.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Periode Mulai*">
              <input
                required
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
            </Field>
            <Field label="Periode Akhir*">
              <input
                required
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
            </Field>
          </div>
          <Field label="Catatan">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="cth: Daftar arsip Oktober 2026"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
            />
          </Field>

          <div className="border-t pt-4">
            <h2 className="font-semibold mb-2">Pilih Arsip (opsional)</h2>
            <p className="text-sm text-muted mb-3">
              Biarkan kosong jika semua arsip belum terdaftar dalam periode akan diambil otomatis.
              Pilih spesifik jika hanya ingin menyertakan sebagian.
            </p>
            {recordsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : records.length === 0 ? (
              <p className="text-sm text-muted">
                Tidak ada arsip belum terdaftar dalam periode ini. Atur periode terlebih dahulu.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                {records.map((r) => (
                  <label
                    key={r.id}
                    className={`rounded-lg border p-3 text-sm transition cursor-pointer ${
                      isSelected(r.id)
                        ? "bg-brand-900 border-brand-900 text-white"
                        : "border-line bg-surface text-ink hover:bg-paper"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(r.id)}
                      onChange={() => toggleRecord(r.id)}
                      className="sr-only"
                    />
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted">{r.archiveNumber}</div>
                    <div className="text-xs text-muted">{r.archiveDate.slice(0, 10)} • {r.category}</div>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              {autoMode
                ? "Mode otomatis: semua arsip belum terdaftar dalam periode akan dimasukkan."
                : `Dipilih ${recordCount} arsip. Hanya yang dipilih yang akan dimasukkan ke daftar.`}
            </p>
          </div>

          {error ? <ErrorBox message={error} /> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Memproses…" : "Buat Daftar Arsip"}
          </button>
        </form>
      </div>
    </RequirePerm>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
