"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type {
  ArchiveCategory,
  ArchiveRecord,
  ArchiveSourceType,
} from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function ArsipPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("archive.create");

  const [items, setItems] = useState<ArchiveRecord[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [sourceType, setSourceType] = useState<ArchiveSourceType | "">("");
  const [category, setCategory] = useState<ArchiveCategory | "">("");
  const [year, setYear] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [listId, setListId] = useState("");
  const [unlisted, setUnlisted] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const SOURCE_OPTIONS: Array<{ value: ArchiveSourceType; label: string }> = [
    { value: "INCOMING", label: "Surat Masuk" },
    { value: "OUTGOING", label: "Surat Keluar" },
  ];
  const CATEGORY_OPTIONS: Array<{ value: ArchiveCategory; label: string }> = [
    { value: "AKTIF", label: "Aktif" },
    { value: "INAKTIF", label: "Tidak Aktif" },
    { value: "PENTING", label: "Penting" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sourceType) params.set("sourceType", sourceType);
      if (category) params.set("category", category);
      if (year) params.set("year", year);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (listId) params.set("listId", listId);
      if (unlisted) params.set("unlisted", "true");
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("limit", "20");

      const { data, meta: m } = await apiFetch<{
        items: ArchiveRecord[];
        page: number;
        limit: number;
        total: number;
      }>(`/archives?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as { page: number; limit: number; total: number } | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku arsip");
    } finally {
      setLoading(false);
    }
  }, [sourceType, category, year, dateFrom, dateTo, listId, unlisted, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const locationLabel = (loc: ArchiveRecord["location"]): string => {
    switch (loc) {
      case "LEMARI_ARSIP": return "Lemari Arsip";
      case "GUDANG_ARSIP": return "Gudang Arsip";
      case "LURAH": return "Lurah";
      default: return loc;
    }
  };

  const sourceLabel = (s: ArchiveRecord["sourceType"]): string => {
    return s === "INCOMING" ? "Masuk" : "Keluar";
  };

  const pageCount = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 20)));

  return (
    <RequirePerm perm="archive.view" label="Buku Arsip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Arsip</h1>
          <p className="mt-0.5 text-sm text-muted">
            Katalog dokumen yang telah dicatat dari surat masuk dan surat keluar.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/arsip/baru"
            className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            + Catat Arsip
          </Link>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          <FieldFilter
            label="Sumber"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ArchiveSourceType)}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <FieldFilter
            label="Kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value as ArchiveCategory)}
            options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <FieldFilter
            label="Tahun"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            type="number"
            min={2000}
            max={2100}
          />
          <FieldFilter
            label="Dari tanggal"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            type="date"
          />
          <FieldFilter
            label="Sampai tanggal"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            type="date"
          />
          <FieldFilter
            label="Masuk daftar"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            placeholder="ID daftar"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor arsip, uraian, kode, berkas…"
            className="flex-1 min-w-[200px] rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button
            onClick={() => {
              setQ("");
              setSourceType("");
              setCategory("");
              setYear("");
              setDateFrom("");
              setDateTo("");
              setListId("");
              setUnlisted(false);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-paper"
          >
            Reset
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={unlisted}
              onChange={(e) => setUnlisted(e.target.checked)}
              className="rounded border-line text-brand-700 focus:ring-brand-700"
            />
            Belum masuk daftar
          </label>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Tidak ada data arsip"
          hint="Coba ubah filter atau catat arsip baru."
        />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Nomor Arsip</th>
                  <th className="px-3 py-2">Tgl. Arsip</th>
                  <th className="px-3 py-2">Sumber</th>
                  <th className="px-3 py-2">Nomor Dokumen</th>
                  <th className="px-3 py-2">Uraian</th>
                  <th className="px-3 py-2">Kode Arsip</th>
                  <th className="px-3 py-2">Kode Berkas</th>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Lokasi Simpan</th>
                  <th className="px-3 py-2">Daftar / Status</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{r.archiveNumber}</td>
                    <td className="px-3 py-2">{r.archiveDate.slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line">
                        {sourceLabel(r.sourceType)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.documentNumber ?? "-"}</td>
                    <td className="px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2">{r.code}</td>
                    <td className="px-3 py-2">{r.bundleCode ?? "-"}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2">{locationLabel(r.location)}</td>
                    <td className="px-3 py-2">
                      {r.list ? (
                        <>
                          <div className="text-xs font-medium">{r.list.listNumber}</div>
                          <StatusBadge status={r.list.status} />
                        </>
                      ) : (
                        <span className="text-xs text-muted">Belum terdaftar</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Link
                          href={`/arsip/${r.id}`}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-paper"
                        >
                          Detail
                        </Link>
                        {r.list?.status === "DRAFT" && hasPermission("archive.update") ? (
                          <Link
                            href={`/arsip/${r.id}`}
                            className="rounded-md bg-brand-900 px-2.5 py-1 text-xs text-white hover:bg-brand-800"
                          >
                            Ubah
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted">
                Menampilkan {items.length} dari {meta.total} data
              </p>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <span className="px-2 text-muted">Halaman {page} dari {pageCount}</span>
                <button
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </RequirePerm>
  );
}

function FieldFilter({
  label,
  value,
  onChange,
  options,
  type = "text",
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  options?: Array<{ value: string; label: string }>;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLSelectElement>) => void}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand-700"
        >
          <option value="">— semua —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          min={min != null ? String(min) : undefined}
          max={max != null ? String(max) : undefined}
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
          placeholder={placeholder}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand-700"
        />
      )}
    </div>
  );
}
