"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Icons } from "@/components/icons";

const SECTIONS = [
  {
    title: "Menu Utama",
    items: [
      { href: "/", label: "Dashboard", icon: Icons.grid },
      { href: "/cuti", label: "Cuti", icon: Icons.calendar },
      { href: "/presensi", label: "Presensi Apel", icon: Icons.clock },
      { href: "/notifikasi", label: "Notifikasi", icon: Icons.bell },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/surat-masuk", label: "Surat Masuk", icon: Icons.inbox },
      { href: "/surat-keluar", label: "Surat Keluar", icon: Icons.send },
      { href: "/kgb", label: "KGB", icon: Icons.chart },
    ],
  },
];

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/cuti\/baru$/, "Pengajuan Cuti Baru"],
  [/^\/cuti\/.+$/, "Detail Pengajuan Cuti"],
  [/^\/cuti$/, "Pengajuan Cuti"],
  [/^\/presensi\/teguran/, "Surat Teguran"],
  [/^\/presensi$/, "Presensi Apel Pagi–Sore"],
  [/^\/surat-masuk\/agenda$/, "Buku Agenda Surat Masuk"],
  [/^\/surat-masuk\/ekspedisi$/, "Buku Ekspedisi"],
  [/^\/surat-masuk\/baru$/, "Pencatatan Surat Masuk"],
  [/^\/surat-masuk/, "Surat Masuk & Disposisi"],
  [/^\/surat-keluar\/agenda$/, "Buku Agenda Surat Keluar"],
  [/^\/surat-keluar\/baru$/, "Surat Keluar Baru"],
  [/^\/surat-keluar/, "Surat Keluar & Penomoran"],
  [/^\/kgb\/baru$/, "Pengajuan KGB Baru"],
  [/^\/kgb\/.+$/, "Detail Pengajuan KGB"],
  [/^\/kgb$/, "Kenaikan Gaji Berkala"],
  [/^\/notifikasi$/, "Notifikasi"],
  [/^\/$/, "Dashboard"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<{ unread?: number; count?: number } | number>("/notifications/unread-count")
      .then(({ data }) => {
        if (!alive) return;
        const n = typeof data === "number" ? data : (data?.unread ?? data?.count ?? null);
        setUnread(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "SIMPEG";
  const displayName = user?.employee?.name ?? user?.username ?? "—";

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-68 shrink-0 flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-[#0c2b33] text-slate-200 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-lg font-extrabold text-white shadow-lg shadow-black/30">
            T
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-wide text-white">SIMPEG TAMALATE</p>
            <p className="text-[11px] tracking-wider text-brand-200/70">KECAMATAN TAMALATE</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-widest text-brand-200/50">{sec.title.toUpperCase()}</p>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? "bg-white/10 text-white shadow-inner"
                          : "text-slate-300/90 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-gold-400" : "text-slate-400 group-hover:text-slate-200"}>
                        <Icon />
                      </span>
                      {item.label}
                      {item.href === "/notifikasi" && unread ? (
                        <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-amber-600 text-sm font-extrabold text-brand-950">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{displayName}</p>
              <p className="truncate text-[11px] text-slate-400">
                {user?.role}
                {user?.position ? ` • ${user.position}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <Icons.logout className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-sm font-extrabold text-white">T</div>
              <p className="text-sm font-extrabold">SIMPEG</p>
            </div>
            <div className="hidden lg:block">
              <h1 className="text-base font-extrabold text-slate-900">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/notifikasi"
                aria-label="Notifikasi"
                className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <Icons.bell className="h-5 w-5" />
                {unread ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
              <span className="hidden items-center gap-2 rounded-xl bg-slate-900 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-white sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-extrabold">
                  {initials(displayName)}
                </span>
                {displayName.split(" ")[0]}
              </span>
            </div>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
            {SECTIONS.flatMap((s) => s.items).map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand-900 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
        <footer className="px-4 pb-6 text-center text-xs text-slate-400 lg:px-8">
          SIMPEG Kecamatan Tamalate • Presensi • Persuratan • Kepegawaian
        </footer>
      </div>
    </div>
  );
}
