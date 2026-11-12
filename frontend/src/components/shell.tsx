"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Icons } from "@/components/icons";
import { EmptyState, Skeleton } from "@/components/ui";

type MenuItem = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  perm?: string;
  /** Tampil bila user memiliki salah satu permission ini. */
  anyPerm?: string[];
  /** Sembunyikan dari akun berperan EMPLOYEE (hanya melihat data sendiri). */
  hideForEmployee?: boolean;
  children?: MenuItem[];
};

const SECTIONS: Array<{
  title: string;
  items: MenuItem[];
}> = [
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
      {
        href: "/cuti",
        label: "Cuti",
        icon: Icons.calendar,
        perm: "leave.view",
        children: [
          {
            href: "/cuti/menunggu",
            label: "Menunggu Persetujuan",
            anyPerm: ["leave.verify", "leave.paraf", "leave.approve", "leave.register"],
          },
          { href: "/cuti/baru", label: "Pengajuan Baru", perm: "leave.create" },
        ],
      },
      { href: "/presensi", label: "Presensi", icon: Icons.clock, perm: "attendance.view" },
      {
        href: "/kgb",
        label: "KGB",
        icon: Icons.chart,
        perm: "kgb.view",
        children: [
          {
            href: "/kgb/menunggu",
            label: "Menunggu Persetujuan",
            anyPerm: ["kgb.verify", "kgb.paraf", "kgb.approve", "kgb.register"],
          },
          { href: "/kgb/baru", label: "Pengajuan Baru", perm: "kgb.create" },
          { href: "/kgb/monitoring", label: "Monitoring", perm: "kgb.view", hideForEmployee: true },
          { href: "/kgb/register-book", label: "Buku Register", perm: "kgb.view", hideForEmployee: true },
        ],
      },
      {
        href: "/pensiun",
        label: "Pensiun PNS",
        icon: Icons.pension,
        perm: "pension.view",
        children: [
          { href: "/pensiun/bup", label: "Daftar BUP", perm: "pension.view", hideForEmployee: true },
          { href: "/pensiun/register", label: "Buku Register", perm: "pension.view", hideForEmployee: true },
          { href: "/pensiun/nominatif", label: "Daftar Nominatif", perm: "pension.view", hideForEmployee: true },
          { href: "/pensiun/ekspedisi", label: "Buku Ekspedisi", perm: "pension.view", hideForEmployee: true },
        ],
      },
      {
        href: "/kenaikan-pangkat",
        label: "Kenaikan Pangkat",
        icon: Icons.chart,
        perm: "promotion.view",
        children: [
          { href: "/kenaikan-pangkat/calon", label: "Daftar Calon", perm: "promotion.view", hideForEmployee: true },
          { href: "/kenaikan-pangkat/register", label: "Buku Register", perm: "promotion.view", hideForEmployee: true },
          { href: "/kenaikan-pangkat/nominatif", label: "Daftar Nominatif", perm: "promotion.view", hideForEmployee: true },
          { href: "/kenaikan-pangkat/arsip", label: "Buku Arsip", perm: "promotion.view", hideForEmployee: true },
        ],
      },
    ],
  },
  {
    title: "Kedinasan",
    items: [
      {
        href: "/surat-masuk",
        label: "Surat Masuk",
        icon: Icons.inbox,
        perm: "letter.view",
        children: [
          { href: "/surat-masuk/baru", label: "Pencatatan Baru", perm: "letter.create" },
          { href: "/surat-masuk/agenda", label: "Buku Agenda", perm: "letter.view", hideForEmployee: true },
          { href: "/surat-masuk/ekspedisi", label: "Buku Ekspedisi", perm: "letter.view", hideForEmployee: true },
        ],
      },
      {
        href: "/surat-keluar",
        label: "Surat Keluar",
        icon: Icons.send,
        perm: "outgoing.view",
        children: [
          { href: "/surat-keluar/baru", label: "Buat / Booking Nomor", perm: "outgoing.view" },
          { href: "/surat-keluar/agenda", label: "Buku Agenda", perm: "outgoing.view" },
        ],
      },
    ],
  },
  {
    title: "Arsip",
    items: [
      {
        href: "/arsip",
        label: "Buku Arsip",
        icon: Icons.archive,
        perm: "archive.view",
        children: [
          { href: "/arsip/daftar", label: "Daftar Arsip", perm: "archive.view" },
        ],
      },
    ],
  },
  {
    title: "Administrasi",
    items: [
      {
        href: "/pengguna/plt",
        label: "Penugasan Plt",
        icon: Icons.check,
        perm: "user.manage",
      },
    ],
  },
];

/** Lebar sidebar desktop — dipakai juga untuk posisi flyout submenu. */
const SIDEBAR_WIDTH = 264;

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/cuti\/baru$/, "Pengajuan Cuti Baru"],
  [/^\/cuti\/menunggu$/, "Menunggu Persetujuan Cuti"],
  [/^\/cuti\/[^/]+\/pengajuan$/, "Surat Pengajuan Cuti"],
  [/^\/cuti\/[^/]+\/surat$/, "Surat Pengantar Cuti"],
  [/^\/cuti\/[^/]+\/edit$/, "Ubah Pengajuan Cuti"],
  [/^\/cuti\/.+$/, "Detail Pengajuan Cuti"],
  [/^\/cuti$/, "Pengajuan Cuti"],
  [/^\/presensi\/teguran/, "Surat Teguran"],
  [/^\/presensi$/, "Presensi Apel Pagi–Sore"],
  [/^\/pensiun\/bup$/, "Daftar BUP Pensiun"],
  [/^\/pensiun\/register$/, "Buku Register Pensiun"],
  [/^\/pensiun\/nominatif$/, "Daftar Nominatif Pensiun"],
  [/^\/pensiun\/ekspedisi$/, "Buku Ekspedisi Pensiun"],
  [/^\/pensiun\/[^/]+\/cetak\/nominatif$/, "Cetak Daftar Nominatif Pensiun"],
  [/^\/pensiun\/[^/]+\/cetak\/surat$/, "Cetak Surat Usulan Pensiun"],
  [/^\/pensiun\/[^/]+$/, "Detail Usulan Pensiun"],
  [/^\/pensiun$/, "Daftar Usulan Pensiun"],
  [/^\/kenaikan-pangkat\/calon$/, "Daftar Calon Kenaikan Pangkat"],
  [/^\/kenaikan-pangkat\/register$/, "Buku Register Kenaikan Pangkat"],
  [/^\/kenaikan-pangkat\/nominatif$/, "Daftar Nominatif Kenaikan Pangkat"],
  [/^\/kenaikan-pangkat\/arsip$/, "Buku Arsip Kenaikan Pangkat"],
  [/^\/kenaikan-pangkat\/[^/]+$/, "Detail Usulan Kenaikan Pangkat"],
  [/^\/kenaikan-pangkat$/, "Daftar Usulan Kenaikan Pangkat"],
  [/^\/surat-masuk\/agenda$/, "Buku Agenda Surat Masuk"],
  [/^\/surat-masuk\/ekspedisi$/, "Buku Ekspedisi"],
  [/^\/surat-masuk\/baru$/, "Pencatatan Surat Masuk"],
  [/^\/surat-masuk\/[^/]+\/agenda$/, "Atur Agenda Kegiatan"],
  [/^\/surat-masuk\/[^/]+\/lembar-disposisi$/, "Lembar Disposisi"],
  [/^\/surat-masuk/, "Surat Masuk & Disposisi"],
  [/^\/surat-keluar\/agenda$/, "Buku Agenda Surat Keluar"],
  [/^\/surat-keluar\/baru$/, "Surat Keluar Baru"],
  [/^\/surat-keluar/, "Surat Keluar & Penomoran"],
  [/^\/kgb\/baru$/, "Pengajuan KGB Baru"],
  [/^\/kgb\/menunggu$/, "Menunggu Persetujuan KGB"],
  [/^\/kgb\/monitoring$/, "Monitoring KGB"],
  [/^\/kgb\/register-book$/, "Buku Register KGB"],
  [/^\/kgb\/[^/]+\/surat$/, "Surat Pengantar KGB"],
  [/^\/kgb\/[^/]+\/edit$/, "Ubah Pengajuan KGB"],
  [/^\/kgb\/.+$/, "Detail Pengajuan KGB"],
  [/^\/kgb$/, "Kenaikan Gaji Berkala"],
  [/^\/arsip\/daftar$/, "Daftar Arsip"],
  [/^\/arsip$/, "Buku Arsip"],
  [/^\/notifikasi$/, "Notifikasi"],
  [/^\/pengguna\/plt$/, "Penugasan Plt"],
  [/^\/$/, "Dashboard"],
];

const SUBTITLES: Array<[RegExp, string]> = [
  [/^\/cuti\/menunggu$/, "Daftar tugas persetujuan cuti berdasarkan jabatan dan permission"],
  [/^\/cuti$/, "Kelola pengajuan cuti dan proses persetujuan pegawai"],
  [/^\/presensi$/, "Pencatatan apel, rekap sesi, dan pembinaan"],
  [/^\/surat-masuk$/, "Agenda, disposisi, distribusi, dan arsip"],
  [/^\/surat-keluar$/, "Penomoran naskah dinas dan reservasi nomor"],
  [/^\/kgb\/menunggu$/, "Daftar tugas persetujuan KGB berdasarkan jabatan dan permission"],
  [/^\/kgb$/, "Pengajuan kenaikan gaji berkala"],
  [/^\/pensiun$/, "Kelola usulan pensiun PNS"],
  [/^\/kenaikan-pangkat$/, "Kelola pengajuan kenaikan pangkat ASN"],
  [/^\/arsip$/, "Penyimpanan dan penelusuran arsip"],
  [/^\/notifikasi$/, "Disposisi dan informasi untuk Anda"],
  [/^\/pengguna\/plt$/, "Catat pejabat pelaksana tugas tanpa mengubah jabatan utama"],
  [/^\/$/, "Ruang kerja administrasi kecamatan"],
];

/** Deteksi perangkat yang benar-benar punya hover (mouse/trackpad).
 *  Di perangkat sentuh (iPad), hover tidak dipakai supaya tap tidak
 *  membuka lalu langsung menutup submenu. */
function useCanHover() {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return canHover;
}

/* ------------------------------------------------------------------ */
/* Baris menu desktop: satu baris (ikon + label + chevron)             */
/* ------------------------------------------------------------------ */

function SidebarRow({
  item,
  subItems,
  pathname,
  unread,
  flyoutOpen,
  hoverEnabled,
  onHover,
  onLeave,
  onToggle,
}: {
  item: MenuItem;
  subItems: MenuItem[];
  pathname: string;
  unread: number | null;
  flyoutOpen: boolean;
  hoverEnabled: boolean;
  onHover: (item: MenuItem, el: HTMLElement) => void;
  onLeave: () => void;
  onToggle: (item: MenuItem, el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Satu halaman anak tidak perlu submenu: halaman induk sudah mewakilinya.
  const hasChildren = subItems.length > 1;
  const active = pathname === item.href || (!hasChildren && subItems[0]?.href === pathname);
  const Icon = item.icon ?? Icons.file;

  return (
    <div
      ref={ref}
      className="px-2"
      onMouseEnter={() => {
        if (hoverEnabled && hasChildren && ref.current) onHover(item, ref.current);
      }}
      onMouseLeave={() => {
        if (hoverEnabled && hasChildren) onLeave();
      }}
    >
      <div
        className={`group flex h-9 items-center rounded-lg text-[13px] transition-colors ${
          active ? "bg-brand-900 font-semibold text-white" : "text-soft hover:bg-brand-50"
        }`}
      >
        <Link
          href={item.href}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-2.5 pr-1"
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-muted"}`} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.href === "/notifikasi" && unread ? (
            <span className="mr-1 shrink-0 rounded-md bg-bad-700 px-1.5 py-px text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        {hasChildren ? (
          <button
            type="button"
            aria-label={`Buka submenu ${item.label}`}
            aria-expanded={flyoutOpen}
            onClick={() => {
              if (ref.current) onToggle(item, ref.current);
            }}
            className={`mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              active ? "text-white/80 hover:bg-white/10" : "text-muted hover:bg-brand-100/60 hover:text-ink"
            }`}
          >
            <Icons.chevronRight
              className={`h-4 w-4 transition-transform ${flyoutOpen ? "rotate-90" : ""}`}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Baris menu drawer (mobile/tablet): accordion                        */
/* ------------------------------------------------------------------ */

function DrawerRow({
  item,
  subItems,
  pathname,
  unread,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: MenuItem;
  subItems: MenuItem[];
  pathname: string;
  unread: number | null;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const active = pathname === item.href || (subItems.length === 1 && subItems[0]?.href === pathname);
  const hasChildren = subItems.length > 1;
  const Icon = item.icon ?? Icons.file;

  return (
    <div>
      <div
        className={`flex items-stretch rounded-lg text-[13px] transition-colors ${
          active ? "bg-brand-900 font-semibold text-white" : "text-soft"
        }`}
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-2.5 pr-1 ${
            active ? "" : "hover:bg-brand-50"
          }`}
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-muted"}`} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.href === "/notifikasi" && unread ? (
            <span className="mr-1 shrink-0 rounded-md bg-bad-700 px-1.5 py-px text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? "Tutup" : "Buka"} submenu ${item.label}`}
            aria-expanded={expanded}
            onClick={onToggle}
            className={`flex w-10 shrink-0 items-center justify-center rounded-r-lg ${
              active ? "text-white/80 hover:bg-white/10" : "text-muted hover:bg-brand-50 hover:text-ink"
            }`}
          >
            <Icons.chevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
          {subItems.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={`flex h-9 items-center rounded-lg px-2.5 text-[13px] transition-colors ${
                  childActive
                    ? "bg-brand-900 font-semibold text-white"
                    : "text-muted hover:bg-brand-50 hover:text-ink"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function BrandMark() {
  const [logoOk, setLogoOk] = useState(true);
  return logoOk ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-kota-makassar.png"
      alt="Logo Pemerintah Kota Makassar"
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-lg bg-surface object-contain ring-1 ring-white/20"
      onError={() => setLogoOk(false)}
    />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-[10px] font-semibold text-chrome-ink ring-1 ring-white/20">
      KT
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, hasPermission } = useAuth();

  const [unread, setUnread] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [flyout, setFlyout] = useState<{ href: string; top: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const hoverOpened = useRef<{ href: string; at: number } | null>(null);
  const canHover = useCanHover();

  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "SIMPEG";
  const subtitle = SUBTITLES.find(([re]) => re.test(pathname))?.[1] ?? "";
  const displayName = user?.employee?.name ?? user?.username ?? "—";
  const roleLine = `${user?.role ?? ""}${user?.position ? ` • ${user.position}` : ""}`;

  /* ---- izin tampil menu ---- */
  const canSee = useCallback(
    (it: MenuItem) => {
      // Saat auth masih memuat, hanya menu publik (tanpa permission) yang dirender
      // supaya menu yang tidak berhak tidak sempat berkedip muncul.
      if (loading) return !it.perm && !it.anyPerm;
      if (it.perm && !hasPermission(it.perm)) return false;
      if (it.anyPerm && !it.anyPerm.some((p) => hasPermission(p))) return false;
      if (it.hideForEmployee && user?.role === "EMPLOYEE") return false;
      return true;
    },
    [loading, hasPermission, user?.role],
  );

  const childrenOf = useCallback(
    (item: MenuItem) => (item.children ?? []).filter(canSee),
    [canSee],
  );

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({ title: s.title, items: s.items.filter(canSee) })).filter(
        (s) => s.items.length > 0,
      ),
    [canSee],
  );

  /* ---- unread badge: polling ringan, fokus, dan event setelah aksi workflow ---- */
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      apiFetch<{ unread?: number; count?: number } | number>("/notifications/unread-count")
        .then(({ data }) => {
          if (!alive) return;
          const n = typeof data === "number" ? data : (data?.unread ?? data?.count ?? null);
          setUnread(n);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("notifications:refresh", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("notifications:refresh", refresh);
    };
  }, [pathname]);

  /* ---- tutup drawer & flyout setiap pindah halaman ---- */
  useEffect(() => {
    setDrawerOpen(false);
    setFlyout(null);
  }, [pathname]);

  /* ---- auto-buka accordion grup yang berisi halaman aktif ---- */
  useEffect(() => {
    const group = SECTIONS.flatMap((s) => s.items).find(
      (it) => childrenOf(it).length > 1 && it.children?.some((c) => c.href === pathname),
    );
    if (group) {
      setOpenGroups((prev) => {
        if (prev.has(group.href)) return prev;
        const next = new Set(prev);
        next.add(group.href);
        return next;
      });
    }
  }, [pathname, childrenOf]);

  /* ---- kunci scroll body saat drawer terbuka ---- */
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  /* ---- Escape menutup lapisan ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFlyout(null);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- flyout submenu desktop ---- */
  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setFlyout(null);
      hoverOpened.current = null;
    }, 180);
  }, [cancelClose]);

  const openFlyout = useCallback(
    (item: MenuItem, el: HTMLElement) => {
      const kids = childrenOf(item);
      if (kids.length <= 1) return;
      cancelClose();
      hoverOpened.current = { href: item.href, at: Date.now() };
      const rect = el.getBoundingClientRect();
      const approxHeight = kids.length * 36 + 44;
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - approxHeight - 8));
      setFlyout({ href: item.href, top });
    },
    [childrenOf, cancelClose],
  );

  const toggleFlyout = useCallback(
    (item: MenuItem, el: HTMLElement) => {
      // Di perangkat hybrid (layar sentuh + mouse), tap memicu mouseenter
      // lalu click. Jangan tutup flyout yang baru saja dibuka oleh hover.
      const recent = hoverOpened.current;
      if (recent && recent.href === item.href && Date.now() - recent.at < 600) return;

      setFlyout((cur) => {
        if (cur?.href === item.href) return null;
        const kids = childrenOf(item);
        if (kids.length <= 1) return null;
        const rect = el.getBoundingClientRect();
        const approxHeight = kids.length * 36 + 44;
        return {
          href: item.href,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - approxHeight - 8)),
        };
      });
    },
    [childrenOf],
  );

  useEffect(() => () => cancelClose(), [cancelClose]);

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const flyoutGroup = flyout
    ? sections.flatMap((s) => s.items).find((it) => it.href === flyout.href) ?? null
    : null;
  const flyoutChildren = flyoutGroup ? childrenOf(flyoutGroup) : [];

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell flex h-dvh overflow-hidden bg-canvas text-ink">
      {/* ---------------- Sidebar desktop ---------------- */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-chrome-line bg-chrome px-4">
          <BrandMark />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-wide text-chrome-ink">SIMPEG Tamalate</p>
            <p className="mt-0.5 truncate text-[11px] text-chrome-muted">Kecamatan Tamalate</p>
          </div>
        </div>

        <nav aria-label="Menu utama" className="min-h-0 flex-1 overflow-y-auto py-2">
          {sections.map((sec) => (
            <div key={sec.title} className="mb-1">
              <p className="px-4 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {sec.title}
              </p>
              <div className="space-y-0.5">
                {sec.items.map((item) => (
                  <SidebarRow
                    key={item.href}
                    item={item}
                    subItems={childrenOf(item)}
                    pathname={pathname}
                    unread={unread}
                    flyoutOpen={flyout?.href === item.href}
                    hoverEnabled={canHover}
                    onHover={openFlyout}
                    onLeave={scheduleClose}
                    onToggle={toggleFlyout}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[11px] font-semibold text-white">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-ink">{displayName}</p>
              <p className="truncate text-[11px] text-muted">{roleLine || "—"}</p>
            </div>
          </div>
          <button
            onClick={() => void doLogout()}
            className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-muted transition-colors hover:bg-bad-100/50 hover:text-bad-700"
          >
            <Icons.logout className="h-4 w-4 shrink-0" /> Keluar
          </button>
        </div>
      </aside>

      {/* ---------------- Flyout submenu desktop ---------------- */}
      {flyout && flyoutGroup && flyoutChildren.length > 1 ? (
        <div
          role="menu"
          aria-label={`Submenu ${flyoutGroup.label}`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{ top: flyout.top, left: SIDEBAR_WIDTH - 4 }}
          className="fixed z-[90] hidden w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl lg:block"
        >
          <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {flyoutGroup.label}
          </p>
          {flyoutChildren.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                role="menuitem"
                className={`flex h-9 items-center rounded-lg px-2.5 text-[13px] transition-colors ${
                  childActive
                    ? "bg-brand-900 font-semibold text-white"
                    : "text-soft hover:bg-brand-50 hover:text-brand-800"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* ---------------- Drawer mobile & tablet ---------------- */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
          className={`absolute inset-y-0 left-0 flex w-[280px] max-w-[86vw] flex-col border-r border-line bg-surface shadow-2xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-chrome-line bg-chrome px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold tracking-wide text-chrome-ink">SIMPEG Tamalate</p>
                <p className="mt-0.5 truncate text-[11px] text-chrome-muted">Kecamatan Tamalate</p>
              </div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup menu"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-chrome-muted hover:bg-white/10 hover:text-chrome-ink"
            >
              <Icons.close className="h-5 w-5" />
            </button>
          </div>

          <nav aria-label="Menu utama" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {sections.map((sec) => (
              <div key={sec.title} className="mb-1">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {sec.title}
                </p>
                <div className="space-y-0.5">
                  {sec.items.map((item) => (
                    <DrawerRow
                      key={item.href}
                      item={item}
                      subItems={childrenOf(item)}
                      pathname={pathname}
                      unread={unread}
                      expanded={openGroups.has(item.href)}
                      onToggle={() => toggleGroup(item.href)}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-line p-3">
            <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[11px] font-semibold text-white">
                {initials(displayName)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold text-ink">{displayName}</p>
                <p className="truncate text-[11px] text-muted">{roleLine || "—"}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setDrawerOpen(false);
                void doLogout();
              }}
              className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-muted transition-colors hover:bg-bad-100/50 hover:text-bad-700"
            >
              <Icons.logout className="h-4 w-4 shrink-0" /> Keluar
            </button>
          </div>
        </aside>
      </div>

      {/* ---------------- Kolom konten ---------------- */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 shrink-0 border-b border-chrome-line bg-chrome">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-chrome-muted transition-colors hover:bg-white/10 hover:text-chrome-ink lg:hidden"
            >
              <Icons.menu className="h-5 w-5" />
            </button>

            <div className="shrink-0 lg:hidden">
              <BrandMark />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-chrome-ink sm:text-[15px]">{title}</h1>
              {subtitle ? (
                <p className="hidden truncate text-[11px] text-chrome-muted sm:block">{subtitle}</p>
              ) : null}
            </div>

            <Link
              href="/notifikasi"
              aria-label="Notifikasi"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-chrome-ink transition-colors hover:bg-white/15"
            >
              <Icons.bell className="h-[18px] w-[18px]" />
              {unread ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-brand-950">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>

            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/20 bg-white/10 py-1 pl-1 pr-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 text-[10px] font-semibold text-chrome-ink">
                {initials(displayName)}
              </span>
              <span className="hidden max-w-[120px] truncate text-xs font-medium text-chrome-ink sm:inline">
                {displayName.split(" ")[0]}
              </span>
            </div>
          </div>
        </header>

        <main className="app-main min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Halaman yang boleh dibuka semua user login; keamanan data tetap di backend. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}

/** Gate halaman per permission: sembunyikan dari nav (di AppShell) + cegah akses langsung.
 *  Keamanan final tetap di backend (403). */
export function RequirePerm({
  perm,
  label,
  children,
  denyForEmployee = false,
}: {
  perm: string;
  label: string;
  children: React.ReactNode;
  /** Halaman buku/petugas yang backend-nya menolak akun EMPLOYEE. */
  denyForEmployee?: boolean;
}) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }
  if (!hasPermission(perm) || (denyForEmployee && user?.role === "EMPLOYEE")) {
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
