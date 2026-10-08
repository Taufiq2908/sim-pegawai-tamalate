"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Field, PasswordInput, SubmitButton } from "@/components/form";

const DEMO = [
  { u: "pegawai1", p: "Pegawai123!", role: "Pegawai" },
  { u: "pegawai2", p: "Pegawai123!", role: "Pegawai Kelurahan" },
  { u: "verifier1", p: "Verifier123!", role: "Verifikator" },
  { u: "kasi1", p: "Kasi123!", role: "Kasi" },
  { u: "kasubag1", p: "Kasubag123!", role: "Kasubag" },
  { u: "sekcam1", p: "Sekcam123!", role: "Sekcam" },
  { u: "camat1", p: "Camat123!", role: "Camat" },
  { u: "superadmin", p: "Admin123!", role: "Super Admin" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function doLogin(u: string, p: string) {
    setError("");
    setLoading(true);
    try {
      await login(u.trim(), p);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal. Periksa username dan kata sandi.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void doLogin(username, password);
  }

  return (
    <main className="flex min-h-screen">
      <div className="hidden w-[420px] shrink-0 flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <div>
          <p className="text-sm font-semibold">SIMPEG Tamalate</p>
          <p className="mt-0.5 text-xs text-muted">Kecamatan Tamalate • Kota Makassar</p>
        </div>

        <div>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight">
            Ruang kerja administrasi kepegawaian.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Presensi apel, cuti, disposisi surat, penomoran naskah dinas, dan KGB —
            tercatat dan dapat dilacak dalam satu tempat.
          </p>
          <ul className="mt-6 space-y-2 border-t border-line pt-6 text-sm text-muted">
            <li>Presensi apel pagi–sore per sesi</li>
            <li>Persetujuan cuti berjenjang</li>
            <li>Disposisi dan arsip surat</li>
          </ul>
        </div>

        <p className="text-xs text-muted">Akses internal pegawai.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <p className="font-semibold">SIMPEG Tamalate</p>
            <p className="text-xs text-muted">Kecamatan Tamalate</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Masuk</h2>
          <p className="mt-1 text-sm text-muted">Gunakan akun pegawai Anda untuk melanjutkan.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="cth: pegawai1"
                required
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700"
              />
            </Field>
            <Field label="Kata sandi">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </Field>

            {error ? (
              <p role="alert" className="rounded-lg border border-bad-700/20 bg-bad-100/60 px-3 py-2 text-sm text-bad-700">
                {error}
              </p>
            ) : null}

            <SubmitButton loading={loading}>Masuk</SubmitButton>
          </form>

          <div className="mt-8 border-t border-line pt-4">
            <p className="text-xs font-medium text-muted">Akun demo — ketuk untuk mengisi</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.u}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setUsername(d.u);
                    setPassword(d.p);
                  }}
                  title={`${d.u} / ${d.p}`}
                  className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-muted transition hover:border-brand-700 hover:text-ink disabled:opacity-50"
                >
                  {d.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
