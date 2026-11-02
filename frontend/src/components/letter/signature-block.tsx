"use client";

import { formatTanggalSurat } from "@/lib/letter";

/** Blok tanda tangan dengan data dari backend/timeline, bukan nama hardcode. */
export function SignatureBlock({
  heading,
  name,
  nip,
  rank,
  signature,
  signedAt,
  className = "",
}: {
  heading: string;
  name?: string | null;
  nip?: string | null;
  rank?: string | null;
  signature?: string | null;
  signedAt?: string | null;
  className?: string;
}) {
  return (
    <div className={`w-72 text-center ${className}`}>
      <p className="font-bold">{heading}</p>
      {signature ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signature} alt={`Tanda tangan ${name ?? heading}`} className="mx-auto h-16 object-contain" />
      ) : (
        <div className="h-16" />
      )}
      <p className="font-bold underline">{name || "................"}</p>
      <p>Pangkat : {rank || "................"}</p>
      <p>Nip. {nip || "................"}</p>
      {signature && signedAt ? (
        <p className="mt-1 text-[11px]">
          Ditandatangani secara elektronik pada {formatTanggalSurat(signedAt)} (dummy, browser penandatangan).
        </p>
      ) : null}
    </div>
  );
}
