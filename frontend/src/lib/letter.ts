"use client";

import type { LeaveTimelineEntry } from "@/lib/types";

/** Tanggal surat: waktu aksi resmi lebih dulu, bukan jam cetak. */
export function letterDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(+date)) return date.toISOString();
  }
  return null;
}

export function formatTanggalSurat(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "................";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Username aktor dari timeline. Backend KGB mengirim "username (ROLE/POS)".
 * Bila nanti backend menambahkan `actorUsername`, nilai itu yang dipakai.
 */
export function actorUsername(entry?: LeaveTimelineEntry | null): string | null {
  if (!entry) return null;
  if (entry.actorUsername) return entry.actorUsername;
  const match = /^([a-z0-9._-]+)\s+\(/i.exec(entry.actor ?? "");
  return match?.[1] ?? null;
}

export function signerDate(entry?: LeaveTimelineEntry | null): string | null {
  return entry?.createdAt ? letterDate(entry.createdAt) : null;
}
