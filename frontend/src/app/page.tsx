"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { AttendanceToday } from "@/lib/types";
import { Skeleton, StatusBadge, STATUS_LABEL } from "@/components/ui";

async function countOf(path: string): Promise<number | null> {
  try {
    const { meta } = await apiFetch<unknown>(`${path}${path.includes("?") ? "&" : "?"}limit=1`);
    const total = (meta as { total?: number } | null)?.total;
    return typeof total === "number" ? total : null;
  } catch {
    return null;
  }
}

interface FeedItem {
  href: string;
  title: string;
  meta: string;
}

async function latest(path: string, pick: (row: never) => FeedItem | null): Promise<FeedItem[]> {
  try {
    const { data } = await apiFetch<never[]>(`${path}${path.includes("?") ? "&" : "?"}limit=5`);
    if (!Array.isArray(data)) return [];
    return data.map(pick).filter((x): x is FeedItem => x !== null).slice(0, 5);
  } catch {
    return [];
  }
}

interface Metric {
  value: string;
  label: string;
  sub: string;
  dot: string;
  href: string;
}

const DOT: Record<string, string> = {
  amber: "bg-warn-700",
  green: "bg-ok-700",
  red: "bg-bad-700",
  blue: "bg-info-700",
  gray: "bg-muted",
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [heading, setHeading] = useState("Yang perlu Anda tindak lanjuti.");

  useEffect(() => {
    let alive = true;
    (async () => {
      const role = user?.role;
      const position = user?.position ?? "";

      const get = async (p: string) => countOf(p);
      const unread = async () => {
        try {
          const { data } = await apiFetch<{ unread?: number; count?: number } | number>("/notifications/unread-count");
          const n = typeof data === "number" ? data : (data?.unread ?? data?.count ?? null);
          return n === null ? "—" : String(n);
        } catch {
          return "—";
        }
      };
      const problematic = async () => {
        try {
          const monday = (() => {
            const n = new Date(Date.now() + 8 * 3600 * 1000);
            const diff = (n.getUTCDay() + 6) % 7;
            return new Date(n.getTime() - diff * 86400000).toISOString().slice(0, 10);
          })();
          const { data } = await apiFetch<unknown[]>(`/attendances/problematic?weekStart=${monday}`);
          return Array.isArray(data) ? String(data.length) : "—";
        } catch {
          return "—";
        }
      };
      const num = (n: number | null) => (n === null ? "—" : String(n));
      const M = (value: string, label: string, sub: string, dot: string, href: string): Metric =>
        ({ value, label, sub, dot, href });

      if (role === "EMPLOYEE") {
        // Pegawai: hanya miliknya sendiri. Tanpa angka orang lain, tanpa pegawai bermasalah.
        setHeading("Pekerjaan Anda hari ini.");
        const [cuti, kgb, surat, notif, today] = await Promise.all([
          get("/leave-requests?status=SUBMITTED"),
          get("/kgb-requests?status=SUBMITTED"),
          get("/letters"),
          unread(),
          apiFetch<AttendanceToday>("/attendances/today").then((r) => r.data).catch(() => null),
        ]);
        if (!alive) return;
        const rec = today?.record;
        setMetrics([
          M(rec ? (STATUS_LABEL[rec.status] ?? rec.status) : "Belum", "Presensi", rec ? `Masuk ${rec.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}` : `Batas ${today?.deadline ?? "08:00"}`, rec && (rec.status === "HADIR" || rec.status === "TERLAMBAT") ? "green" : "amber", "/presensi"),
          M(num(cuti), "Cuti saya", "menunggu diproses", "amber", "/cuti"),
          M(num(kgb), "KGB saya", "menunggu diproses", "amber", "/kgb"),
          M(num(surat), "Surat untuk saya", "melibatkan Anda", "blue", "/surat-masuk"),
          M(notif, "Notifikasi", "belum dibaca", "blue", "/notifikasi"),
        ]);
      } else if (role === "VERIFIER") {
        setHeading("Operasional hari ini.");
        const [reg, bkpsdm, surat, notif] = await Promise.all([
          get("/leave-requests?status=SIGNED"),
          get("/leave-requests?status=REGISTERED"),
          get("/letters?status=RECEIVED"),
          unread(),
        ]);
        if (!alive) return;
        setMetrics([
          M(num(reg), "Cuti", "siap registrasi", "amber", "/cuti?status=SIGNED"),
          M(num(bkpsdm), "Cuti", "menunggu ke BKPSDM", "amber", "/cuti?status=REGISTERED"),
          M(num(surat), "Surat baru", "belum dicatat", "amber", "/surat-masuk?status=RECEIVED"),
          M(notif, "Notifikasi", "belum dibaca", "blue", "/notifikasi"),
        ]);
      } else if (role === "SUPERVISOR") {
        setHeading("Menunggu pertimbangan Anda.");
        const [cuti, notif] = await Promise.all([
          get("/leave-requests?status=SUBMITTED"),
          unread(),
        ]);
        if (!alive) return;
        setMetrics([
          M(num(cuti), "Cuti", "menunggu pertimbangan", "amber", "/cuti?status=SUBMITTED"),
          M(notif, "Notifikasi", "belum dibaca", "blue", "/notifikasi"),
        ]);
      } else if (role === "LEADER") {
        // Pimpinan: antrean keputusan. Sekcam = paraf, Camat = disposisi/keputusan.
        const isSekcam = position === "SEKCAM";
        setHeading(isSekcam ? "Menunggu paraf dan pemeriksaan Anda." : "Menunggu keputusan Anda.");
        const [cuti, kgb, suratA, suratB, notif, prob] = await Promise.all([
          get(isSekcam ? "/leave-requests?status=VERIFIED" : "/leave-requests?status=PARAF"),
          get(isSekcam ? "/kgb-requests?status=VERIFIED" : "/kgb-requests?status=PARAF"),
          get(isSekcam ? "/letters?status=RECEIVED" : "/letters?status=PARAF"),
          isSekcam ? Promise.resolve(null) : get("/letters?status=DISPOSED"),
          unread(),
          problematic(),
        ]);
        if (!alive) return;
        const list: Metric[] = [
          M(num(cuti), "Cuti", isSekcam ? "menunggu paraf" : "menunggu keputusan", "amber", "/cuti"),
          M(num(kgb), "KGB", isSekcam ? "menunggu paraf" : "menunggu keputusan", "amber", "/kgb"),
          M(num(suratA), "Surat", isSekcam ? "menunggu paraf" : "menunggu disposisi", "amber", "/surat-masuk"),
        ];
        if (!isSekcam) list.push(M(num(suratB), "Surat", "dalam tindak lanjut", "blue", "/surat-masuk?status=DISPOSED"));
        list.push(M(prob, "Bermasalah", "pegawai pekan ini", "red", "/presensi"));
        list.push(M(notif, "Notifikasi", "belum dibaca", "blue", "/notifikasi"));
        setMetrics(list);
      } else {
        // SUPER_ADMIN: gambaran sistem.
        setHeading("Gambaran sistem hari ini.");
        const [cuti, surat, users, notif, prob] = await Promise.all([
          get("/leave-requests?status=SUBMITTED"),
          get("/letters?status=RECEIVED"),
          get("/users?limit=1"),
          unread(),
          problematic(),
        ]);
        if (!alive) return;
        setMetrics([
          M(num(cuti), "Cuti", "menunggu pemeriksaan", "amber", "/cuti?status=SUBMITTED"),
          M(num(surat), "Surat baru", "belum didisposisikan", "amber", "/surat-masuk?status=RECEIVED"),
          M(num(users), "Pengguna", "terdaftar", "gray", "/notifikasi"),
          M(prob, "Bermasalah", "pegawai pekan ini", "red", "/presensi"),
          M(notif, "Notifikasi", "belum dibaca", "blue", "/notifikasi"),
        ]);
      }

      const [feedCuti, feedSurat] = await Promise.all([
        latest("/leave-requests", (r: never) => {
          const x = r as { id: string; requestNumber: string; status: string; employee?: { name: string } };
          return x?.id ? { href: `/cuti/${x.id}`, title: `${x.requestNumber} — ${x.employee?.name ?? ""}`, meta: STATUS_LABEL[x.status] ?? x.status } : null;
        }),
        latest("/letters", (r: never) => {
          const x = r as { id: string; agendaNumber: string; subject: string };
          return x?.id ? { href: `/surat-masuk/${x.id}`, title: `${x.agendaNumber} — ${x.subject}`, meta: "" } : null;
        }),
      ]);
      if (!alive) return;
      setFeed([...feedCuti, ...feedSurat].slice(0, 8));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.position]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = (user?.employee?.name ?? user?.username ?? "").split(" ")[0] || "—";

  return (
    <AppShell>
      <p className="text-sm text-secondary">{dateStr}</p>
      <h1 className="mt-1 text-[26px]">Selamat pagi, {loading ? "…" : firstName}.</h1>
      <p className="mt-1 text-sm text-secondary">{heading}</p>

      <section className="mt-6 rounded-lg border border-line bg-surface px-5 py-4">
        <h2 className="text-xs font-semibold tracking-wider text-secondary">RINGKASAN</h2>
        {metrics.length === 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
            {metrics.map((m) => (
              <Link key={m.label + m.sub} href={m.href} className="border-l-2 border-line pl-4">
                <p className="text-[30px] font-semibold tabular-nums leading-none text-ink">{m.value}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[m.dot]}`} />
                  {m.label}
                </p>
                <p className="text-xs text-secondary">{m.sub}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface px-5 py-4">
          <h2 className="text-xs font-semibold tracking-wider text-secondary">PERLU PERHATIAN</h2>
          <div className="mt-1 divide-y divide-line">
            {metrics.map((m) => (
              <Link key={m.label + m.sub} href={m.href} className="flex min-h-10 items-center gap-3 py-2">
                <span className="w-12 shrink-0 truncate text-right text-base font-semibold tabular-nums">{m.value}</span>
                <span className="text-sm">{m.label} — {m.sub}</span>
                <span className="ml-auto text-muted">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface px-5 py-4">
          <h2 className="text-xs font-semibold tracking-wider text-secondary">AKTIVITAS TERBARU</h2>
          {feed.length === 0 ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="mt-1 divide-y divide-line">
              {feed.map((f) => (
                <Link key={f.href} href={f.href} className="block py-2.5 text-sm">
                  <span className="block truncate font-medium">{f.title}</span>
                  {f.meta ? <span className="text-xs text-secondary">{f.meta}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
