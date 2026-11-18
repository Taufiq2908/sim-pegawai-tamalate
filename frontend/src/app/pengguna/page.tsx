"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { toast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type {
  ManagedUser,
  Role,
  UserManagementOptions,
  UserRoleOption,
} from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

type EmploymentStatus = "PNS" | "PPPK" | "HONORER";

interface FormState {
  username: string;
  password: string;
  role: Role;
  position: string;
  orgUnitCode: string;
  isActive: boolean;
  name: string;
  nip: string;
  employeeNumber: string;
  gender: "L" | "P";
  birthPlace: string;
  birthDate: string;
  employmentStatus: EmploymentStatus;
  rank: string;
  rankTmt: string;
  joinDate: string;
  phone: string;
  address: string;
  employeeActive: boolean;
}

const INPUT_CLS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700";
const LABEL_CLS = "mb-1 block text-sm font-medium";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateOnly(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(value: string, years: number): string {
  const date = parseDateOnly(value);
  if (!date) return "";
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return ymd(date);
}

function fullYears(from: string, to: string): number {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  if (!a || !b) return 0;
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const beforeAnniversary =
    b.getUTCMonth() < a.getUTCMonth() ||
    (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseDateOnly(value.slice(0, 10));
  if (!date) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRupiah(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function defaultPosition(roles: UserRoleOption[], role: Role): string {
  return roles.find((r) => r.code === role)?.defaultPosition ?? "STAF";
}

function emptyForm(today = todayYmd()): FormState {
  const fourYearsAgo = addYears(today, -4);
  return {
    username: "",
    password: "",
    role: "EMPLOYEE",
    position: "STAF",
    orgUnitCode: "KEC-TAMALATE",
    isActive: true,
    name: "",
    nip: "",
    employeeNumber: "",
    gender: "L",
    birthPlace: "",
    birthDate: addYears(today, -35),
    employmentStatus: "PNS",
    rank: "III/a",
    rankTmt: fourYearsAgo,
    joinDate: fourYearsAgo,
    phone: "",
    address: "",
    employeeActive: true,
  };
}

const ROLE_TONE: Record<Role, string> = {
  SUPER_ADMIN: "bg-bad-100 text-bad-700",
  VERIFIER: "bg-info-100 text-info-700",
  SUPERVISOR: "bg-warn-100 text-warn-700",
  LEADER: "bg-ok-100 text-ok-700",
  EMPLOYEE: "bg-paper text-muted",
};

export default function KelolaPenggunaPage() {
  const [items, setItems] = useState<ManagedUser[]>([]);
  const [options, setOptions] = useState<UserManagementOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [opt, users] = await Promise.all([
        apiFetch<UserManagementOptions>("/users/options"),
        apiFetch<ManagedUser[]>("/users?limit=100"),
      ]);
      setOptions(opt.data);
      setItems(Array.isArray(users.data) ? users.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data pengguna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = options?.today ?? todayYmd();
  const roleOptions = options?.roles ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (activeFilter !== "all" && String(u.isActive) !== activeFilter) return false;
      if (!q) return true;
      const haystack = [
        u.username,
        u.employee?.name,
        u.employee?.nip,
        u.employee?.employeeNumber,
        u.position,
        u.employee?.position,
        u.orgUnit?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, roleFilter, activeFilter]);

  const activeCount = items.filter((u) => u.isActive).length;
  const pensionReady = items.filter((u) => {
    if (!u.employee?.birthDate) return false;
    return fullYears(u.employee.birthDate.slice(0, 10), today) >= 58;
  }).length;

  function startCreate() {
    setEditing(null);
    setForm(emptyForm(today));
    setFormError("");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(user: ManagedUser) {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      role: user.role,
      position: user.position ?? user.employee?.position ?? "STAF",
      orgUnitCode: user.orgUnit?.code ?? user.employee?.orgUnit?.code ?? "KEC-TAMALATE",
      isActive: user.isActive,
      name: user.employee?.name ?? "",
      nip: user.employee?.nip ?? "",
      employeeNumber: user.employee?.employeeNumber ?? "",
      gender: user.employee?.gender === "P" ? "P" : "L",
      birthPlace: user.employee?.birthPlace ?? "",
      birthDate: user.employee?.birthDate?.slice(0, 10) ?? "",
      employmentStatus:
        user.employee?.employmentStatus === "PPPK" || user.employee?.employmentStatus === "HONORER"
          ? user.employee.employmentStatus
          : "PNS",
      rank: user.employee?.rank ?? "III/a",
      rankTmt: user.employee?.rankTmt?.slice(0, 10) ?? "",
      joinDate: user.employee?.joinDate?.slice(0, 10) ?? "",
      phone: user.employee?.phone ?? "",
      address: user.employee?.address ?? "",
      employeeActive: user.employee?.isActive ?? true,
    });
    setFormError("");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  function changeRole(next: Role) {
    setForm((f) => ({
      ...f,
      role: next,
      // Jabatan ikut default role baru; pengguna tetap bisa menggantinya.
      position: defaultPosition(roleOptions, next),
      // Super Admin adalah akun teknis, bukan peserta apel/presensi.
      ...(next === "SUPER_ADMIN" ? { employeeActive: false } : {}),
    }));
  }

  function applyPreset(kind: "pension" | "kgb" | "reset") {
    if (kind === "reset") {
      setForm(emptyForm(today));
      return;
    }
    if (kind === "pension") {
      setForm((f) => ({
        ...f,
        role: "VERIFIER",
        position: "STAF_KEPEGAWAIAN",
        employmentStatus: "PNS",
        birthDate: addYears(today, -58),
        joinDate: addYears(today, -32),
        rankTmt: addYears(today, -8),
        rank: "III/d",
      }));
      toast.info(
        "Data usia 58 tahun diisi dan role diubah ke Staf Kepegawaian agar akun dapat mengajukan pensiun.",
      );
      return;
    }
    setForm((f) => ({
      ...f,
      role: "EMPLOYEE",
      position: "STAF",
      employmentStatus: "PNS",
      birthDate: addYears(today, -35),
      joinDate: addYears(today, -4),
      rankTmt: addYears(today, -4),
      rank: "III/a",
    }));
    toast.info("Data pegawai dengan masa kerja 4 tahun diisi; akun siap mengajukan KGB.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Nama pegawai wajib diisi.");
      return;
    }
    if (!form.username.trim()) {
      setFormError("Username wajib diisi.");
      return;
    }
    if (!editing && form.password.length < 8) {
      setFormError("Kata sandi minimal 8 karakter.");
      return;
    }

    const employee = {
      name: form.name.trim(),
      nip: form.nip.trim() || null,
      employeeNumber: form.employeeNumber.trim() || undefined,
      gender: form.gender,
      birthPlace: form.birthPlace.trim() || null,
      birthDate: form.birthDate || null,
      employmentStatus: form.employmentStatus,
      position: form.position,
      rank: form.rank || null,
      rankTmt: form.rankTmt || null,
      joinDate: form.joinDate || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      isActive: form.employeeActive,
    };

    const payload = {
      username: form.username.trim().toLowerCase(),
      ...(form.password ? { password: form.password } : {}),
      role: form.role,
      position: form.position,
      orgUnitCode: form.orgUnitCode,
      isActive: form.isActive,
      employee,
    };

    setSaving(true);
    try {
      const res = await apiFetch<ManagedUser>(
        editing ? `/users/${editing.id}` : "/users",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      const message =
        (res.raw as { message?: string } | null)?.message ??
        (editing ? "Akun diperbarui." : "Akun dibuat.");
      toast.success(message);
      closeForm();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan akun";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      toast.success(user.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan kembali.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status akun");
    }
  }

  async function removeUser(user: ManagedUser) {
    const ok = window.confirm(
      `Hapus akun ${user.username}?\n\nAkun tanpa riwayat akan dihapus permanen. Akun yang sudah memiliki transaksi akan dinonaktifkan agar riwayat tetap utuh.`,
    );
    if (!ok) return;
    setDeletingId(user.id);
    try {
      const res = await apiFetch<{ mode: "deleted" | "deactivated" }>(`/users/${user.id}`, {
        method: "DELETE",
      });
      const message =
        (res.raw as { message?: string } | null)?.message ??
        (res.data.mode === "deleted" ? "Akun dihapus." : "Akun dinonaktifkan.");
      toast.success(message);
      if (editing?.id === user.id) closeForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus akun");
    } finally {
      setDeletingId(null);
    }
  }

  const age = form.birthDate ? fullYears(form.birthDate, today) : 0;
  const bup = form.birthDate ? addYears(form.birthDate, 58) : "";
  const bupReached = Boolean(bup && bup <= today);
  const mkg = form.rankTmt || form.joinDate ? fullYears(form.rankTmt || form.joinDate, today) : 0;
  const salary = useMemo(() => {
    if (!options?.salaryScale?.length || !form.rank) return null;
    const rows = options.salaryScale
      .filter((row) => row.rank === form.rank && row.mkg <= mkg)
      .sort((a, b) => b.mkg - a.mkg);
    if (rows[0]) return rows[0].salary;
    const first = options.salaryScale
      .filter((row) => row.rank === form.rank)
      .sort((a, b) => a.mkg - b.mkg)[0];
    return first?.salary ?? null;
  }, [options, form.rank, mkg]);
  const nextKgb = form.joinDate ? addYears(form.joinDate, 2) : "";
  const kgbDue = Boolean(nextKgb && nextKgb <= today);

  return (
    <RequirePerm perm="user.manage" label="Kelola Pengguna">
      <div className="space-y-3">
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">Kelola Pengguna</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                Buat akun beserta data pegawai, atur role/jabatan, dan siapkan profil untuk
                simulasi pensiun atau KGB. Perubahan role langsung memakai kebijakan permission
                bawaan role tersebut.
              </p>
            </div>
            <button
              type="button"
              onClick={startCreate}
              disabled={!options || loading}
              className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              + Buat akun
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-paper px-3 py-2">
              <p className="text-xs text-muted">Total akun</p>
              <p className="text-lg font-bold tabular-nums">{items.length}</p>
            </div>
            <div className="rounded-lg bg-paper px-3 py-2">
              <p className="text-xs text-muted">Akun aktif</p>
              <p className="text-lg font-bold tabular-nums">{activeCount}</p>
            </div>
            <div className="rounded-lg bg-paper px-3 py-2">
              <p className="text-xs text-muted">Usia ≥ 58 tahun</p>
              <p className="text-lg font-bold tabular-nums">{pensionReady}</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-info-700/15 bg-info-100/40 px-3 py-2 text-xs text-info-700">
            Pensiun diajukan oleh <strong>Staf Kepegawaian</strong> atau <strong>Kasubag</strong>.
            Role Pegawai dapat mengajukan KGB sendiri, tetapi untuk pensiun hanya melihat usulan.
          </div>
        </section>

        {formOpen ? (
          <form onSubmit={(e) => void submit(e)} className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  {editing ? `Ubah akun ${editing.username}` : "Buat akun baru"}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  Isi akun dan profil pegawai. Kolom bertanda * wajib diisi.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-paper"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset("pension")}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-semibold hover:bg-brand-50"
              >
                Isi contoh pensiun 58 th
              </button>
              <button
                type="button"
                onClick={() => applyPreset("kgb")}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-semibold hover:bg-brand-50"
              >
                Isi contoh pegawai KGB
              </button>
              <button
                type="button"
                onClick={() => applyPreset("reset")}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-paper"
              >
                Kosongkan form
              </button>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Akun</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className={LABEL_CLS}>Username *</span>
                  <input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="contoh: pegawai.baru"
                    autoComplete="off"
                    className={INPUT_CLS}
                    required
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>
                    Kata sandi {editing ? "(kosongkan bila tidak diubah)" : "*"}
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={editing ? "Biarkan kosong" : "Minimal 8 karakter"}
                    autoComplete="new-password"
                    className={INPUT_CLS}
                    required={!editing}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Role *</span>
                  <select
                    value={form.role}
                    onChange={(e) => changeRole(e.target.value as Role)}
                    className={INPUT_CLS}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.code} value={role.code}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  {roleOptions.find((r) => r.code === form.role)?.description ? (
                    <span className="mt-1 block text-xs text-muted">
                      {roleOptions.find((r) => r.code === form.role)?.description}
                    </span>
                  ) : null}
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Jabatan *</span>
                  <select
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    className={INPUT_CLS}
                  >
                    {(options?.positions ?? []).map((pos) => (
                      <option key={pos.value} value={pos.value}>
                        {pos.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Unit kerja *</span>
                  <select
                    value={form.orgUnitCode}
                    onChange={(e) => setForm((f) => ({ ...f, orgUnitCode: e.target.value }))}
                    className={INPUT_CLS}
                  >
                    {(options?.orgUnits ?? []).map((org) => (
                      <option key={org.code} value={org.code}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="h-4 w-4 rounded border-line"
                    />
                    Akun aktif (bisa login)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.employeeActive}
                      onChange={(e) => setForm((f) => ({ ...f, employeeActive: e.target.checked }))}
                      className="h-4 w-4 rounded border-line"
                    />
                    Pegawai aktif (ikut presensi)
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Data pegawai</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block xl:col-span-2">
                  <span className={LABEL_CLS}>Nama lengkap *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nama pegawai"
                    className={INPUT_CLS}
                    required
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>NIP</span>
                  <input
                    value={form.nip}
                    onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))}
                    placeholder="Opsional"
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Nomor pegawai</span>
                  <input
                    value={form.employeeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))}
                    placeholder="Kosongkan untuk otomatis"
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Jenis kelamin</span>
                  <select
                    value={form.gender}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gender: e.target.value === "P" ? "P" : "L" }))
                    }
                    className={INPUT_CLS}
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Status kepegawaian</span>
                  <select
                    value={form.employmentStatus}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        employmentStatus: e.target.value as EmploymentStatus,
                      }))
                    }
                    className={INPUT_CLS}
                  >
                    <option value="PNS">PNS</option>
                    <option value="PPPK">PPPK</option>
                    <option value="HONORER">Honorer</option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Tempat lahir</span>
                  <input
                    value={form.birthPlace}
                    onChange={(e) => setForm((f) => ({ ...f, birthPlace: e.target.value }))}
                    placeholder="Opsional"
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Tanggal lahir</span>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Golongan</span>
                  <select
                    value={form.rank}
                    onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                    className={INPUT_CLS}
                  >
                    {(options?.ranks ?? []).map((rank) => (
                      <option key={rank.rank} value={rank.rank}>
                        {rank.rank} (MKG {rank.minMkg}–{rank.maxMkg})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>TMT pangkat terakhir</span>
                  <input
                    type="date"
                    value={form.rankTmt}
                    onChange={(e) => setForm((f) => ({ ...f, rankTmt: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Tanggal masuk / TMT awal</span>
                  <input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Telepon</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Opsional"
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block xl:col-span-2">
                  <span className={LABEL_CLS}>Alamat</span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Opsional"
                    className={INPUT_CLS}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-line bg-paper/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Pratinjau perhitungan</h3>
                <span className="text-xs text-muted">
                  Gaji memakai tabel {options?.regulation ?? "PP 5/2024"}
                </span>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Usia saat ini</dt>
                  <dd className="font-semibold tabular-nums">
                    {form.birthDate ? `${age} tahun` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">BUP 58 tahun</dt>
                  <dd className={`font-semibold tabular-nums ${bupReached ? "text-ok-700" : ""}`}>
                    {bup ? formatDate(bup) : "—"}
                    {bupReached ? " • tercapai" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">MKG berjalan</dt>
                  <dd className="font-semibold tabular-nums">{mkg} tahun</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Gaji pokok</dt>
                  <dd className="font-semibold tabular-nums">{formatRupiah(salary)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Perkiraan KGB berikutnya</dt>
                  <dd className={`font-semibold tabular-nums ${kgbDue ? "text-warn-700" : ""}`}>
                    {nextKgb ? formatDate(nextKgb) : "—"}
                    {kgbDue ? " • jatuh tempo" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Kesiapan</dt>
                  <dd className="font-semibold">
                    {bupReached ? "Siap usulan pensiun" : "Belum BUP"}
                    {kgbDue ? " • KGB dapat diajukan" : ""}
                  </dd>
                </div>
              </dl>
            </div>

            {formError ? (
              <div className="mt-4">
                <ErrorBox message={formError} />
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : editing ? "Simpan perubahan" : "Buat akun"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-paper"
              >
                Batal
              </button>
            </div>
          </form>
        ) : null}

        <section className="rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
            <label className="block min-w-[220px] flex-1">
              <span className={LABEL_CLS}>Cari akun / pegawai</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Username, nama, NIP, atau nomor pegawai"
                className={INPUT_CLS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Role</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
                className={INPUT_CLS}
              >
                <option value="">Semua role</option>
                {roleOptions.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Status</span>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as "all" | "true" | "false")}
                className={INPUT_CLS}
              >
                <option value="all">Semua</option>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-paper"
            >
              Muat ulang
            </button>
          </div>

          {loading ? (
            <div className="p-4">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorBox message={error} onRetry={() => void load()} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Belum ada akun yang cocok"
                hint="Ubah filter atau buat akun baru untuk memulai."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Akun</th>
                    <th className="px-4 py-3 font-medium">Pegawai</th>
                    <th className="px-4 py-3 font-medium">Jabatan / Unit</th>
                    <th className="px-4 py-3 font-medium">Golongan / MKG</th>
                    <th className="px-4 py-3 font-medium">Usia / BUP</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => {
                    const employee = user.employee;
                    const birthDate = employee?.birthDate?.slice(0, 10) ?? "";
                    const userAge = birthDate ? fullYears(birthDate, today) : null;
                    const userBup = birthDate ? addYears(birthDate, 58) : "";
                    const userMkg =
                      employee?.rankTmt || employee?.joinDate
                        ? fullYears((employee.rankTmt ?? employee.joinDate ?? "").slice(0, 10), today)
                        : null;
                    return (
                      <tr key={user.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 align-top">
                          <span className="font-semibold">{user.username}</span>
                          <span
                            className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${ROLE_TONE[user.role]}`}
                          >
                            {roleOptions.find((r) => r.code === user.role)?.label ?? user.role}
                          </span>
                          {!user.isActive ? (
                            <span className="ml-1 mt-1 inline-flex rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium text-muted">
                              nonaktif
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-medium">{employee?.name ?? "—"}</span>
                          <span className="block text-xs text-muted">
                            {employee?.employeeNumber ?? "—"}
                            {employee?.nip ? ` • NIP ${employee.nip}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span>{user.position ?? employee?.position ?? "—"}</span>
                          <span className="block text-xs text-muted">
                            {user.orgUnit?.name ?? employee?.orgUnit?.name ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-medium">{employee?.rank ?? "—"}</span>
                          <span className="block text-xs text-muted">
                            {userMkg == null ? "MKG —" : `MKG ${userMkg} tahun`}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span>{userAge == null ? "—" : `${userAge} tahun`}</span>
                          <span className="block text-xs text-muted">
                            BUP {userBup ? formatDate(userBup) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                              user.isActive ? "bg-ok-100 text-ok-700" : "bg-paper text-muted"
                            }`}
                          >
                            {user.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEdit(user)}
                              className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-paper"
                            >
                              Ubah
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(user)}
                              className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-paper"
                            >
                              {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === user.id}
                              onClick={() => void removeUser(user)}
                              className="rounded-md border border-bad-700/25 bg-bad-100/50 px-2.5 py-1 text-xs font-medium text-bad-700 hover:bg-bad-100 disabled:opacity-50"
                            >
                              {deletingId === user.id ? "Menghapus…" : "Hapus"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </RequirePerm>
  );
}
