"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { AttendanceRecord, AttendanceToday } from "@/lib/types";
import { Icons } from "@/components/icons";
import { Skeleton, StatusBadge } from "@/components/ui";

async function countOf(path: string): Promise<number | null> {
  try {
    const { meta } = await apiFetch<unknown>(`${path}${path.includes("?") ? "&" : "?"}limit=1`);
    const total = (meta as { total?: number } | null)?.total;
    return typeof total === "number" ? total : null;
  } catch {
    return null;
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [cutiCount, setCutiCount] = useState<number | null>(null);
  const [suratCount, setSuratCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, n, c, s] = await Promise.all([
        apiFetch<AttendanceToday>("/attendances/today").catch(() => null),
        apiFetch<{ unread?: number; count?: number } | number>("/notifications/unread-count").catch(() => null),
        countOf("/leave-requests?status=SUBMITTED"),
        countOf("/letters?status=RECEIVED"),
      ]);
      if (!alive) return;
      setToday(t?.data ?? null);
      const nd = n?.data;
      setUnread(typeof nd === "number" ? nd : (nd?.unread ?? nd?.count ?? null));
      setCutiCount(c);
      setSuratCount(s);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const rec: AttendanceRecord | null = today?.record ?? null;
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const stats = [
    {
      label: "Presensi hari ini",
      value: rec ? rec.status : today ? "Belum" : "—",
      hint: rec ? `Masuk ${fmtTime(rec.checkInAt)} • Pulang ${fmtTime(rec.checkOutAt)}` : `Batas apel ${today?.deadline ?? "08:00"} WITA`,
      href: "/presensi",
      badge: rec ? <StatusBadge status={rec.status} /> : null,
    },
    { label: "Cuti menunggu verifikasi", value: cutiCount ?? "—", hint: "Pengajuan berstatus SUBMITTED", href: "/cuti", badge: null },
    { label: "Surat masuk baru", value: suratCount ?? "—", hint: "Berstatus RECEIVED", href: "/surat-masuk", badge: null },
    { label: "Notifikasi belum dibaca", value: unread ?? "—", hint: "Disposisi & info terbaru", href: "/notifikasi", badge: null },
  ];

  const menu = [
    { href: "/cuti", title: "Cuti", desc: "Ajukan & proses persetujuan berjenjang", icon: Icons.calendar, tint: "bg-emerald-50 text-emerald-700" },
    { href: "/presensi", title: "Presensi Apel", desc: "Pagi–sore, rekap sesi & teguran", icon: Icons.clock, tint: "bg-amber-50 text-amber-700" },
    { href: "/surat-masuk", title: "Surat Masuk", desc: "Agenda, disposisi & ekspedisi", icon: Icons.inbox, tint: "bg-sky-50 text-sky-700" },
    { href: "/surat-keluar", title: "Surat Keluar", desc: "Penomoran & reservasi nomor", icon: Icons.send, tint: "bg-violet-50 text-violet-700" },
    { href: "/kgb", title: "KGB", desc: "Kenaikan gaji berkala", icon: Icons.chart, tint: "bg-teal-50 text-teal-700" },
    { href: "/notifikasi", title: "Notifikasi", desc: "Disposisi & pengumuman untuk Anda", icon: Icons.bell, tint: "bg-rose-50 text-rose-700" },
  ];

  return (
    <AppShell>
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-brand-950 via-brand-900 to-brand-700 p-6 text-white shadow-xl shadow-brand-900/10 sm:p-7">
        <p className="text-xs font-bold tracking-widest text-brand-200/70">{dateStr.toUpperCase()}</p>
        <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">
          {loading ? "Memuat…" : `Selamat datang, ${(user?.employee?.name ?? user?.username ?? "").split(" ")[0]}`}
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          {user?.position ? `${user.position} • ` : ""}{user?.employee?.name ?? user?.username ?? ""} — {user?.role ?? ""}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
              {s.badge}
            </div>
            <p className="mt-1 text-xs font-bold text-slate-700">{s.label}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{s.hint}</p>
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {menu.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href} className="group flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${m.tint}`}>
                  <Icon />
                </span>
                <span>
                  <span className="block font-extrabold text-slate-900 group-hover:text-brand-700">{m.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">{m.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
