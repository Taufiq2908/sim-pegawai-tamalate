"use client";
import { FileButton } from "@/components/form";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch, apiUpload } from "@/lib/api";
import type { OutgoingLetter } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function SuratKeluarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<(OutgoingLetter & { documents?: Array<{ id: string; originalName: string }> }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<typeof detail>(`/outgoing-letters/${id}`);
      setDetail(data);
      if (data?.recipient) setRecipient(data.recipient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue() {
    if (!recipient.trim()) {
      toast.error("Tujuan surat wajib diisi.");
      return;
    }
    setActing("issue");
    try {
      const { data } = await apiFetch<typeof detail>(`/outgoing-letters/${id}/issue`, {
        method: "POST",
        body: JSON.stringify({ recipient: recipient.trim() }),
      });
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Penerbitan gagal");
    } finally {
      setActing(null);
    }
  }

  async function cancel() {
    if (cancelReason.trim().length < 5) {
      toast.error("Alasan pembatalan min 5 karakter.");
      return;
    }
    setActing("cancel");
    try {
      const { data } = await apiFetch<typeof detail>(`/outgoing-letters/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setDetail(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pembatalan gagal");
    } finally {
      setActing(null);
    }
  }

  async function upload() {
    if (!file) {
      toast.error("Pilih file dulu.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/outgoing-letters/${id}/documents`, fd);
      setFile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah gagal");
    } finally {
      setActing(null);
    }
  }

  return (
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.letterNumber}</h1>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Perihal</dt><dd className="font-medium">{detail.subject}</dd></div>
                <div><dt className="text-muted">Tujuan</dt><dd className="font-medium">{detail.recipient ?? "-"}</dd></div>
                <div><dt className="text-muted">Tanggal surat</dt><dd className="font-medium">{detail.letterDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-muted">Penandatangan</dt><dd className="font-medium">{detail.signerName ?? "-"}</dd></div>
                {detail.reservationReason ? <div><dt className="text-muted">Alasan reservasi</dt><dd className="font-medium">{detail.reservationReason}</dd></div> : null}
                {detail.cancelReason ? <div><dt className="text-muted">Alasan batal</dt><dd className="font-medium text-bad-700">{detail.cancelReason}</dd></div> : null}
              </dl>
            </div>

            {detail.status === "RESERVED" ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Terbitkan reservasi (nomor tetap)</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Tujuan surat*" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                  <button disabled={acting !== null} onClick={() => void issue()} className="rounded-lg bg-ok-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {acting === "issue" ? "…" : "Terbitkan"}
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <h3 className="text-sm font-semibold">atau batalkan reservasi</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Alasan pembatalan (min 5)*" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
                    <button disabled={acting !== null} onClick={() => void cancel()} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                      {acting === "cancel" ? "…" : "Batalkan"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="font-medium">{d.originalName}</li>
                ))}
              </ul>
              {detail.status !== "CANCELLED" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <FileButton hint="PDF/JPG/PNG, maks 10MB" onSelect={setFile} />
                  <button disabled={acting !== null} onClick={() => void upload()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-50">
                    {acting === "upload" ? "…" : "Unggah dokumen"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
