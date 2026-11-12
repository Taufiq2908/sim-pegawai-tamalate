import type { ParafHistoryEntry } from "@/lib/types";
import { ProcessTrail } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  PARAF: "Paraf",
  APPROVE: "Disetujui Camat",
  RETURN: "Dikembalikan",
  REJECT: "Ditolak",
};

function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

/** Riwayat paraf append-only. Bukti paraf adalah baris riwayat, bukan gambar. */
export function ParafHistoryPanel({ entries }: { entries?: ParafHistoryEntry[] | null }) {
  const rows = entries ?? [];
  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-semibold">Riwayat paraf</h2>
      <p className="mt-1 text-xs text-muted">
        Bukti paraf adalah baris riwayat yang tersimpan di server, bukan gambar tanda tangan.
      </p>
      <ProcessTrail
        items={rows.map((h, i) => ({
          title: `${ACTION_LABEL[h.action] ?? h.action} • Versi ${h.documentVersion}`,
          subtitle: [h.actor?.name, h.actor?.nip ? `NIP ${h.actor.nip}` : null, h.actor?.position]
            .filter(Boolean)
            .join(" • "),
          note: h.note,
          time: `${new Date(h.createdAt).toLocaleString("id-ID")} • Hash ${shortHash(h.documentHash)}`,
          state: i < rows.length - 1 ? "done" : "now",
        }))}
      />
    </div>
  );
}
