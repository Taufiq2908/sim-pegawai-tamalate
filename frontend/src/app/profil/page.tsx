"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/toast";
import { Field, TextInput } from "@/components/form";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";
import type { Role, UserProfile } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  VERIFIER: "Staf Kepegawaian",
  SUPERVISOR: "Supervisor / Atasan Langsung",
  LEADER: "Sekcam / Camat",
  EMPLOYEE: "Pegawai",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  PNS: "PNS",
  PPPK: "PPPK",
  HONORER: "Honorer",
};

const GENDER_LABEL: Record<string, string> = {
  L: "Laki-laki",
  P: "Perempuan",
};

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">
        {value == null || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

export default function ProfilPage() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<UserProfile>("/users/me");
      setProfile(data);
      setEmail(data.email ?? "");
      setPhone(data.phone ?? data.employee?.phone ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat profil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const nextEmail = email.trim();
    const nextPhone = phone.trim();
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setFormError("Format email tidak valid.");
      return;
    }
    if (nextPhone && !/^[0-9+()\s.-]+$/.test(nextPhone)) {
      setFormError("Nomor telepon hanya boleh berisi angka, spasi, +, -, titik, atau tanda kurung.");
      return;
    }

    setSaving(true);
    try {
      const payload: { email: string | null; phone?: string | null } = {
        email: nextEmail || null,
      };
      if (profile?.employee) payload.phone = nextPhone || null;

      const { data } = await apiFetch<UserProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setProfile(data);
      setEmail(data.email ?? "");
      setPhone(data.phone ?? data.employee?.phone ?? "");
      await refresh();
      toast.success("Profil diperbarui.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan profil";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const displayName = profile?.employee?.name ?? profile?.username ?? "—";

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Profil Saya</h1>
            <p className="mt-0.5 text-sm text-muted">
              Informasi akun, kontak, dan data kepegawaian Anda.
            </p>
          </div>
          <span className="rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-medium text-muted">
            Akun pribadi
          </span>
        </div>

        {error ? (
          <div className="mt-5">
            <ErrorBox message={error} onRetry={load} />
          </div>
        ) : loading ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-64 w-full xl:col-span-2" />
          </div>
        ) : profile ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-900 text-lg font-semibold text-white">
                  {initials(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-ink">{displayName}</p>
                  <p className="mt-0.5 text-sm text-muted">@{profile.username}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-info-100 px-2 py-0.5 text-xs font-medium text-info-700">
                      {ROLE_LABEL[profile.role] ?? profile.role}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        profile.isActive ? "bg-ok-100 text-ok-700" : "bg-paper text-muted"
                      }`}
                    >
                      {profile.isActive ? "Akun aktif" : "Akun nonaktif"}
                    </span>
                    {!profile.email ? (
                      <span className="rounded-md bg-warn-100 px-2 py-0.5 text-xs font-medium text-warn-700">
                        Email belum diisi
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <dl className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <InfoRow label="Username" value={profile.username} />
                <InfoRow label="Role" value={ROLE_LABEL[profile.role] ?? profile.role} />
                <InfoRow
                  label="Jabatan"
                  value={profile.position ?? profile.employee?.position ?? "—"}
                />
                <InfoRow
                  label="Unit kerja"
                  value={profile.orgUnit?.name ?? profile.employee?.orgUnit?.name ?? "—"}
                />
                <InfoRow label="Login terakhir" value={formatDateTime(profile.lastLoginAt)} />
                <InfoRow label="Akun dibuat" value={formatDateTime(profile.createdAt)} />
              </dl>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-base font-semibold text-ink">Kontak</h2>
              <p className="mt-1 text-sm text-muted">
                Email disiapkan untuk notifikasi otomatis pada tahap berikutnya. Pengiriman email
                belum diaktifkan pada versi ini.
              </p>
              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@contoh.go.id"
                    autoComplete="email"
                    maxLength={150}
                  />
                </Field>
                <p className="text-xs text-muted">
                  {profile.email
                    ? "Email tersimpan dan akan dipakai saat notifikasi email diaktifkan."
                    : "Belum ada email. Isi agar akun siap menerima notifikasi email nanti."}
                </p>

                <Field label="Nomor telepon">
                  <TextInput
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xx xxxx xxxx"
                    autoComplete="tel"
                    maxLength={20}
                    disabled={!profile.employee}
                  />
                </Field>
                {!profile.employee ? (
                  <p className="text-xs text-muted">
                    Akun ini belum terhubung ke data pegawai, sehingga nomor telepon belum dapat
                    diisi.
                  </p>
                ) : null}

                {formError ? <p className="text-sm text-bad-700">{formError}</p> : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Menyimpan…" : "Simpan kontak"}
                </button>
              </form>
            </section>

            {profile.employee ? (
              <section className="rounded-lg border border-line bg-surface p-5 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Data kepegawaian</h2>
                    <p className="mt-1 text-sm text-muted">
                      Data ini berasal dari master kepegawaian. Hubungi admin kepegawaian bila ada
                      yang perlu diperbaiki.
                    </p>
                  </div>
                  <span className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs font-medium text-muted">
                    {EMPLOYMENT_LABEL[profile.employee.employmentStatus] ??
                      profile.employee.employmentStatus}
                  </span>
                </div>

                <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoRow label="Nama lengkap" value={profile.employee.name} />
                  <InfoRow label="NIP" value={profile.employee.nip} />
                  <InfoRow label="Nomor pegawai" value={profile.employee.employeeNumber} />
                  <InfoRow
                    label="Jenis kelamin"
                    value={GENDER_LABEL[profile.employee.gender] ?? profile.employee.gender}
                  />
                  <InfoRow
                    label="Status kepegawaian"
                    value={
                      EMPLOYMENT_LABEL[profile.employee.employmentStatus] ??
                      profile.employee.employmentStatus
                    }
                  />
                  <InfoRow label="Golongan" value={profile.employee.rank} />
                  <InfoRow label="TMT pangkat" value={formatDate(profile.employee.rankTmt)} />
                  <InfoRow label="Tanggal masuk" value={formatDate(profile.employee.joinDate)} />
                  <InfoRow label="Unit kerja" value={profile.employee.orgUnit?.name} />
                  <InfoRow label="Tempat lahir" value={profile.employee.birthPlace} />
                  <InfoRow label="Tanggal lahir" value={formatDate(profile.employee.birthDate)} />
                  <InfoRow label="Alamat" value={profile.employee.address} />
                  <InfoRow
                    label="Status pegawai"
                    value={profile.employee.isActive ? "Aktif" : "Nonaktif"}
                  />
                </dl>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="Profil tidak ditemukan"
              hint="Coba muat ulang halaman atau hubungi admin kepegawaian."
            />
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
