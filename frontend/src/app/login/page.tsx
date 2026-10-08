"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Field, PasswordInput, SubmitButton } from "@/components/form";
import { Icons } from "@/components/icons";

const DEMO = [
  { u: "verifier1", p: "Verifier123!", role: "Operator / Verifikator" },
  { u: "pegawai1", p: "Pegawai123!", role: "Pegawai" },
  { u: "sekcam1", p: "Sekcam123!", role: "Sekretaris Camat" },
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
      {/* Panel branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-[#0c3a3a] p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(232,180,74,.35), transparent 40%), radial-gradient(circle at 80% 90%, rgba(71,165,160,.4), transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-extrabold ring-1 ring-white/20">T</div>
          <div>
            <p className="font-extrabold tracking-wide">SIMPEG TAMALATE</p>
            <p className="text-xs tracking-widest text-brand-200/70">KECAMATAN TAMALATE • KOTA MAKASSAR</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-3xl font-extrabold leading-tight">
            Administrasi kepegawaian dalam satu pintu.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            Presensi apel pagi–sore, pengajuan cuti, disposisi surat, penomoran naskah dinas,
            dan kenaikan gaji berkala — tercatat rapi dan dapat dilacak.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              ["Presensi apel", "Check-in pagi, check-out sore, rekap otomatis per sesi."],
              ["Cuti berjenjang", "Pegawai → verifikator → paraf → persetujuan → tanda tangan."],
              ["Disposisi surat", "Agenda, disposisi, ekspedisi, dan arsip dalam satu alur."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-gold-400">
                  <Icons.check className="h-3.5 w-3.5" />
                </span>
                <span><b>{t}</b> <span className="text-slate-300">— {d}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">© 2026 Kecamatan Tamalate. Akses internal pegawai.</p>
      </div>

      {/* Panel form */}
      <div className="flex flex-1 items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-900 text-lg font-extrabold text-white">T</div>
            <div>
              <p className="font-extrabold">SIMPEG TAMALATE</p>
              <p className="text-[11px] tracking-widest text-slate-500">KECAMATAN TAMALATE</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-8">
            <h2 className="text-xl font-extrabold text-slate-900">Selamat datang kembali</h2>
            <p className="mt-1 text-sm text-slate-500">Masuk dengan akun pegawai Anda untuk melanjutkan.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="cth: pegawai1"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
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
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <SubmitButton loading={loading}>Masuk ke SIMPEG</SubmitButton>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold tracking-wider text-slate-400">AKUN DEMO — KETUK UNTUK MENGISI</p>
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
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-brand-900 hover:text-white disabled:opacity-50"
                  >
                    {d.role}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">Lupa kata sandi? Hubungi Kasubag Umum & Kepegawaian.</p>
        </div>
      </div>
    </main>
  );
}
