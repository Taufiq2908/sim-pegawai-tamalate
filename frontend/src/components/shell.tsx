"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Icons } from "@/components/icons";
import { EmptyState, Skeleton } from "@/components/ui";

const SECTIONS = [
  {
    title: "Utama",
    items: [
      { href: "/", label: "Dashboard", icon: Icons.grid, perm: "" },
      { href: "/notifikasi", label: "Notifikasi", icon: Icons.bell, perm: "" },
    ],
  },
  {
    title: "Kepegawaian",
    items: [
      { href: "/cuti", label: "Cuti", icon: Icons.calendar, perm: "leave.view" },
      { href: "/presensi", label: "Presensi", icon: Icons.clock, perm: "attendance.view" },
      { href: "/kgb", label: "KGB", icon: Icons.chart, perm: "kgb.view" },
    ],
  },
  {
    title: "Kedinasan",
    items: [
      { href: "/surat-masuk", label: "Surat Masuk", icon: Icons.inbox, perm: "letter.view" },
      { href: "/surat-keluar", label: "Surat Keluar", icon: Icons.send, perm: "outgoing.view" },
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

const SUBTITLES: Array<[RegExp, string]> = [
  [/^\/cuti$/, "Kelola pengajuan cuti dan proses persetujuan pegawai"],
  [/^\/presensi$/, "Pencatatan apel, rekap sesi, dan pembinaan"],
  [/^\/surat-masuk$/, "Agenda, disposisi, distribusi, dan arsip"],
  [/^\/surat-keluar$/, "Penomoran naskah dinas dan reservasi nomor"],
  [/^\/kgb$/, "Pengajuan kenaikan gaji berkala"],
  [/^\/notifikasi$/, "Disposisi dan informasi untuk Anda"],
  [/^\/$/, "Ruang kerja administrasi kecamatan"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, hasPermission } = useAuth();
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
  const subtitle = SUBTITLES.find(([re]) => re.test(pathname))?.[1] ?? "";
  const displayName = user?.employee?.name ?? user?.username ?? "—";
  const roleLine = `${user?.role ?? ""}${user?.position ? ` • ${user.position}` : ""}`;
  const visible = (items: typeof SECTIONS[number]["items"]) =>
    loading ? items : items.filter((it) => !it.perm || hasPermission(it.perm));

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-5 pb-4 pt-6">
          <p className="text-sm font-semibold tracking-wide text-ink">SIMPEG Tamalate</p>
          <p className="mt-0.5 text-xs text-muted">Kecamatan Tamalate</p>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {SECTIONS.map((sec) => {
            const items = visible(sec.items);
            if (items.length === 0) return null;
            return (
              <div key={sec.title}>
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted">{sec.title.toUpperCase()}</p>
                <div className="space-y-px">
                  {items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                          active
                            ? "bg-brand-900 font-semibold text-white"
                            : "text-soft hover:bg-[#e4e9e6] hover:text-ink"
                        }`}
                      >
                        <span className={active ? "text-white" : "text-slate-500"}>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        {item.label}
                        {item.href === "/notifikasi" && unread ? (
                          <span className="ml-auto rounded-md bg-bad-700 px-1.5 py-px text-[11px] font-semibold text-white">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
              <p className="truncate text-xs text-muted">{roleLine || "—"}</p>
            </div>
          </div>
          <button
            onClick={() => void doLogout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-paper hover:text-ink"
          >
            <Icons.logout className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <div className="min-w-0 flex-1 lg:hidden">
              <h1 className="truncate text-base">{title}</h1>
              {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
            </div>
            <div className="hidden lg:block">
              <h1>{title}</h1>
              {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/notifikasi"
                aria-label="Notifikasi"
                className="relative rounded-lg border border-line bg-surface p-2 text-muted hover:text-ink"
              >
                <Icons.bell className="h-5 w-5" />
                {unread ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad-700 px-1 text-[11px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
              <span className="hidden items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2.5 text-sm sm:flex">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-900 text-[11px] font-semibold text-white">
                  {initials(displayName)}
                </span>
                {displayName.split(" ")[0]}
              </span>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {visible(SECTIONS.flatMap((s) => s.items)).map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    active ? "border-brand-900 bg-brand-900 text-white" : "border-line bg-surface text-secondary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 px-4 pb-3 lg:hidden">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted">{roleLine}</p>
            </div>
            <button
              onClick={() => void doLogout()}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted"
            >
              <Icons.logout className="h-4 w-4" /> Keluar
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Gate halaman per permission: sembunyikan dari nav (di AppShell) + cegah akses langsung.
 *  Keamanan final tetap di backend (403). */
export function RequirePerm({
  perm,
  label,
  children,
}: {
  perm: string;
  label: string;
  children: React.ReactNode;
}) {
  const { loading, hasPermission } = useAuth();
  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }
  if (!hasPermission(perm)) {
    return (
      <AppShell>
        <EmptyState
          title={`Anda tidak memiliki akses ke ${label}`}
          hint="Hubungi Kasubag Umum & Kepegawaian bila Anda seharusnya bisa membuka halaman ini."
        />
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}
