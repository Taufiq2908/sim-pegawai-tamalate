"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PromotionCandidate } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

export default function PromotionCalonPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PromotionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [includeAll, setIncludeAll] = useState(false);
  const [q, setQ] = useState("");

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
      setRows(Array.isArray(data) ? data : []);
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

  return (
    <RequirePerm perm="promotion.view" label="Daftar Calon Kenaikan Pangkat">
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

      {loading && <Skeleton className="mt-3 h-64 w-full" />}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="Tidak ada calon ASN" hint="Ubah tahun atau centang 'Tampilkan yang belum jatuh tempo / belum ada TMT'." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
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
              {rows.map((r) => (
                <tr key={r.employee.id} className="border-b border-line last:border-0 hover:bg-paper">
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
                      <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] ring-1 ring-inset ring-line">
                        Sudah diusulkan ({r.existingItem.batchNumber})
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
      )}
    </RequirePerm>
  );
}
