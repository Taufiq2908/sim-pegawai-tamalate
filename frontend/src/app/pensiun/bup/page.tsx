"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import type { PensionBupRow, PensionBupMeta } from "@/lib/types";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
function periodLabel(y: number, m?: number | null): string {
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

export default function PensiunBupPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("pension.create");

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [bupAge, setBupAge] = useState("58");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<PensionBupRow[]>([]);
  const [meta, setMeta] = useState<PensionBupMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year, bupAge });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { data, meta: m } = await apiFetch<{
        items: PensionBupRow[];
        total: number;
        from: string;
        to: string;
        bupAge: number;
        missingBirthDate: number;
        alreadyInBatch: number;
      }>(`/pension-requests/bup?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
      setMeta(m as PensionBupMeta | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar BUP");
    } finally {
      setLoading(false);
    }
  }, [year, bupAge, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelected = (id: string) => selectedIds.has(id);
  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectable = useMemo(
    () => rows.filter((r) => !r.existingItem),
    [rows]
  );

  async function onCreateDraft() {
    if (selectedIds.size === 0) {
      setError("Pilih minimal satu PNS dari daftar BUP.");
      return;
    }
    const items = Array.from(selectedIds).map((employeeId) => ({
      employeeId,
      pensionType: "BUP",
      note: "",
    }));
    try {
      const { data } = await apiFetch<{ id: string }>("/pension-requests", {
        method: "POST",
        body: JSON.stringify({
          periodYear: Number(year),
          ...(month ? { periodMonth: Number(month) } : {}),
          bupAge: Number(bupAge),
          note: `Usulan pensiun BUP ${periodLabel(Number(year), month ? Number(month) : null)}`,
          items,
        }),
      });
      router.replace(`/pensiun/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat draf usulan");
    }
  }

  return (
    <RequirePerm perm="pension.view" label="Daftar BUP Pensiun">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Daftar BUP Pensiun</h1>
          <p className="mt-0.5 text-sm text-muted">
            PNS yang memasuki usia pensiun (BUP) dalam rentang tanggal.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Tahun">
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
            />
          </Field>
          <Field label="Usia BUP">
            <input
              type="number"
              min={50}
              max={65}
              value={bupAge}
              onChange={(e) => setBupAge(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
            />
          </Field>
          <Field label="Bulan periode (opsional)">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
            >
              <option value="">— tanpa bulan —</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col">
            <button
              onClick={() => {
                setFrom("");
                setTo("");
                void load();
              }}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-paper"
            >
              Reset rentang
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <span className="text-muted">s.d.</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button onClick={() => void load()} className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white">
            Tampilkan
          </button>
          {meta && (
            <span className="text-xs text-muted ml-2">
              {meta.total} pegawai • {meta.missingBirthDate} tanpa tgl lahir •{" "}
              {meta.alreadyInBatch} sudah diusulkan
            </span>
          )}
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Tidak ada PNS memasuki BUP"
          hint="Ubah tahun, usia BUP, atau rentang tanggal."
        />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Pilih</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">NIP</th>
                  <th className="px-3 py-2">Golongan</th>
                  <th className="px-3 py-2">Jabatan</th>
                  <th className="px-3 py-2">Unit Kerja</th>
                  <th className="px-3 py-2">Tgl. Lahir</th>
                  <th className="px-3 py-2">Usia</th>
                  <th className="px-3 py-2">Tgl. Pensiun</th>
                  <th className="px-3 py-2">Masa Kerja</th>
                  <th className="px-3 py-2">Status Usulan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected(r.employee.id)}
                        onChange={() => toggle(r.employee.id)}
                        disabled={!!r.existingItem}
                        className="rounded border-brand-700 text-brand-700 focus:ring-brand-700"
                      />
                      {r.existingItem ? (
                        <span className="ml-1 text-xs text-muted">
                          Sudah diusulkan ({r.existingItem.batchNumber})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.employee.name}</td>
                    <td className="px-3 py-2">{r.employee.nip ?? "-"}</td>
                    <td className="px-3 py-2">{r.employee.rank ?? "-"}</td>
                    <td className="px-3 py-2">{r.employee.position}</td>
                    <td className="px-3 py-2">{r.employee.orgUnit?.name ?? "-"}</td>
                    <td className="px-3 py-2">{r.birthDate.slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.age.years} th {r.age.months} bln</td>
                    <td className="px-3 py-2 font-medium">{r.retirementDate.slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.yearsOfService ?? "-"} th</td>
                    <td className="px-3 py-2">
                      {r.existingItem ? (
                        <span className="rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line">
                          Sudah diusulkan
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Belum</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted">
                Menampilkan {rows.length} pegawai dari {meta.total}
              </p>
            </div>
          )}

          {canCreate && selectable.length > 0 ? (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold mb-2">Buat Draf Usulan</h2>
              <p className="text-sm text-muted mb-3">
                {selectedIds.size} PNS dipilih. Klik tombol berikut untuk membuat draf usulan pensiun.
              </p>
              <button
                onClick={onCreateDraft}
                className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Buat Draf Usulan
              </button>
            </div>
          ) : null}
        </>
      )}
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
