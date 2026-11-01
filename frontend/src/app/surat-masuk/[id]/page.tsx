"use client";
import { FileButton } from "@/components/form";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { IncomingLetter } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function SuratMasukDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canRegister = hasPermission("letter.register");
  const canExpedition = hasPermission("letter.expedition");
  const [detail, setDetail] = useState<IncomingLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const [toUserId, setToUserId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [deadline, setDeadline] = useState("");
  const [targetCodes, setTargetCodes] = useState<string[]>([]);
  const [targets, setTargets] = useState<Array<{ code: string; name: string; available: boolean }>>([]);
  const [followNote, setFollowNote] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [expName, setExpName] = useState("");
  const [expSign, setExpSign] = useState("");
  const [expNote, setExpNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    apiFetch<Array<{ code: string; name: string; available: boolean }>>(
      "/letters/disposition-targets",
    )
      .then(({ data }) => setTargets(Array.isArray(data) ? data : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function toggleTarget(code: string) {
    setTargetCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function dispose() {
    if (!instruction.trim() || instruction.trim().length < 5) {
      toast.error("Isi instruksi minimal 5 karakter.");
      return;
    }
    if (!toUserId.trim() && targetCodes.length === 0) {
      toast.error("Pilih penerima atau tujuan disposisi.");
      return;
    }
    setActing("dispose");
    try {
      const body: Record<string, unknown> = {
        instruction: instruction.trim(),
        ...(deadline ? { deadline } : {}),
        ...(targetCodes.length ? { targetCodes } : {}),
        ...(toUserId.trim() ? { toUserIds: [toUserId.trim()] } : {}),
      };
      await apiFetch(`/letters/${id}/dispositions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToUserId("");
      setInstruction("");
      setDeadline("");
      setTargetCodes([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disposisi gagal");
    } finally {
      setActing(null);
    }
  }

  async function followup(dispId: string) {
    if (followNote.trim().length < 3) {
      toast.error("Catatan tindak lanjut wajib (min 3 karakter).");
      return;
    }
    setActing(dispId);
    try {
      await apiFetch(`/letters/dispositions/${dispId}/followup`, {
        method: "POST",
        body: JSON.stringify({ note: followNote.trim() }),
      });
      setFollowNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tindak lanjut gagal");
    } finally {
      setActing(null);
    }
  }

  async function simple(action: string, body: unknown) {
    setActing(action);
    try {
      const { data } = await apiFetch<IncomingLetter>(`/letters/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setActing(null);
    }
  }

  async function upload() {
    if (!file) {
      toast.error("Pilih file dulu (pdf/jpg/png, max 10MB).");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/letters/${id}/documents`, fd);
      setFile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah gagal");
    } finally {
      setActing(null);
    }
  }

  async function recordExpedition() {
    if (!expName.trim()) {
      toast.error("Nama penerima surat wajib diisi.");
      return;
    }
    setActing("expedition");
    try {
      const { data } = await apiFetch<{ regNumber: string }>(`/letters/${id}/expedition`, {
        method: "POST",
        body: JSON.stringify({
          receiverName: expName.trim(),
          signatureName: expSign.trim() || undefined,
          note: expNote.trim() || undefined,
        }),
      });
      toast.success(`Tanda terima dicatat: ${data.regNumber}`);
      setExpName("");
      setExpSign("");
      setExpNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat ekspedisi");
    } finally {
      setActing(null);
    }
  }

  const actions = detail?.availableActions ?? [];
  const canUpload = hasPermission("letter.document.upload") && actions.includes("upload");

  const activityLines = detail ? [
    detail.activityDate ? `Tanggal: ${detail.activityDate.slice(0, 10)}` : null,
    detail.activityStartTime ? `Mulai: ${detail.activityStartTime}` : null,
    detail.activityEndTime ? `Selesai: ${detail.activityEndTime}` : null,
    detail.activityLocation ? `Tempat: ${detail.activityLocation}` : null,
  ].filter(Boolean) : [];

  return (
    <RequirePerm perm="letter.view" label="Surat Masuk">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.agendaNumber}</h1>
                <StatusBadge status={detail.status} />
                {detail.archiveRecord ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Sudah diarsipkan ({detail.archiveRecord.archiveNumber})
                  </span>
                ) : null}
                <span className="text-xs text-muted">{detail.priority} • {detail.secrecy}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{detail.subject}</dd></div>
                <div><dt className="text-muted">Pengirim</dt><dd className="font-medium">{detail.sender} ({detail.letterNumber})</dd></div>
                <div><dt className="text-muted">Tanggal surat / diterima</dt><dd className="font-medium">{detail.letterDate?.slice(0, 10)} / {detail.receivedDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-muted">Ditujukan / PIC</dt><dd className="font-medium">{detail.addressedTo ?? "-"} / {detail.pic ?? "-"}</dd></div>
                {detail.summary ? <div className="sm:col-span-2"><dt className="text-muted">Ringkasan</dt><dd className="font-medium">{detail.summary}</dd></div> : null}
                {detail.classification ? (
                  <div className="sm:col-span-2"><dt className="text-muted">Klasifikasi</dt><dd className="font-medium">{detail.classification.code} — {detail.classification.name}</dd></div>
                ) : null}
                {activityLines.length ? (
                  <div className="sm:col-span-2"><dt className="text-muted">Kegiatan</dt><dd className="font-medium">{activityLines.join(" • ")}</dd></div>
                ) : null}
                {detail.assignedStaff?.length ? (
                  <div className="sm:col-span-2"><dt className="text-muted">Petugas agenda</dt><dd className="font-medium">{detail.assignedStaff.map((a) => a.name).join(", ")}</dd></div>
                ) : null}
                {detail.archiveRecord ? (
                  <div className="sm:col-span-2"><dt className="text-muted">Arsip</dt><dd className="font-medium">{detail.archiveRecord.archiveNumber}</dd></div>
                ) : null}
              </dl>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Rantai disposisi ({detail.dispositions?.length ?? 0})</h2>
              {(detail.dispositions ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-muted">Belum ada disposisi.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {(detail.dispositions ?? []).map((d) => (
                    <li key={d.id} className="rounded-lg bg-paper px-3 py-2 text-sm">
                      <p><b>{d.from.username}</b> → <b>{d.to.username}</b>{d.targetName ? ` (${d.targetName})` : ""} <StatusBadge status={d.status} /></p>
                      <p className="mt-1 text-muted">{d.instruction}</p>
                      {d.deadline ? <p className="text-xs text-muted">Batas: {d.deadline.slice(0, 10)}</p> : null}
                      {d.responseNote ? <p className="text-xs text-ok-700">Tindak lanjut: {d.responseNote}</p> : null}
                      {d.canFollowUp && d.status === "PENDING" ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={followNote}
                            onChange={(e) => setFollowNote(e.target.value)}
                            placeholder="Catatan tindak lanjut…"
                            className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-brand-700"
                          />
                          <button
                            disabled={acting !== null}
                            onClick={() => void followup(d.id)}
                            className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {acting === d.id ? "…" : "Selesai"}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}

              {actions.includes("dispose") ? (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-semibold">Teruskan disposisi</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      value={toUserId}
                      onChange={(e) => setToUserId(e.target.value)}
                      placeholder="UUID penerima spesifik (opsional)"
                      className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                    />
                    <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {targets.map((t) => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => void toggleTarget(t.code)}
                        className={`rounded-lg border p-2 text-sm transition ${
                          targetCodes.includes(t.code)
                            ? "bg-brand-900 border-brand-900 text-white"
                            : t.available ? "border-line bg-surface text-ink hover:bg-paper" : "border-line text-slate-400"
                        }`}
                        disabled={!t.available}
                      >
                        <div className="font-medium">{t.code}</div>
                        <div className="text-xs text-muted">{t.name}</div>
                        {!t.available ? <div className="text-xs text-muted">Tidak tersedia</div> : null}
                      </button>
                    ))}
                  </div>
                  <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Instruksi disposisi (min 5 karakter)*" rows={2} className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  <button disabled={acting !== null} onClick={() => void dispose()} className="mt-2 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "dispose" ? "Memproses…" : "Kirim disposisi"}
                  </button>
                </div>
              ) : null}

              {actions.includes("paraf") ? (
                <div className="mt-4 rounded-xl border border-warn-700/30 bg-warn-100 p-4">
                  <h3 className="text-sm font-semibold">Pemeriksaan Sekcam — paraf</h3>
                  <p className="mt-1 text-xs text-muted">Paraf hanya dari status RECEIVED. Catatan opsional.</p>
                  <button disabled={acting !== null} onClick={() => void simple("paraf", { note: completeNote || undefined })} className="mt-2 rounded-lg bg-warn-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "paraf" ? "Memproses…" : "Paraf & teruskan ke Camat"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-semibold">{d.originalName}</span>
                    <span className="text-xs text-muted">{d.mimeType || "berkas"} • {(d.sizeBytes / 1024).toFixed(1)} KB</span>
                    <a href={`/api${d.downloadUrl}`} className="ml-auto rounded-md border border-line bg-white px-2 py-1 text-[11px] font-medium text-brand-900 hover:bg-paper">Unduh</a>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? (
                  <li className="text-muted">Belum ada dokumen.</li>
                ) : null}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                {canUpload ? (
                  <>
                    <FileButton hint="PDF/JPG/PNG, maks 10MB" onSelect={setFile} />
                    <button disabled={acting !== null} onClick={() => void upload()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-50">
                      {acting === "upload" ? "…" : "Unggah dokumen"}
                    </button>
                  </>
                ) : null}
                <a href={`/surat-masuk/${detail.id}/lembar-disposisi`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                  Lembar disposisi (cetak)
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Penyelesaian & arsip</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {actions.includes("complete") ? (
                  <>
                    <input value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} placeholder="Catatan penyelesaian (opsional)" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                    <button disabled={acting !== null} onClick={() => void simple("complete", { note: completeNote || undefined })} className="rounded-lg bg-ok-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                      {acting === "complete" ? "…" : "Selesaikan"}
                    </button>
                  </>
                ) : null}
                {actions.includes("archive") ? (
                  <button disabled={acting !== null} onClick={() => void simple("archive", {})} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "archive" ? "…" : "Arsipkan"}
                  </button>
                ) : null}
                {!actions.includes("complete") && !actions.includes("archive") ? (
                  <p className="text-sm text-muted">Tidak ada aksi penyelesaian untuk Anda.</p>
                ) : null}
              </div>
              {canRegister ? (
                <div className="mt-3 border-t pt-3">
                  <button onClick={() => void router.push(`/surat-masuk/${detail.id}/agenda`)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper">
                    Atur agenda kegiatan & petugas
                  </button>
                </div>
              ) : null}
            </div>

            {canExpedition ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Buku ekspedisi — catat tanda terima</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="Nama penerima*" className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  <input value={expSign} onChange={(e) => setExpSign(e.target.value)} placeholder="Paraf / nama penandatangan" className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  <input value={expNote} onChange={(e) => setExpNote(e.target.value)} placeholder="Catatan (opsional)" className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                </div>
                <button disabled={acting !== null} onClick={() => void recordExpedition()} className="mt-2 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {acting === "expedition" ? "…" : "Catat tanda terima"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
