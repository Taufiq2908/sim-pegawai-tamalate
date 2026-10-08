"use client";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { IncomingLetter } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";
export default function SuratMasukDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canExpedition = hasPermission("letter.expedition");
  const [detail, setDetail] = useState<IncomingLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const [toUserId, setToUserId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<Array<{ id: string; username: string }>>([]);
  const [instruction, setInstruction] = useState("");
  const [deadline, setDeadline] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [targets, setTargets] = useState<Array<{ code: string; name: string }>>([]);
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
    apiFetch<Array<{ code: string; name: string }>>("/letters/disposition-targets")
      .then(({ data }) => setTargets(Array.isArray(data) ? data : []))
      .catch(() => {});
    apiFetch<Array<{ id: string; username: string }>>("/users?limit=50&active=true")
      .then(({ data }) => setUserOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function dispose() {
    if (!toUserId.trim() || instruction.trim().length < 5) {
      toast.error("Pilih penerima dan isi instruksi minimal 5 karakter.");
      return;
    }
    setActing("dispose");
    try {
      await apiFetch(`/letters/${id}/dispose`, {
        method: "POST",
        body: JSON.stringify({
          toUserId: toUserId.trim(),
          instruction: instruction.trim(),
          deadline: deadline || undefined,
          targetCode: targetCode || undefined,
        }),
      });
      setToUserId("");
      setInstruction("");
      setDeadline("");
      setTargetCode("");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat ekspedisi");
    } finally {
      setActing(null);
    }
  }

  const actions = detail?.availableActions ?? [];

  return (
    <AppShell>
      <button onClick={() => router.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
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
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.agendaNumber}</h1>
                <StatusBadge status={detail.status} />
                <span className="text-xs text-slate-500">{detail.priority} • {detail.secrecy}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Perihal</dt><dd className="font-medium">{detail.subject}</dd></div>
                <div><dt className="text-slate-500">Pengirim</dt><dd className="font-medium">{detail.sender} ({detail.letterNumber})</dd></div>
                <div><dt className="text-slate-500">Tanggal surat / diterima</dt><dd className="font-medium">{detail.letterDate?.slice(0, 10)} / {detail.receivedDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-slate-500">Ditujukan / PIC</dt><dd className="font-medium">{detail.addressedTo ?? "-"} / {detail.pic ?? "-"}</dd></div>
                {detail.summary ? <div className="sm:col-span-2"><dt className="text-slate-500">Ringkasan</dt><dd className="font-medium">{detail.summary}</dd></div> : null}
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Rantai disposisi ({detail.dispositions?.length ?? 0})</h2>
              {(detail.dispositions ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Belum ada disposisi.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {(detail.dispositions ?? []).map((d) => (
                    <li key={d.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <p><b>{d.from.username}</b> → <b>{d.to.username}</b>{d.targetName ? ` (${d.targetName})` : ""} <StatusBadge status={d.status} /></p>
                      <p className="mt-1 text-slate-600">{d.instruction}</p>
                      {d.deadline ? <p className="text-xs text-slate-500">Batas: {d.deadline.slice(0, 10)}</p> : null}
                      {d.responseNote ? <p className="text-xs text-green-700">Tindak lanjut: {d.responseNote}</p> : null}
                      {d.canFollowUp && d.status === "PENDING" ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={followNote}
                            onChange={(e) => setFollowNote(e.target.value)}
                            placeholder="Catatan tindak lanjut…"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
                          />
                          <button
                            disabled={acting !== null}
                            onClick={() => void followup(d.id)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
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
                    {userOptions.length > 0 ? (
                      <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900">
                        <option value="">— pilih penerima —</option>
                        {userOptions
                          .filter((u) => !userQuery || u.username.toLowerCase().includes(userQuery.toLowerCase()))
                          .map((u) => (
                            <option key={u.id} value={u.id}>{u.username}</option>
                          ))}
                      </select>
                    ) : (
                      <input value={toUserId} onChange={(e) => setToUserId(e.target.value)} placeholder="UUID user penerima*" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                    )}
                    <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                  </div>
                  {userOptions.length > 0 ? (
                    <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Cari username penerima…" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-900" />
                  ) : null}
                  <select value={targetCode} onChange={(e) => setTargetCode(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900">
                    <option value="">— tujuan jabatan (opsional, no. 10 = lainnya) —</option>
                    {targets.map((t) => (
                      <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                    ))}
                  </select>
                  <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Instruksi disposisi (min 5 karakter)*" rows={2} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                  <button disabled={acting !== null} onClick={() => void dispose()} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "dispose" ? "Memproses…" : "Kirim disposisi"}
                  </button>
                </div>
              ) : null}

              {actions.includes("paraf") ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold">Pemeriksaan Sekcam — paraf</h3>
                  <p className="mt-1 text-xs text-slate-600">Paraf hanya dari status RECEIVED. Catatan opsional.</p>
                  <button disabled={acting !== null} onClick={() => void simple("paraf", { note: completeNote || undefined })} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "paraf" ? "Memproses…" : "Paraf & teruskan ke Camat"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Penyelesaian & arsip</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {actions.includes("complete") ? (
                  <>
                    <input value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} placeholder="Catatan penyelesaian (opsional)" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                    <button disabled={acting !== null} onClick={() => void simple("complete", { note: completeNote || undefined })} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {acting === "complete" ? "…" : "Selesaikan"}
                    </button>
                  </>
                ) : null}
                {actions.includes("archive") ? (
                  <button disabled={acting !== null} onClick={() => void simple("archive", {})} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "archive" ? "…" : "Arsipkan"}
                  </button>
                ) : null}
                {!actions.includes("complete") && !actions.includes("archive") ? (
                  <p className="text-sm text-slate-500">Tidak ada aksi penyelesaian untuk Anda.</p>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
                <button disabled={acting !== null} onClick={() => void upload()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                  {acting === "upload" ? "…" : "Unggah dokumen"}
                </button>
                <a href={`/surat-masuk/${detail.id}/lembar-disposisi`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline">
                  Lembar disposisi (cetak)
                </a>
              </div>
            </div>

            {canExpedition ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold">Buku ekspedisi — catat tanda terima</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="Nama penerima*" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                  <input value={expSign} onChange={(e) => setExpSign(e.target.value)} placeholder="Paraf / nama penandatangan" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                  <input value={expNote} onChange={(e) => setExpNote(e.target.value)} placeholder="Catatan (opsional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
                </div>
                <button disabled={acting !== null} onClick={() => void recordExpedition()} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {acting === "expedition" ? "…" : "Catat tanda terima"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
