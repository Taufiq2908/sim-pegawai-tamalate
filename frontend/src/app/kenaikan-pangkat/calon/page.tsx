"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { toast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { PromotionBatch, PromotionCandidate } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function isSelectable(r: PromotionCandidate): boolean {
  return r.eligible === true && !r.missingRankTmt && !r.existingItem;
}

export default function PromotionCalonPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PromotionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [includeAll, setIncludeAll] = useState(false);
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodMonth, setPeriodMonth] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ periodYear: year });
      if (includeAll) params.set("includeAll", "true");
      if (q.trim()) params.set("q", q.trim());
      const { data } = await apiFetch<PromotionCandidate[]>(
        `/promotion-requests/candidates?${params.toString()}`,
      );
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      // Buang pilihan yang tidak lagi ada / tidak lagi memenuhi syarat.
      const valid = new Set(list.filter(isSelectable).map((r) => r.employee.id));
      setSelected((prev) => {
        const next = new Set([...prev].filter((id) => valid.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar calon");
    } finally {
      setLoading(false);
    }
  }, [year, includeAll, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function fmtDate(iso?: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(+d)) return iso;
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  const selectableRows = useMemo(() => rows.filter(isSelectable), [rows]);
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.employee.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.employee.id)));
  }

  async function createDraft() {
    if (selected.size === 0) {
      toast.error("Pilih minimal satu ASN terlebih dahulu.");
      return;
    }
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      toast.error("Tahun periode tidak valid.");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        periodYear: y,
        employeeIds: [...selected],
      };
      if (periodMonth) body.periodMonth = Number(periodMonth);
      if (note.trim()) body.note = note.trim();

      const { data } = await apiFetch<PromotionBatch>("/promotion-requests", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(`Draf usulan ${data.batchNumber} berhasil dibuat.`);
      router.push(`/kenaikan-pangkat/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat draf usulan");
    } finally {
      setCreating(false);
    }
  }

  return (
    <RequirePerm perm="promotion.view" label="Daftar Calon Kenaikan Pangkat" denyForEmployee>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            onClick={() => router.push("/kenaikan-pangkat")}
            className="text-sm font-semibold text-muted hover:text-slate-900"
          >
            ← Kembali ke daftar usulan
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => setIncludeAll(e.target.checked)}
              className="rounded border-line text-brand-700 focus:ring-brand-700"
            />
            Tampilkan yang belum jatuh tempo / belum ada TMT
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, NIP, unit…"
            className="flex-1 min-w-[200px] rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button
            onClick={() => void load()}
            className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Tampilkan
          </button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="mt-3 rounded-lg border border-brand-700/30 bg-brand-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Buat Draf Usulan</h2>
              <p className="mt-0.5 text-xs text-muted">
                {selected.size} ASN dipilih. Item yang sudah diusulkan, belum jatuh tempo, atau
                belum punya TMT tidak bisa dipilih.
              </p>
            </div>
            <button
              onClick={createDraft}
              disabled={creating}
              className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
            >
              {creating ? "Membuat draf…" : "Buat Draf Usulan"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[110px_180px_minmax(0,1fr)]">
            <label className="text-xs text-muted">
              Tahun periode
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-700"
              />
            </label>
            <label className="text-xs text-muted">
              Bulan periode (opsional)
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-700"
              >
                <option value="">Tidak ditentukan</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Catatan (opsional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Usulan kenaikan pangkat April 2026"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-700"
              />
            </label>
          </div>
        </div>
      ) : null}

      {loading && <Skeleton className="mt-3 h-64 w-full" />}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="Tidak ada calon ASN" hint="Ubah tahun atau centang 'Tampilkan yang belum jatuh tempo / belum ada TMT'." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="w-10 px-3 py-2 font-medium">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua ASN yang memenuhi syarat"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableRows.length === 0}
                    className="rounded border-line text-brand-700 focus:ring-brand-700"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">NIP</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Gol. Saat Ini</th>
                <th className="px-3 py-2 font-medium">TMT Pangkat</th>
                <th className="px-3 py-2 font-medium">Masa Jabatan</th>
                <th className="px-3 py-2 font-medium">Jatuh Tempo</th>
                <th className="px-3 py-2 font-medium">Gol. Diusulkan</th>
                <th className="px-3 py-2 font-medium">Kelayakan</th>
                <th className="px-3 py-2 font-medium">Status Usulan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canSelect = isSelectable(r);
                return (
                  <tr key={r.employee.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${r.employee.name}`}
                        checked={selected.has(r.employee.id)}
                        onChange={() => toggleOne(r.employee.id)}
                        disabled={!canSelect}
                        title={
                          r.existingItem
                            ? "ASN sudah masuk usulan lain"
                            : r.missingRankTmt
                              ? "TMT pangkat terakhir belum diisi"
                              : r.eligible === false
                                ? "Belum memenuhi masa jabatan"
                                : undefined
                        }
                        className="rounded border-line text-brand-700 focus:ring-brand-700 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{r.employee.name}</td>
                    <td className="px-3 py-2.5 text-muted">{r.employee.nip ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{r.employee.orgUnit?.name ?? "—"}</td>
                    <td className="px-3 py-2.5">{r.currentRank ?? "—"}</td>
                    <td className="px-3 py-2.5">{fmtDate(r.currentRankTmt)}</td>
                    <td className="px-3 py-2.5 text-muted">{r.yearsInRank ?? "—"} th</td>
                    <td className="px-3 py-2.5">{fmtDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5">{r.suggestedTargetRank ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {r.eligible === true && <span className="rounded bg-ok-100 px-1.5 py-0.5 text-[11px] font-semibold text-ok-700">Layak</span>}
                      {r.eligible === false && <span className="rounded bg-bad-100 px-1.5 py-0.5 text-[11px] font-semibold text-bad-700">Belum layak</span>}
                      {r.eligible === null && <span className="text-xs text-muted">—</span>}
                      {r.missingRankTmt && <span className="ml-1 rounded bg-warn-100 px-1.5 py-0.5 text-[11px] font-semibold text-warn-700">TMT belum ada</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.existingItem ? (
                        <Link
                          href={`/kenaikan-pangkat/${r.existingItem.batchId}`}
                          className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium text-brand-800 underline-offset-2 ring-1 ring-inset ring-line hover:underline"
                          title={`Buka ${r.existingItem.batchNumber}`}
                        >
                          Sudah diusulkan ({r.existingItem.batchNumber})
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Belum</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
