"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { ApiError } from "@/lib/api";
import { DocumentPreview } from "@/components/document-preview";
import { Field, FileButton } from "@/components/form";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type {
  Disposition,
  DispositionTarget,
  IncomingLetter,
  LetterDocument,
  NotificationItem,
} from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const STATUS_RANK: Record<string, number> = {
  DRAFT_TU: 1,
  REVIEW_SEKCAM: 2,
  DISPOSISI_CAMAT: 3,
  DITERUSKAN: 4,
  PROSES: 5,
  MENUNGGU_ARSIP: 6,
  DIARSIPKAN: 7,
};

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

async function resolveLetterId(dispId: string): Promise<string | null> {
  const { data: notifications } = await apiFetch<NotificationItem[]>("/notifications?page=1&limit=100");
  const linked = notifications.find((n) => n.referenceId === dispId);
  if (linked?.referenceType === "incoming_letter" && linked.referenceId) return linked.referenceId;

  const subject = linked?.title.replace(/^Disposisi baru:\s*/i, "").trim();
  if (subject) {
    const { data: letters } = await apiFetch<IncomingLetter[]>(`/letters?q=${encodeURIComponent(subject)}&limit=50`);
    const found = letters.find((l) => (l.dispositions ?? []).some((d) => d.id === dispId));
    if (found) return found.id;
  }

  const { data: letters } = await apiFetch<IncomingLetter[]>("/letters?limit=100");
  return letters.find((l) => (l.dispositions ?? []).some((d) => d.id === dispId))?.id ?? null;
}

export default function SuratMasukDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();

  const canRegister = hasPermission("letter.register");
  // Backend membatasi approver arsip ke Sekcam/Camat (atau SUPER_ADMIN),
  // meskipun permission archive.approve juga dimiliki jabatan LEADER lain.
  const archiveApprover =
    user?.role === "SUPER_ADMIN" || ["SEKCAM", "CAMAT"].includes(user?.position ?? "");
  const isSekcamUser = user?.role === "SUPER_ADMIN" || user?.position === "SEKCAM";
  const isCamatUser = user?.role === "SUPER_ADMIN" || user?.position === "CAMAT";
  const [detail, setDetail] = useState<IncomingLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [forwardNote, setForwardNote] = useState("");
  const [archiveNote, setArchiveNote] = useState("");
  const [followNotes, setFollowNotes] = useState<Record<string, string>>({});

  const [targets, setTargets] = useState<DispositionTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [deadline, setDeadline] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}`);
      setDetail(data);
    } catch (err) {
      const apiError = err as Partial<ApiError>;
      if (apiError.status === 404) {
        try {
          const resolved = await resolveLetterId(id);
          if (resolved && resolved !== id) {
            const { data } = await apiFetch<IncomingLetter>(`/letters/${resolved}`);
            setDetail(data);
            router.replace(`/surat-masuk/${resolved}`);
            return;
          }
        } catch {
          // fall through to the regular error message
        }
      }
      setError(err instanceof Error ? err.message : "Gagal memuat surat");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = detail?.availableActions ?? [];
  const canDispose = available.includes("dispose") && isCamatUser;
  const canSubmit = available.includes("submit");
  const canForward = available.includes("forward") && isSekcamUser;
  const canUpload = available.includes("upload");
  const canArchive = available.includes("archive") && archiveApprover;

  useEffect(() => {
    if (!canDispose) return;
    let alive = true;
    setTargetsLoading(true);
    apiFetch<DispositionTarget[]>("/letters/disposition-targets")
      .then(({ data }) => {
        if (alive) setTargets(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setTargets([]);
      })
      .finally(() => {
        if (alive) setTargetsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canDispose, detail?.id]);

  const dispositionGroups = useMemo(() => {
    const list = detail?.dispositions ?? [];
    return {
      selfNotes: list.filter((d) => d.from.id === d.to.id),
      targets: list.filter((d) => d.from.id !== d.to.id),
    };
  }, [detail]);

  const doneCount = dispositionGroups.targets.filter((d) => d.status === "DONE").length;
  const acceptedCount = dispositionGroups.targets.filter((d) => d.status === "ACCEPTED").length;
  const progress = dispositionGroups.targets.length
    ? Math.round((doneCount / dispositionGroups.targets.length) * 100)
    : 0;

  const earliestAccepted = dispositionGroups.targets
    .map((d) => d.acceptedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];

  const currentRank = detail ? STATUS_RANK[detail.status] ?? 0 : 0;
  const timeline = detail
    ? [
        { stage: 1, label: "Draft TU", description: "Surat dicatat oleh pelaksana/TU.", at: detail.createdAt },
        { stage: 2, label: "Diajukan ke Sekcam", description: "Berkas dikirim untuk pemeriksaan Sekcam.", at: detail.submittedAt },
        { stage: 3, label: "Diteruskan ke Camat", description: "Sekcam meneruskan surat kepada Camat.", at: undefined },
        { stage: 4, label: "Disposisi Camat", description: "Camat menentukan target dan instruksi disposisi.", at: detail.distributedAt },
        { stage: 5, label: "Diterima penerima", description: "Penerima disposisi menekan Terima & Baca.", at: earliestAccepted },
        { stage: 6, label: "Tindak lanjut selesai", description: "Semua target menyelesaikan disposisi.", at: detail.completedAt },
        { stage: 7, label: "Diarsipkan", description: "Sekcam/Camat menyetujui arsip.", at: detail.archiveRecord?.archiveDate },
      ]
    : [];

  async function run(action: string, fn: () => Promise<void>) {
    setActing(action);
    try {
      await fn();
      refreshNotificationBadge();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setActing(null);
    }
  }

  function uploadDocument() {
    if (!file) {
      toast.error("Pilih file terlebih dahulu.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File maksimal 10 MB.");
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      toast.error("File harus PDF, JPG, atau PNG.");
      return;
    }
    void run("upload", async () => {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload<LetterDocument>(`/letters/${id}/documents`, fd);
      setFile(null);
      toast.success("Dokumen ditambahkan.");
      await load();
    });
  }

  function submitLetter() {
    if (!detail?.documents?.length) {
      toast.error("Unggah file surat terlebih dahulu sebelum mengirim.");
      return;
    }
    if (!detail.summary?.trim()) {
      toast.error("Ringkasan isi belum diisi.");
      return;
    }
    if (!detail.classification) {
      toast.error("Klasifikasi arsip belum dipilih.");
      return;
    }
    void run("submit", async () => {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDetail(data);
      toast.success("Surat dikirim ke Sekcam.");
    });
  }

  function forwardLetter() {
    void run("forward", async () => {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}/forward`, {
        method: "POST",
        body: JSON.stringify({ note: forwardNote.trim() || undefined }),
      });
      setDetail(data);
      setForwardNote("");
      toast.success("Surat diteruskan ke Camat.");
    });
  }

  function disposeLetter() {
    if (selectedTargets.size === 0) {
      toast.error("Pilih minimal satu target disposisi.");
      return;
    }
    if (instruction.trim().length < 5) {
      toast.error("Isi disposisi minimal 5 karakter.");
      return;
    }
    void run("dispose", async () => {
      const { data } = await apiFetch<{ dispositions: Disposition[]; letter: IncomingLetter }>(
        `/letters/${id}/dispositions`,
        {
          method: "POST",
          body: JSON.stringify({
            instruction: instruction.trim(),
            targetCodes: Array.from(selectedTargets),
            deadline: deadline || undefined,
          }),
        },
      );
      setDetail(data.letter);
      setSelectedTargets(new Set());
      setInstruction("");
      setDeadline("");
      toast.success("Disposisi dikirim.");
    });
  }

  function acceptDisposition(d: Disposition) {
    void run(`accept-${d.id}`, async () => {
      const { data } = await apiFetch<IncomingLetter>(`/letters/dispositions/${d.id}/accept`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDetail(data);
      toast.success("Surat diterima dan tercatat di buku ekspedisi.");
    });
  }

  function completeDisposition(d: Disposition) {
    const note = (followNotes[d.id] ?? "").trim();
    if (note.length < 3) {
      toast.error("Catatan tindak lanjut minimal 3 karakter.");
      return;
    }
    void run(`complete-${d.id}`, async () => {
      const { data } = await apiFetch<{ disposition: Disposition; letter: IncomingLetter }>(
        `/letters/dispositions/${d.id}/followup`,
        { method: "POST", body: JSON.stringify({ note }) },
      );
      setDetail(data.letter);
      setFollowNotes((prev) => ({ ...prev, [d.id]: "" }));
      toast.success("Tindak lanjut dicatat.");
    });
  }

  function archiveLetter() {
    void run("archive", async () => {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ notes: archiveNote.trim() || undefined }),
      });
      setDetail(data);
      setArchiveNote("");
      toast.success("Surat diarsipkan.");
    });
  }

  function toggleTarget(code: string) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <RequirePerm perm="letter.view" label="Detail Surat Masuk">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper"
        >
          ← Kembali
        </button>
        {canRegister && detail && detail.status !== "DIARSIPKAN" ? (
          <Link
            href={`/surat-masuk/${detail.id}/agenda`}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper"
          >
            Atur agenda
          </Link>
        ) : null}
        <Link
          href={`/surat-masuk/${id}/lembar-disposisi`}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper"
        >
          Lembar disposisi
        </Link>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.agendaNumber}</h1>
                <StatusBadge status={detail.status} />
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-secondary">
                  {detail.letterType === "UNDANGAN" ? "Undangan" : "Biasa"}
                </span>
                {detail.archiveRecord ? (
                  <span className="rounded-full bg-ok-100 px-2 py-0.5 text-xs font-semibold text-ok-700">
                    Diarsipkan ({detail.archiveRecord.archiveNumber})
                  </span>
                ) : null}
                <span className="text-xs text-muted">
                  {detail.priority} • {detail.secrecy}
                </span>
              </div>
              <h2 className="mt-2 text-base font-semibold">{detail.subject}</h2>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Pengirim" value={detail.sender} />
                <Info label="Nomor surat" value={detail.letterNumber} />
                <Info label="Tanggal surat" value={fmtDate(detail.letterDate)} />
                <Info label="Tanggal diterima" value={fmtDate(detail.receivedDate)} />
                <Info label="Ditujukan ke" value={detail.addressedTo ?? "—"} />
                <Info label="Penanggung jawab" value={detail.pic ?? "—"} />
                <Info label="Klasifikasi" value={detail.classification ? `${detail.classification.code} — ${detail.classification.name}` : "—"} />
                <Info label="Keterangan" value={detail.remarks ?? "—"} />
              </div>
              {detail.summary ? (
                <div className="mt-4 rounded-lg bg-paper p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Ringkasan isi</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detail.summary}</p>
                </div>
              ) : null}
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
              <section className="rounded-lg border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Progres disposisi</h2>
                  <span className="text-sm text-muted">
                    {doneCount} selesai • {acceptedCount} diterima • {dispositionGroups.targets.length} target
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-brand-800 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{progress}% target disposisi selesai.</p>

                <div className="mt-5 divide-y divide-line">
                  {dispositionGroups.targets.length === 0 ? (
                    <p className="py-4 text-sm text-muted">Belum ada disposisi target.</p>
                  ) : (
                    dispositionGroups.targets.map((d) => (
                      <div key={d.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {d.targetName ?? d.targetCode ?? d.to.username}
                          </span>
                          <span className="text-xs text-muted">@{d.to.username}</span>
                          <StatusBadge status={d.status} />
                          {d.deadline ? <span className="text-xs text-muted">Batas {fmtDate(d.deadline)}</span> : null}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{d.instruction}</p>
                        <p className="mt-1 text-xs text-muted">
                          Dikirim {fmtDateTime(d.createdAt)}
                          {d.acceptedAt ? ` • Dibaca ${fmtDateTime(d.acceptedAt)}` : ""}
                          {d.respondedAt ? ` • Selesai ${fmtDateTime(d.respondedAt)}` : ""}
                        </p>
                        {d.responseNote ? (
                          <p className="mt-2 rounded-md bg-paper px-2.5 py-2 text-sm">
                            <span className="font-medium">Tindak lanjut: </span>
                            {d.responseNote}
                          </p>
                        ) : null}

                        {d.canAccept ? (
                          <button
                            type="button"
                            disabled={acting !== null}
                            onClick={() => acceptDisposition(d)}
                            className="mt-2 rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                          >
                            {acting === `accept-${d.id}` ? "Memproses…" : "Terima & Baca"}
                          </button>
                        ) : null}

                        {d.canComplete || d.canFollowUp ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={followNotes[d.id] ?? ""}
                              onChange={(e) => setFollowNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                              rows={2}
                              placeholder="Catatan tindak lanjut (wajib, minimal 3 karakter)"
                              className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                            />
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => completeDisposition(d)}
                              className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                            >
                              {acting === `complete-${d.id}` ? "Memproses…" : "Selesai & Ajukan Arsip"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Alur surat</h2>
                <ol className="mt-4 space-y-0">
                  {timeline.map((step, index) => {
                    const done = currentRank > step.stage;
                    const current = currentRank === step.stage;
                    return (
                      <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < timeline.length - 1 ? (
                          <span
                            aria-hidden
                            className={`absolute left-[9px] top-5 h-[calc(100%-8px)] w-px ${done || current ? "bg-brand-800" : "bg-line"}`}
                          />
                        ) : null}
                        <span
                          className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                            done
                              ? "border-brand-800 bg-brand-900 text-white"
                              : current
                                ? "border-brand-800 bg-surface text-brand-900"
                                : "border-line bg-surface text-muted"
                          }`}
                        >
                          {done ? "✓" : step.stage}
                        </span>
                        <div className={current ? "text-ink" : done ? "text-secondary" : "text-muted"}>
                          <p className="text-sm font-medium">{step.label}</p>
                          <p className="text-xs">{step.description}</p>
                          {step.at ? <p className="mt-0.5 text-[11px] text-muted">{fmtDateTime(step.at)}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Tindakan</h2>

              {canSubmit ? (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">Kirim ke Sekcam</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Pastikan berkas, ringkasan, dan klasifikasi sudah lengkap.
                  </p>
                  <button
                    type="button"
                    disabled={acting !== null}
                    onClick={submitLetter}
                    className="mt-2 rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "submit" ? "Mengirim…" : "Simpan & Kirim ke Sekcam"}
                  </button>
                </div>
              ) : null}

              {canUpload ? (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">Unggah dokumen</p>
                  <p className="mt-0.5 text-xs text-muted">Hanya saat status Draft TU.</p>
                  <div className="mt-2">
                    <FileButton hint="PDF/JPG/PNG, maksimal 10 MB." onSelect={setFile} />
                  </div>
                  <button
                    type="button"
                    disabled={acting !== null || !file}
                    onClick={uploadDocument}
                    className="mt-2 rounded-lg border border-line bg-field px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-50"
                  >
                    {acting === "upload" ? "Mengunggah…" : "Unggah dokumen"}
                  </button>
                </div>
              ) : null}

              {canForward ? (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">Teruskan ke Camat</p>
                  <textarea
                    value={forwardNote}
                    onChange={(e) => setForwardNote(e.target.value)}
                    rows={2}
                    placeholder="Catatan untuk Camat (opsional)"
                    className="mt-2 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  <button
                    type="button"
                    disabled={acting !== null}
                    onClick={forwardLetter}
                    className="mt-2 rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "forward" ? "Meneruskan…" : "Teruskan ke Camat"}
                  </button>
                </div>
              ) : null}

              {canDispose ? (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Disposisi Camat</p>
                      <p className="mt-0.5 text-xs text-muted">Centang tujuan, lalu tulis satu instruksi untuk semua target.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTargets(
                          new Set(targets.filter((t) => t.available).map((t) => t.code)),
                        )
                      }
                      className="text-xs font-semibold text-brand-800 hover:underline"
                    >
                      Pilih semua tujuan tersedia
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {targetsLoading ? (
                      <p className="text-sm text-muted">Memuat tujuan disposisi…</p>
                    ) : targets.length === 0 ? (
                      <p className="text-sm text-muted">Tujuan disposisi belum tersedia.</p>
                    ) : (
                      targets.map((t) => (
                        <label
                          key={t.code}
                          className={`cursor-pointer rounded-lg border p-2.5 text-sm ${
                            !t.available
                              ? "cursor-not-allowed border-line bg-paper text-muted"
                              : selectedTargets.has(t.code)
                                ? "border-brand-900 bg-brand-900 text-white"
                                : "border-line bg-surface hover:bg-paper"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            disabled={!t.available}
                            checked={selectedTargets.has(t.code)}
                            onChange={() => toggleTarget(t.code)}
                          />
                          <span className="block font-medium">{t.name}</span>
                          <span className={`block text-xs ${selectedTargets.has(t.code) ? "text-white/75" : "text-muted"}`}>
                            {t.available ? `${t.recipients.length} penerima aktif` : "Belum ada penerima aktif"}
                          </span>
                          {t.recipients.length ? (
                            <span className={`mt-1 block truncate text-[11px] ${selectedTargets.has(t.code) ? "text-white/70" : "text-muted"}`}>
                              {t.recipients.map((r) => r.name).join(", ")}
                            </span>
                          ) : null}
                        </label>
                      ))
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
                    <Field label="Instruksi disposisi*">
                      <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        rows={3}
                        placeholder="Contoh: Tindak lanjuti dan laporkan hasilnya."
                        className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                      />
                    </Field>
                    <Field label="Batas waktu">
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={acting !== null}
                    onClick={disposeLetter}
                    className="mt-2 rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "dispose" ? "Mengirim…" : "Kirim disposisi"}
                  </button>
                </div>
              ) : null}

              {canArchive ? (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">Persetujuan arsip</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Surat sudah antre arsip. Setujui di sini atau buka antrean untuk menolak dengan catatan.
                  </p>
                  <textarea
                    value={archiveNote}
                    onChange={(e) => setArchiveNote(e.target.value)}
                    rows={2}
                    placeholder="Catatan arsip (opsional)"
                    className="mt-2 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={archiveLetter}
                      className="rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      {acting === "archive" ? "Memproses…" : "Setujui & Arsipkan"}
                    </button>
                    <Link
                      href="/arsip?tab=antrean"
                      className="rounded-lg border border-line bg-field px-3 py-2 text-sm font-medium hover:bg-paper"
                    >
                      Buka antrean arsip
                    </Link>
                  </div>
                </div>
              ) : null}

              {!canSubmit && !canUpload && !canForward && !canDispose && !canArchive &&
              !dispositionGroups.targets.some((d) => d.canAccept || d.canComplete) ? (
                <p className="mt-3 text-sm text-muted">Tidak ada tindakan yang tersedia untuk akun ini.</p>
              ) : null}
            </section>

            {dispositionGroups.selfNotes.length ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Catatan Sekcam</h2>
                <div className="mt-2 space-y-2">
                  {dispositionGroups.selfNotes.map((d) => (
                    <div key={d.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                      <p>{d.instruction}</p>
                      <p className="mt-1 text-xs text-muted">{fmtDateTime(d.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen</h2>
              <div className="mt-2 space-y-2">
                {detail.documents?.length ? (
                  detail.documents.map((doc) => <DocumentPreview key={doc.id} document={doc} />)
                ) : (
                  <p className="text-sm text-muted">Belum ada dokumen.</p>
                )}
              </div>
            </section>

            {detail.letterType === "UNDANGAN" ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Kegiatan undangan</h2>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Tanggal kegiatan" value={fmtDate(detail.activityDate)} />
                  <Info label="Waktu" value={detail.activityStartTime ? `${detail.activityStartTime}${detail.activityEndTime ? ` – ${detail.activityEndTime}` : ""}` : "—"} />
                  <Info label="Tempat" value={detail.activityLocation ?? "—"} />
                  <Info label="Petugas agenda" value={detail.assignedStaff?.map((s) => s.name).join(", ") || "—"} />
                </div>
              </section>
            ) : null}

            <p className="text-xs text-muted">
              Status surat diperbarui otomatis oleh backend setelah setiap tindakan.
            </p>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
    </div>
  );
}
