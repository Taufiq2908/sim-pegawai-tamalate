"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/toast";
import type { KgbMonitoringItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function sisaBulan(n: number | null): string {
  if (n === null) return "—";
  if (n < 0) return `Lewat ${Math.abs(n)} bulan`;
  if (n === 0) return "Bulan ini";
  return `${n} bulan lagi`;
}

export default function KgbMonitoringPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<KgbMonitoringItem[]>([]);
  const [q, setQ] = useState("");
  const [hanyaDue, setHanyaDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reminding, setReminding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbMonitoringItem[]>("/kgb-requests/monitoring");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat monitoring KGB");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = q.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (hanyaDue && !it.dueSoon) return false;
    if (!needle) return true;
    return [it.employee.name, it.employee.nip, it.employee.position, it.employee.orgUnit]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });

  const dueSoon = items.filter((it) => it.dueSoon);
  const sudah = items.filter((it) => it.lastKgb).length;

  async function kirimPengingat() {
    setReminding(true);
    try {
      const { data } = await apiFetch<Array<{ employee: string; nextKgbDate: string; monthsUntil: number }>>(
        "/kgb-requests/reminders/generate",
        { method: "POST", body: JSON.stringify({}) },
      );
      const list = Array.isArray(data) ? data : [];
      toast.success(
        list.length
          ? `${list.length} pengingat KGB dibuat untuk pegawai yang jatuh tempo.`
          : "Tidak ada pegawai yang jatuh tempo saat ini.",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat pengingat");
    } finally {
      setReminding(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Monitoring KGB</h1>
          <p className="text-sm text-muted">
            Daftar pegawai aktif, KGB terakhir, dan perkiraan jatuh tempo berikutnya.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href="/kgb/register-book"
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
          >
            Buku register
          </Link>
          <Link
            href="/kgb"
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
          >
            Daftar pengajuan
          </Link>
        </div>
      </div>

      {dueSoon.length ? (
        <div className="mt-3 rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3">
          <div className="flex flex-wrap items-start gap-2">
            <div>
              <p className="text-sm font-semibold text-warn-700">
                {dueSoon.length} pegawai akan memasuki masa KGB (≤ 3 bulan).
              </p>
              <p className="mt-0.5 text-xs text-secondary">
                Arahkan pegawai melengkapi berkas: SK KGB terakhir, SK kenaikan pangkat terakhir,
                dan SKP 2 tahun terakhir.
              </p>
            </div>
            {hasPermission("kgb.remind") ? (
              <button
                disabled={reminding}
                onClick={() => void kirimPengingat()}
                className="ml-auto rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {reminding ? "Mengirim…" : "Kirim pengingat"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, NIP, jabatan, atau unit…"
          className="min-w-52 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
        />
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
          <input type="checkbox" checked={hanyaDue} onChange={(e) => setHanyaDue(e.target.checked)} />
          Hanya jatuh tempo
        </label>
        <span className="self-center text-sm text-muted">
          {items.length} pegawai • {sudah} punya KGB • {dueSoon.length} jatuh tempo
        </span>
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Tidak ada pegawai yang cocok"
            hint={hanyaDue ? "Tidak ada pegawai dalam rentang 3 bulan jatuh tempo." : "Ubah kata kunci pencarian."}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-2 font-medium">No</th>
                  <th className="px-3 py-2 font-medium">Pegawai</th>
                  <th className="px-3 py-2 font-medium">Jabatan / Unit</th>
                  <th className="px-3 py-2 font-medium">Golongan</th>
                  <th className="px-3 py-2 font-medium">KGB terakhir</th>
                  <th className="px-3 py-2 font-medium">KGB berikutnya</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => (
                  <tr key={it.employee.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5 tabular-nums text-muted">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{it.employee.name}</p>
                      <p className="text-xs text-muted">NIP {it.employee.nip ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {it.employee.position}
                      <span className="block text-xs">{it.employee.orgUnit}</span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{it.employee.rank ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {it.lastKgb ? (
                        <Link href={`/kgb/${it.lastKgb.id}`} className="font-medium text-brand-800 hover:underline">
                          {it.lastKgb.requestNumber}
                          <span className="block text-xs font-normal text-muted">
                            {it.lastKgb.oldRank} → {it.lastKgb.newRank} • TMT {fmtDate(it.lastKgb.effectiveDate)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">Belum ada</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium tabular-nums">{fmtDate(it.nextKgbDate)}</span>
                      <span className="block text-xs text-muted">{sisaBulan(it.monthsUntil)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {it.lastKgb ? <StatusBadge status={it.lastKgb.status} /> : null}
                        {it.dueSoon ? (
                          <span className="rounded bg-warn-100 px-1.5 py-0.5 text-[11px] font-semibold text-warn-700">
                            Jatuh tempo ≤ 3 bulan
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
