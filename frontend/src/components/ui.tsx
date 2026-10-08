/** Label Bahasa Indonesia untuk kode status backend. Kode dipertahankan, tampilan dilokalkan. */
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  REVISION: "Perlu perbaikan",
  VERIFIED: "Terverifikasi",
  PARAF: "Paraf",
  APPROVED: "Disetujui",
  SIGNED: "Ditandatangani",
  FORWARDED: "Diteruskan ke Sekda",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  RECEIVED: "Diterima",
  DISPOSED: "Didisposisikan",
  ARCHIVED: "Diarsipkan",
  RESERVED: "Dipesan",
  ISSUED: "Terbit",
  CANCELLED: "Dibatalkan",
  HADIR: "Hadir",
  TERLAMBAT: "Terlambat",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALPA: "Tanpa keterangan",
  PENDING: "Menunggu",
  DONE: "Selesai",
  NONE: "Internal",
  BKPSDM: "BKPSDM",
};

/** Warna muted per status: hijau = selesai/setuju, kuning = menunggu, merah = tolak/absen. */
const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-warn-100 text-warn-700",
  REVISION: "bg-warn-100 text-warn-700",
  VERIFIED: "bg-info-100 text-info-700",
  PARAF: "bg-info-100 text-info-700",
  APPROVED: "bg-ok-100 text-ok-700",
  SIGNED: "bg-ok-100 text-ok-700",
  FORWARDED: "bg-info-100 text-info-700",
  COMPLETED: "bg-ok-100 text-ok-700",
  REJECTED: "bg-bad-100 text-bad-700",
  RECEIVED: "bg-warn-100 text-warn-700",
  DISPOSED: "bg-info-100 text-info-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
  RESERVED: "bg-warn-100 text-warn-700",
  ISSUED: "bg-ok-100 text-ok-700",
  CANCELLED: "bg-bad-100 text-bad-700",
  HADIR: "bg-ok-100 text-ok-700",
  TERLAMBAT: "bg-warn-100 text-warn-700",
  IZIN: "bg-info-100 text-info-700",
  SAKIT: "bg-info-100 text-info-700",
  ALPA: "bg-bad-100 text-bad-700",
  PENDING: "bg-warn-100 text-warn-700",
  DONE: "bg-ok-100 text-ok-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-bad-700/20 bg-bad-100/50 px-4 py-3 text-sm text-bad-700">
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 rounded-md bg-bad-700 px-3 py-1.5 text-xs font-semibold text-white">
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

/** Jejak proses administratif — dipakai cuti, KGB, surat, presensi. */
export interface TrailEntry {
  title: string;
  subtitle?: string;
  note?: string | null;
  time?: string;
  state: "done" | "now" | "todo";
}

export function ProcessTrail({ items }: { items: TrailEntry[] }) {
  return (
    <ol className="mt-3 space-y-0">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                t.state === "done" ? "bg-ok-700" : t.state === "now" ? "bg-warn-700 ring-4 ring-warn-100" : "border border-slate-300 bg-white"
              }`}
            />
            {i < items.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
          </span>
          <div className="pb-5">
            <p className={`text-sm ${t.state === "todo" ? "text-muted" : "font-semibold text-ink"}`}>{t.title}</p>
            {t.subtitle ? <p className="text-sm text-muted">{t.subtitle}</p> : null}
            {t.note ? <p className="text-sm text-muted">“{t.note}”</p> : null}
            {t.time ? <p className="mt-0.5 text-xs text-muted">{t.time}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
