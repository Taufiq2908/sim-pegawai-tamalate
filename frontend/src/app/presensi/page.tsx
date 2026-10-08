"use client";
import { toast } from "@/components/toast";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type {
  AttendanceRecord,
  AttendanceReportRow,
  AttendanceStatus,
  AttendanceSummaryItem,
  AttendanceToday,
  PageMeta,
  ProblematicItem,
  SessionPhoto,
} from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

function todayWita(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function mondayOfWeekWita(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  const diff = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - diff * 86400000).toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  return new Date(new Date(ymd + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

type Sesi = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ABSEN" | "-";

function sesiPagi(rec: AttendanceRecord | undefined, date: string, today: string): Sesi {
  if (!rec) return date < today ? "ABSEN" : "-";
  if (rec.checkInAt) return rec.status as Sesi;
  if (rec.status === "IZIN" || rec.status === "SAKIT") return rec.status;
  return "ABSEN";
}

function sesiSore(rec: AttendanceRecord | undefined, date: string, today: string): Sesi {
  if (!rec) return date < today ? "ABSEN" : "-";
  if (rec.checkOutAt) return "HADIR";
  if (rec.status === "IZIN" || rec.status === "SAKIT") return rec.status;
  if (!rec.checkInAt) return "ABSEN";
  return date < today ? "ABSEN" : "-";
}

const SESI_STYLE: Record<Sesi, string> = {
  HADIR: "bg-ok-100 text-ok-700",
  TERLAMBAT: "bg-warn-100 text-warn-700",
  IZIN: "bg-info-100 text-info-700",
  SAKIT: "bg-info-100 text-info-700",
  ABSEN: "bg-bad-100 text-bad-700",
  "-": "bg-paper text-slate-400",
};

function SesiCell({ v, short }: { v: Sesi; short?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${SESI_STYLE[v]}`}>
      {short ? (v === "HADIR" ? "H" : v === "TERLAMBAT" ? "T" : v === "ABSEN" ? "A" : v === "-" ? "-" : v[0]) : v}
    </span>
  );
}

const MANUAL_STATUS: AttendanceStatus[] = ["HADIR", "TERLAMBAT", "IZIN", "SAKIT", "ALPA"];

export default function PresensiPage() {
  const { user, hasPermission } = useAuth();
  const canCheckin = hasPermission("attendance.checkin");
  const canManage = hasPermission("attendance.manage");
  const canSummary = hasPermission("attendance.summary");
  const today = todayWita();

  const [todayData, setTodayData] = useState<AttendanceToday | null>(null);
  const [todayErr, setTodayErr] = useState("");
  const [acting, setActing] = useState<"in" | "out" | null>(null);

  // Checklist operator hari ini
  const [repDate, setRepDate] = useState(today);
  const [report, setReport] = useState<AttendanceReportRow[]>([]);
  const [repLoading, setRepLoading] = useState(false);

  // Rekap mingguan per sesi (Opsi A)
  const [weekStart, setWeekStart] = useState(mondayOfWeekWita(today));
  const weekDays = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i)), [weekStart]);
  const [weekRecs, setWeekRecs] = useState<AttendanceRecord[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);

  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [histMeta, setHistMeta] = useState<PageMeta | null>(null);

  const [summary, setSummary] = useState<AttendanceSummaryItem[]>([]);
  const [problematic, setProblematic] = useState<ProblematicItem[]>([]);
  const [summaryMsg, setSummaryMsg] = useState("");

  // Form input manual (operator)
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [mEmp, setMEmp] = useState("");
  const [mDate, setMDate] = useState(today);
  const [mStatus, setMStatus] = useState<AttendanceStatus>("HADIR");
  const [mTime, setMTime] = useState("07:30");
  const [mNote, setMNote] = useState("");
  const [mLoading, setMLoading] = useState(false);

  // Foto dokumentasi apel per sesi
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [phDate, setPhDate] = useState(today);
  const [phSession, setPhSession] = useState<"PAGI" | "SORE">("PAGI");
  const [phFile, setPhFile] = useState<File | null>(null);
  const [phLoading, setPhLoading] = useState(false);

  const loadToday = useCallback(async () => {
    setTodayErr("");
    try {
      const { data } = await apiFetch<AttendanceToday>("/attendances/today");
      setTodayData(data);
    } catch (err) {
      setTodayErr(err instanceof Error ? err.message : "Gagal memuat presensi hari ini");
    }
  }, []);

  const loadReport = useCallback(async () => {
    setRepLoading(true);
    try {
      const { data } = await apiFetch<AttendanceReportRow[]>(`/attendances/report?date=${repDate}`);
      setReport(Array.isArray(data) ? data : []);
    } catch {
      setReport([]);
    } finally {
      setRepLoading(false);
    }
  }, [repDate]);

  const loadWeek = useCallback(async () => {
    setWeekLoading(true);
    try {
      const to = addDays(weekStart, 4);
      const { data } = await apiFetch<AttendanceRecord[]>(
        `/attendances?from=${weekStart}&to=${to}&limit=100`,
      );
      setWeekRecs(Array.isArray(data) ? data : []);
    } catch {
      setWeekRecs([]);
    } finally {
      setWeekLoading(false);
    }
  }, [weekStart]);

  const loadHistory = useCallback(async () => {
    try {
      const from = repDate.slice(0, 7) + "-01";
      const { data, meta } = await apiFetch<AttendanceRecord[]>(
        `/attendances?from=${from}&to=${repDate}&limit=31`,
      );
      setHistory(Array.isArray(data) ? data : []);
      setHistMeta(meta as PageMeta | null);
    } catch {
      setHistory([]);
    }
  }, [repDate]);

  const loadSummary = useCallback(async () => {
    if (!canSummary) return;
    setSummaryMsg("");
    try {
      const from = repDate.slice(0, 7) + "-01";
      const { data } = await apiFetch<AttendanceSummaryItem[]>(
        `/attendances/summary?from=${from}&to=${repDate}`,
      );
      const list = Array.isArray(data) ? data : [];
      setSummary(list);
      if (!mEmp && list.length) setMEmp(list[0].employee.id);
      const { data: prob } = await apiFetch<ProblematicItem[]>(
        `/attendances/problematic?weekStart=${weekStart}`,
      );
      setProblematic(Array.isArray(prob) ? prob : []);
    } catch (err) {
      setSummaryMsg(err instanceof Error ? err.message : "Gagal memuat rekap");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSummary, repDate, weekStart]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);
  useEffect(() => {
    void loadReport();
    void loadHistory();
  }, [loadReport, loadHistory]);

  useEffect(() => {
    if (!canManage) return;
    apiFetch<Array<{ id: string; name: string }>>("/employees?limit=100")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setEmployees(list);
        if (!mEmp && list.length) setMEmp(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);
  const loadPhotos = useCallback(async () => {
    try {
      const to = addDays(weekStart, 4);
      const { data } = await apiFetch<SessionPhoto[] | SessionPhoto>(`/attendances/session-photos?from=${weekStart}&to=${to}`);
      setPhotos(Array.isArray(data) ? data : data ? [data] : []);
    } catch {
      setPhotos([]);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadWeek();
    void loadPhotos();
  }, [loadWeek, loadPhotos]);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Matriks mingguan: pegawai × hari × sesi
  const matrix = useMemo(() => {
    const byKey = new Map<string, AttendanceRecord>();
    for (const r of weekRecs) {
      byKey.set(`${r.employeeId}|${r.date.slice(0, 10)}`, r);
    }
    const roster: Array<{ id: string; name: string }> =
      summary.length > 0
        ? summary.map((s) => ({ id: s.employee.id, name: s.employee.name }))
        : weekRecs.length > 0
          ? [...new Map(weekRecs.map((r) => [r.employeeId, r.employee?.name ?? r.employeeId] as const)).entries()].map(
              ([id, name]) => ({ id, name }),
            )
          : user?.employee
            ? [{ id: user.employee.id, name: user.employee.name }]
            : [];
    return roster.map((p) => {
      const cells = weekDays.map((d) => {
        const rec = byKey.get(`${p.id}|${d}`);
        return { pagi: sesiPagi(rec, d, today), sore: sesiSore(rec, d, today) };
      });
      const missed = cells.reduce(
        (n, c) => n + (c.pagi === "ABSEN" ? 1 : 0) + (c.sore === "ABSEN" ? 1 : 0),
        0,
      );
      return { ...p, cells, missed };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekRecs, summary, weekDays]);

  async function check(kind: "in" | "out") {
    setActing(kind);
    try {
      const endpoint = kind === "in" ? "/attendances/check-in" : "/attendances/check-out";
      const { data } = await apiFetch<{ record: AttendanceRecord }>(endpoint, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setTodayData((t) => (t ? { ...t, record: data.record } : t));
      void loadReport();
      void loadHistory();
      void loadWeek();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Presensi gagal");
    } finally {
      setActing(null);
    }
  }

  async function manualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mEmp) {
      toast.error("Pilih pegawai dulu.");
      return;
    }
    setMLoading(true);
    try {
      await apiFetch("/attendances", {
        method: "POST",
        body: JSON.stringify({
          employeeId: mEmp,
          date: mDate,
          status: mStatus,
          ...(mStatus === "HADIR" || mStatus === "TERLAMBAT" ? { checkInTime: mTime } : {}),
          ...(mNote.trim() ? { note: mNote.trim() } : {}),
        }),
      });
      setMNote("");
      toast.success("Presensi manual tercatat.");
      void loadReport();
      void loadWeek();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat");
    } finally {
      setMLoading(false);
    }
  }

  async function generateWarnings() {
    try {
      const { raw } = await apiFetch<unknown>("/attendances/warning-letters/generate", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      });
      toast.success((raw as { message?: string })?.message ?? "Surat teguran diproses");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat surat teguran");
    }
  }

  async function uploadPhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!phFile) {
      toast.error("Pilih file foto dulu (jpg/png).");
      return;
    }
    setPhLoading(true);
    try {
      const fd = new FormData();
      fd.append("date", phDate);
      fd.append("session", phSession);
      fd.append("file", phFile);
      await apiUpload("/attendances/session-photos", fd);
      setPhFile(null);
      toast.success("Foto apel diunggah.");
      void loadPhotos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah foto gagal");
    } finally {
      setPhLoading(false);
    }
  }

  const rec = todayData?.record;
  const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Presensi Apel</h1>
      <p className="mt-0.5 text-sm text-muted">
        Batas apel pagi {todayData?.deadline ?? "08:00"} WITA • pulang 16:00 (Jumat 16:30) • bermasalah bila ≥5 sesi
        tidak hadir/minggu.
      </p>

      {/* Kartu presensi mandiri */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Presensi saya hari ini ({today})</h2>
        {todayErr ? (
          <div className="mt-2"><ErrorBox message={todayErr} onRetry={loadToday} /></div>
        ) : !todayData ? (
          <Skeleton className="mt-2 h-16 w-full" />
        ) : rec ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={rec.status} />
            <span>Masuk: {rec.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
            <span>Pulang: {rec.checkOutAt ? new Date(rec.checkOutAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
            {canCheckin && !rec.checkOutAt ? (
              <button disabled={acting !== null} onClick={() => void check("out")} className="rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {acting === "out" ? "Memproses…" : "Check-out pulang"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-muted">Anda belum presensi hari ini.</p>
            {canCheckin ? (
              <button disabled={acting !== null} onClick={() => void check("in")} className="mt-2 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {acting === "in" ? "Memproses…" : "Check-in apel sekarang"}
              </button>
            ) : (
              <p className="mt-2 text-sm text-muted">Akun Anda tidak punya hak check-in.</p>
            )}
          </div>
        )}
      </div>

      {/* Checklist operator */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Daftar hadir operator</h2>
          <input
            type="date"
            value={repDate}
            max={today}
            onChange={(e) => setRepDate(e.target.value)}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-brand-700"
          />
        </div>
        {repLoading ? (
          <Skeleton className="mt-3 h-40 w-full" />
        ) : report.length === 0 ? (
          <div className="mt-3"><EmptyState title="Tidak ada baris laporan" hint="Coba tanggal lain." /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-170 text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted">
                  <th className="py-2 pr-3">No</th>
                  <th className="py-2 pr-3">Nama</th>
                  <th className="py-2 pr-3">Jabatan</th>
                  <th className="py-2 pr-3">Pagi</th>
                  <th className="py-2 pr-3">Sore</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.nomor} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.nomor}</td>
                    <td className="py-2 pr-3 font-medium">{r.nama}</td>
                    <td className="py-2 pr-3 text-muted">{r.jabatan}</td>
                    <td className="py-2 pr-3">{r.jamHadir ?? (r.status === "IZIN" || r.status === "SAKIT" ? r.status : "—")}</td>
                    <td className="py-2 pr-3">{r.jamPulang ?? (r.status === "IZIN" || r.status === "SAKIT" ? r.status : "—")}</td>
                    <td className="py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage ? (
          <form onSubmit={manualSubmit} className="mt-4 rounded-lg bg-paper p-3">
            <p className="text-sm font-semibold">Input manual / backdate (operator)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              <select value={mEmp} onChange={(e) => setMEmp(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                <option value="">— pegawai —</option>
                {(employees.length > 0 ? employees : summary.map((s) => s.employee)).map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <input type="date" value={mDate} max={today} onChange={(e) => setMDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm" />
              <select value={mStatus} onChange={(e) => setMStatus(e.target.value as AttendanceStatus)} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                {MANUAL_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {(mStatus === "HADIR" || mStatus === "TERLAMBAT") ? (
                <input value={mTime} onChange={(e) => setMTime(e.target.value)} placeholder="HH:MM" pattern="^\d{1,2}:\d{2}$" className="rounded-lg border border-line px-2 py-1.5 text-sm" />
              ) : (
                <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Keterangan" className="rounded-lg border border-line px-2 py-1.5 text-sm" />
              )}
              <button disabled={mLoading} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {mLoading ? "…" : "Catat"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Rekap mingguan per sesi — Opsi A */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Rekap mingguan per sesi</h2>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-line px-2 py-1 hover:bg-paper">‹</button>
            <span className="px-2 font-medium">{weekStart} – {addDays(weekStart, 4)}</span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-line px-2 py-1 hover:bg-paper">›</button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">H=hadir, T=terlambat, A=tidak hadir sesi. Merah (≥5) = pegawai bermasalah. Hitungan klien sementara — backend menyusul per <code>docs/03-presensi-per-sesi.md</code>.</p>
        {weekLoading ? (
          <Skeleton className="mt-3 h-40 w-full" />
        ) : matrix.length === 0 ? (
          <div className="mt-3"><EmptyState title="Belum ada data pekan ini" /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-180 text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted">
                  <th className="py-2 pr-3">Nama</th>
                  {weekDays.map((d, i) => (
                    <th key={d} className="px-1 py-2 text-center">{dayNames[i]}<br />{d.slice(5)}</th>
                  ))}
                  <th className="py-2 pl-2 text-center">Absen</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.id} className={`border-b last:border-0 ${row.missed >= 5 ? "bg-bad-100/60" : ""}`}>
                    <td className="py-1.5 pr-3 font-medium">{row.name}</td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="px-1 py-1.5 text-center">
                        <SesiCell v={c.pagi} short /> <SesiCell v={c.sore} short />
                      </td>
                    ))}
                    <td className={`py-1.5 pl-2 text-center font-bold ${row.missed >= 5 ? "text-bad-700" : ""}`}>{row.missed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Dokumentasi foto apel</h2>
        <p className="mt-0.5 text-xs text-muted">Satu foto per sesi per tanggal (jpg/png).</p>
        {canManage ? (
          <form onSubmit={uploadPhoto} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3">
            <input type="date" value={phDate} max={today} onChange={(e) => setPhDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm" />
            <select value={phSession} onChange={(e) => setPhSession(e.target.value as "PAGI" | "SORE")} className="rounded-lg border border-line px-2 py-1.5 text-sm">
              <option value="PAGI">Pagi</option>
              <option value="SORE">Sore</option>
            </select>
            <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setPhFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button disabled={phLoading} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {phLoading ? "…" : "Unggah foto"}
            </button>
          </form>
        ) : null}
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Belum ada foto pekan ini.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <a key={p.id} href={`/api${p.photoUrl}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-line hover:border-brand-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${p.photoUrl}`} alt={`Apel ${p.session} ${p.date}`} className="h-28 w-full object-cover" loading="lazy" />
                <p className="px-2 py-1 text-xs font-semibold">{p.session} • {String(p.date).slice(0, 10)}</p>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Riwayat bulan berjalan {histMeta ? `(${histMeta.total})` : ""}</h2>
        {history.length === 0 ? (
          <div className="mt-2"><EmptyState title="Belum ada riwayat" /></div>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                <span className="font-medium">{h.date.slice(0, 10)}</span>
                <span className="text-muted">{h.employee?.name}</span>
                <span className="ml-auto"><StatusBadge status={h.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSummary ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold">Rekap per pegawai</h2>
          {summaryMsg ? <p className="mt-1 text-sm text-bad-700">{summaryMsg}</p> : null}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted">
                  <th className="py-2 pr-3">Nama</th>
                  <th className="py-2 pr-3">Hadir</th>
                  <th className="py-2 pr-3">Terlambat</th>
                  <th className="py-2 pr-3">Izin</th>
                  <th className="py-2 pr-3">Sakit</th>
                  <th className="py-2">Alpa</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.employee.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{s.employee.name}</td>
                    <td className="py-2 pr-3">{s.counts.HADIR}</td>
                    <td className="py-2 pr-3">{s.counts.TERLAMBAT}</td>
                    <td className="py-2 pr-3">{s.counts.IZIN}</td>
                    <td className="py-2 pr-3">{s.counts.SAKIT}</td>
                    <td className="py-2">{s.counts.ALPA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Pegawai bermasalah (≥5 sesi/minggu)</h3>
              <Link href="/presensi/teguran" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                Daftar teguran
              </Link>
              {canManage ? (
                <button onClick={() => void generateWarnings()} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
                  Terbitkan teguran pekan {weekStart}
                </button>
              ) : null}
            </div>
            {problematic.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Tidak ada pegawai bermasalah pekan ini.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {problematic.map((p) => (
                  <li key={p.employee.id} className="rounded-lg bg-bad-100/60 px-3 py-2">
                    <b>{p.employee.name}</b> — {p.absenceCount} sesi
                    {p.days ? (
                      <span className="text-muted"> ({p.days.filter((d) => d.pagi === "ABSEN" || d.sore === "ABSEN").map((d) => `${d.date.slice(5)}(${d.pagi === "ABSEN" ? "P" : ""}${d.sore === "ABSEN" ? "S" : ""})`).join(", ")})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
