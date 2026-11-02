"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EmployeeRef } from "@/lib/types";

/**
 * Picker pegawai untuk operator/admin. Hanya dipakai bila pengguna punya
 * `employee.view`; role EMPLOYEE tidak boleh memilih orang lain.
 */
export function EmployeePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (employeeId: string, employee: EmployeeRef | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EmployeeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      apiFetch<EmployeeRef[]>(`/employees?limit=50&q=${encodeURIComponent(q.trim())}`)
        .then(({ data }) => {
          if (alive) setItems(Array.isArray(data) ? data : []);
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : "Gagal memuat pegawai");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const selected = useMemo(
    () => items.find((item) => item.id === value) ?? null,
    [items, value],
  );

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari pegawai berdasarkan nama atau NIP…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-700"
      />
      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line">
        {loading ? (
          <p className="px-3 py-3 text-sm text-muted">Memuat pegawai…</p>
        ) : error ? (
          <p className="px-3 py-3 text-sm text-bad-700">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">Pegawai tidak ditemukan.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(item.id, item)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                      active ? "bg-brand-50 text-brand-900" : "hover:bg-paper"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted">
                        NIP {item.nip ?? "—"}
                        {item.orgUnit?.name ? ` • ${item.orgUnit.name}` : ""}
                      </span>
                    </span>
                    {active ? <span className="text-xs font-semibold text-brand-800">Dipilih</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected ? (
        <p className="mt-2 text-xs text-secondary">
          Dipilih: <b>{selected.name}</b> — NIP {selected.nip ?? "—"}
        </p>
      ) : null}
    </div>
  );
}
