"use client";
import { FileButton } from "@/components/form";
import { toast } from "@/components/toast";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { EmptyState, ErrorBox, Skeleton, StatusBadge, TrailBadge, actorDisplay } from "@/components/ui";

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

export interface RecapRow {
  no: number;
  employee: { id: string; nip: string | null; name: string; position: string; rank: string | null; employmentStatus: string; orgUnit: { code: string | null; name: string | null } };
  kantor: string;
  jabatan: string;
  status: string;
  tk: number;
  izin: number;
  dl: number;
  rekapitulasi: number;
  counts: { hadir: number; terlambat: number; izin: number; sakit: number; dl: number; tk: number };
  absenceCount: number;
  isProblematic: boolean;
  days: Array<{ date: string; pagi: string; sore: string }>;
}

const MANUAL_STATUS: AttendanceStatus[] = ["HADIR", "TERLAMBAT", "IZIN", "SAKIT", "DL", "ALPA"];

const PATCH_STATUS: AttendanceStatus[] = ["HADIR", "TERLAMBAT", "IZIN", "SAKIT", "DL", "ALPA"];

export default function PresensiPage() {
  const { user, hasPermission } = useAuth();
  const canCheckin = hasPermission("attendance.checkin");
  const canManage = hasPermission("attendance.manage");
  const canSummary = hasPermission("attendance.summary");
  const canForward = hasPermission("attendance.forward");
  const isKasubag = (user?.position ?? "").startsWith("KASUBAG") || user?.role === "SUPER_ADMIN";
  const today = todayWita();

  const [todayData, setTodayData] = useState<AttendanceToday | null>(null);
  const [todayErr, setTodayErr] = useState("");
  const [acting, setActing] = useState<"in" | "out" | null>(null);

  // Daftar hadir + status kunci hari ini
  const [repDate, setRepDate] = useState(today);
  const [report, setReport] = useState<AttendanceReportRow[]>([]);
  const [repLocked, setRepLocked] = useState(false);
  const [repLoading, setRepLoading] = useState(false);

  // Validasi harian (cocok visual + revisi per baris)
  const [validating, setValidating] = useState<AttendanceRecord[]>([]);
  const [valLoading, setValLoading] = useState(false);
  const [patching, setPatching] = useState<string | null>(null);

  // Rekap mingguan dari server
  const [weekStart, setWeekStart] = useState(mondayOfWeekWita(today));
  const [recap, setRecap] = useState<RecapRow[]>([]);
  const [recapMeta, setRecapMeta] = useState<{ weekStart: string; weekEnd: string; totalEmployees: number; problematic: number } | null>(null);
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
  const [mOut, setMOut] = useState("");
  const [mNote, setMNote] = useState("");
  const [mLoading, setMLoading] = useState(false);

  // Foto dokumentasi apel per sesi
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [phDate, setPhDate] = useState(today);
  const [phSession, setPhSession] = useState<"PAGI" | "SORE">("PAGI");
  const [phFile, setPhFile] = useState<File | null>(null);
  const [phLoading, setPhLoading] = useState(false);
  const [locking, setLocking] = useState(false);

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
      const { data, meta } = await apiFetch<AttendanceReportRow[]>(`/attendances/report?date=${repDate}`);
      setReport(Array.isArray(data) ? data : []);
      setRepLocked(!!(meta as { locked?: boolean } | null)?.locked);
    } catch {
      setReport([]);
      setRepLocked(false);
    } finally {
      setRepLoading(false);
    }
  }, [repDate]);

  const loadValidating = useCallback(async () => {
    if (!canManage) return;
    setValLoading(true);
    try {
      const { data } = await apiFetch<AttendanceRecord[]>(
        `/attendances?from=${repDate}&to=${repDate}&limit=100`,
      );
      setValidating(Array.isArray(data) ? data : []);
    } catch {
      setValidating([]);
    } finally {
      setValLoading(false);
    }
  }, [canManage, repDate]);

  const loadWeek = useCallback(async () => {
    if (!canSummary) {
      setRecap([]);
      return;
    }
    setWeekLoading(true);
    try {
      const { data, meta } = await apiFetch<RecapRow[]>(`/attendances/weekly-recap?weekStart=${weekStart}`);
      setRecap(Array.isArray(data) ? data : []);
      setRecapMeta(meta as { weekStart: string; weekEnd: string; totalEmployees: number; problematic: number } | null);
    } catch {
      setRecap([]);
      setRecapMeta(null);
    } finally {
      setWeekLoading(false);
    }
  }, [canSummary, weekStart]);

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
    void loadValidating();
  }, [loadReport, loadHistory, loadValidating]);

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

  async function patchStatus(id: string, status: AttendanceStatus, time?: string) {
    if ((status === "HADIR" || status === "TERLAMBAT") && !time?.match(/^\d{1,2}:\d{2}$/)) {
      toast.error("Isi jam masuk (HH:MM) untuk HADIR/TERLAMBAT.");
      return;
    }
    setPatching(id);
    try {
      await apiFetch(`/attendances/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status === "HADIR" || status === "TERLAMBAT" ? { checkInTime: time } : {}),
        }),
      });
      toast.success("Status diperbarui.");
      void loadReport();
      void loadValidating();
      void loadWeek();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui");
    } finally {
      setPatching(null);
    }
  }

  function prefillManual(employeeId: string) {
    setMEmp(employeeId);
    setMDate(repDate);
    setMStatus("HADIR");
    document.getElementById("manual-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function quickSet(employeeId: string, status: AttendanceStatus) {
    setPatching(employeeId);
    try {
      await apiFetch("/attendances", {
        method: "POST",
        body: JSON.stringify({ employeeId, date: repDate, status }),
      });
      toast.success("Status tercatat.");
      void loadReport();
      void loadValidating();
      void loadWeek();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat");
    } finally {
      setPatching(null);
    }
  }

  async function lockDay() {
    if (!window.confirm(`Kunci presensi tanggal ${repDate}? Tanpa presensi akan menjadi TK dan data tidak bisa diubah lagi.`)) return;
    setLocking(true);
    try {
      const { data, raw } = await apiFetch<{ materializedTK: number }>(`/attendances/lock`, {
        method: "POST",
        body: JSON.stringify({ date: repDate }),
      });
      void raw;
      toast.success(`Harian dikunci. ${(data as { materializedTK: number }).materializedTK} pegawai tanpa presensi menjadi TK.`);
      void loadReport();
      void loadValidating();
      void loadWeek();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunci");
    } finally {
      setLocking(false);
    }
  }

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
          ...(mStatus === "HADIR" || mStatus === "TERLAMBAT" ? (mOut.trim() ? { checkOutTime: mOut.trim() } : {}) : {}),
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

      {/* Daftar hadir harian */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Daftar hadir harian</h2>
          {repLocked ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Terkunci Kasubag</span>
          ) : null}
          <input
            type="date"
            value={repDate}
            max={today}
            onChange={(e) => setRepDate(e.target.value)}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-brand-700"
          />
          {isKasubag && canManage && !repLocked ? (
            <button
              disabled={locking}
              onClick={() => void lockDay()}
              className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {locking ? "Mengunci…" : "Simpan & validasi"}
            </button>
          ) : null}
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
                    <td className="py-2 pr-3">
                      <span className="font-medium">{r.nama}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {r.diisiOleh ? <TrailBadge text={`Diisi ${r.diisiOleh}`} /> : null}
                        {r.koreksi ? <TrailBadge text={`Diubah ${r.koreksi.oleh ?? "?"} • ${String(r.koreksi.pada).slice(0, 10)}`} /> : null}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted">{r.jabatan}</td>
                    <td className="py-2 pr-3">{r.jamHadir ?? (r.status === "IZIN" || r.status === "SAKIT" || r.status === "DL" ? r.status : "—")}</td>
                    <td className="py-2 pr-3">{r.jamPulang ?? (r.status === "IZIN" || r.status === "SAKIT" || r.status === "DL" ? r.status : "—")}</td>
                    <td className="py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage ? (
          <form id="manual-form" onSubmit={manualSubmit} className="mt-4 scroll-mt-24 rounded-lg bg-paper p-3">
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
                <>
                  <input value={mTime} onChange={(e) => setMTime(e.target.value)} placeholder="Masuk HH:MM" pattern="^\d{1,2}:\d{2}$" className="rounded-lg border border-line px-2 py-1.5 text-sm" />
                  <input value={mOut} onChange={(e) => setMOut(e.target.value)} placeholder="Pulang HH:MM (opsional)" pattern="^\d{1,2}:\d{2}$" className="rounded-lg border border-line px-2 py-1.5 text-sm" />
                </>
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

      {/* Validasi harian — cocok visual + revisi per baris (Fase 2) */}
      {canManage ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold">Validasi presensi harian</h2>
          <p className="mt-0.5 text-xs text-muted">
            Cocokkan daftar tercatat dengan barisan apel. Yang belum presensi tidak perlu
            check-in — langsung beri Izin/Sakit/DL/TK di bawah. Kunci harian bila foto
            pagi+sore lengkap.
            {repLocked ? " Hari ini sudah dikunci." : ""}
          </p>
          {valLoading ? (
            <Skeleton className="mt-3 h-32 w-full" />
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {employees.map((emp) => {
                const v = validating.find((r) => r.employeeId === emp.id);
                return (
                  <li key={emp.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-medium">{emp.name}</span>
                    {v ? (
                      <>
                        <span className="text-muted">
                          {v.checkInAt ? new Date(v.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "tanpa presensi"}
                        </span>
                        <StatusBadge status={v.status} />
                        {v.recorder && v.method !== "SELF" ? <TrailBadge text={`Diisi ${actorDisplay(v.recorder)}`} /> : null}
                        {v.correctedAt ? <TrailBadge text={`Diubah ${actorDisplay(v.corrector) ?? "?"} • ${new Date(v.correctedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`} /> : null}
                        <span className="ml-auto flex items-center gap-1.5">
                          <input
                            id={`t-${v.id}`}
                            defaultValue={v.checkInAt ? new Date(v.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":") : ""}
                            placeholder="HH:MM"
                            pattern="^\d{1,2}:\d{2}$"
                            disabled={patching !== null || repLocked}
                            className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm"
                            aria-label={`Jam masuk ${emp.name}`}
                          />
                          <select
                            defaultValue={v.status}
                            disabled={patching !== null || repLocked}
                            onChange={(e) => {
                              const st = e.target.value as AttendanceStatus;
                              const t = (document.getElementById(`t-${v.id}`) as HTMLInputElement | null)?.value ?? "";
                              void patchStatus(v.id, st, t);
                              e.target.value = v.status;
                            }}
                            className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
                            aria-label={`Ubah status ${emp.name}`}
                          >
                            {PATCH_STATUS.map((s) => <option key={s} value={s}>{s === "ALPA" ? "TK" : s}</option>)}
                          </select>
                          {patching === v.id ? <span className="text-xs text-muted">…</span> : null}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-muted">tanpa presensi</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <select
                            defaultValue=""
                            disabled={patching !== null || repLocked}
                            onChange={(e) => {
                              const st = e.target.value as AttendanceStatus;
                              if (st) void quickSet(emp.id, st);
                              e.target.value = "";
                            }}
                            className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
                            aria-label={`Catat status ${emp.name}`}
                          >
                            <option value="">Beri status…</option>
                            {(["IZIN", "SAKIT", "DL", "ALPA"] as AttendanceStatus[]).map((s) => (
                              <option key={s} value={s}>{s === "ALPA" ? "TK" : s}</option>
                            ))}
                          </select>
                          <button
                            disabled={patching !== null || repLocked}
                            onClick={() => prefillManual(emp.id)}
                            className="rounded-md border border-line bg-surface px-2 py-1 text-sm font-medium hover:bg-paper disabled:opacity-50"
                          >
                            Isi
                          </button>
                          {patching === emp.id ? <span className="text-xs text-muted">…</span> : null}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
              {employees.length === 0 ? (
                <li className="text-muted">Daftar pegawai tidak tersedia.</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      {/* Rekapitulasi daftar hadir per pekan — dari server */}
      {canSummary ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Rekapitulasi daftar hadir per pekan</h2>
            <div className="ml-auto flex items-center gap-1 text-sm">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-line px-2 py-1 hover:bg-paper">‹</button>
              <span className="px-2 font-medium">{weekStart} – {addDays(weekStart, 4)}</span>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-line px-2 py-1 hover:bg-paper">›</button>
            </div>
          </div>
          {recapMeta ? (
            <p className="mt-1 text-xs text-muted">
              {recapMeta.totalEmployees} pegawai • {recapMeta.problematic} bermasalah (≥5 TK) • TK = Tanpa Keterangan
            </p>
          ) : null}
          {weekLoading ? (
            <Skeleton className="mt-3 h-40 w-full" />
          ) : recap.length === 0 ? (
            <div className="mt-3"><EmptyState title="Belum ada data pekan ini" /></div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-2 py-2 font-medium">No</th>
                    <th className="px-2 py-2 font-medium">Nama</th>
                    <th className="px-2 py-2 font-medium">Kantor</th>
                    <th className="px-2 py-2 font-medium">Jabatan</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-center font-medium">TK</th>
                    <th className="px-2 py-2 text-center font-medium">Izin</th>
                    <th className="px-2 py-2 text-center font-medium">DL</th>
                    <th className="px-2 py-2 text-center font-medium">Rekap</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.map((row) => (
                    <Fragment key={row.employee.id}>
                      <tr className={`border-b border-line last:border-0 ${row.isProblematic ? "bg-bad-100/60" : ""}`}>
                        <td className="px-2 py-2">{row.no}</td>
                        <td className="px-2 py-2 font-medium">
                          {row.employee.name}
                          <span className="block text-xs font-normal text-muted">{row.employee.nip ?? row.employee.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-2 py-2 text-muted">{row.kantor}</td>
                        <td className="px-2 py-2 text-muted">{row.jabatan}</td>
                        <td className="px-2 py-2 text-muted">{row.status}</td>
                        <td className={`px-2 py-2 text-center font-semibold tabular-nums ${row.tk >= 5 ? "text-bad-700" : ""}`}>{row.tk}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.izin}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.dl}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{row.rekapitulasi}</td>
                      </tr>
                    <tr key={`${row.employee.id}-d`} className="border-b border-line">
                        <td />
                        <td colSpan={8} className="px-2 pb-2">
                          <div className="flex flex-wrap gap-1">
                            {row.days.map((d) => (
                              <span key={d.date} title={`${d.date}: pagi ${d.pagi}, sore ${d.sore}`} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${d.pagi === "ABSEN" || d.sore === "ABSEN" ? "bg-bad-100 text-bad-700" : "bg-paper text-muted"}`}>
                                {d.date.slice(5)} {d.pagi[0]}/{d.sore[0]}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

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
            <FileButton accept=".jpg,.jpeg,.png" hint="JPG/PNG foto barisan apel" onSelect={setPhFile} />
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
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 font-medium">Nama</th>
                  <th className="px-2 py-2 font-medium">Kantor</th>
                  <th className="px-2 py-2 text-center font-medium">Hadir</th>
                  <th className="px-2 py-2 text-center font-medium">Terlambat</th>
                  <th className="px-2 py-2 text-center font-medium">Izin</th>
                  <th className="px-2 py-2 text-center font-medium">Sakit</th>
                  <th className="px-2 py-2 text-center font-medium">DL</th>
                  <th className="px-2 py-2 text-center font-medium">TK</th>
                  <th className="px-2 py-2 text-center font-medium">Rekap</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.employee.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2 font-medium">{s.employee.name}</td>
                    <td className="px-2 py-2 text-muted">{(s as unknown as { kantor?: string }).kantor ?? s.employee.orgUnit}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.counts.HADIR}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.counts.TERLAMBAT}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.counts.IZIN}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.counts.SAKIT}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{(s.counts as unknown as { DL?: number }).DL ?? 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.counts.ALPA}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{(s as unknown as { rekapitulasi?: number }).rekapitulasi ?? s.counts.ALPA + s.counts.IZIN}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Pegawai bermasalah (≥5 TK/minggu)</h3>
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
