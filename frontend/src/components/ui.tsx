const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-200 text-slate-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  REVISION: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-cyan-100 text-cyan-800",
  PARAF: "bg-violet-100 text-violet-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  SIGNED: "bg-teal-100 text-teal-800",
  FORWARDED: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  RECEIVED: "bg-blue-100 text-blue-800",
  DISPOSED: "bg-violet-100 text-violet-800",
  ARCHIVED: "bg-slate-200 text-slate-700",
  RESERVED: "bg-amber-100 text-amber-800",
  ISSUED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
  HADIR: "bg-green-100 text-green-800",
  TERLAMBAT: "bg-amber-100 text-amber-800",
  IZIN: "bg-blue-100 text-blue-800",
  SAKIT: "bg-cyan-100 text-cyan-800",
  ALPA: "bg-red-100 text-red-800",
  PENDING: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-800",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-600">
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}
