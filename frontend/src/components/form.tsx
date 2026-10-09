import { useState } from "react";

export function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

const INPUT = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${INPUT} pr-10 ${props.className ?? ""}`} />
      <button
        type="button"
        aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad-700">{error}</span> : null}
    </label>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Memproses…" : children}
    </button>
  );
}

export function ActionButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-10 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-paper disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-10 rounded-lg bg-bad-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Tombol pilih file yang jelas: label tombol + nama/ukuran file + syarat.
 *  Input asli disembunyikan dengan sr-only agar validasi `required` tetap jalan. */
export function FileButton({
  accept = ".pdf,.jpg,.jpeg,.png",
  required,
  hint,
  onSelect,
}: {
  accept?: string;
  required?: boolean;
  hint?: string;
  onSelect: (file: File | null) => void;
}) {
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-line bg-paper px-3 py-2 transition hover:border-brand-700">
        <span className="shrink-0 rounded-md bg-brand-900 px-3 py-1.5 text-xs font-semibold text-white">
          Pilih file
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-secondary">
          {info ?? "Belum ada file dipilih"}
        </span>
        <input
          type="file"
          accept={accept}
          required={required}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setInfo(f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : null);
            onSelect(f);
          }}
        />
      </label>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
