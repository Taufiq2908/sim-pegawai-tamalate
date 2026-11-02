"use client";

import { useState } from "react";

/** Kop resmi Kecamatan Tamalate — satu sumber untuk semua surat cetak. */
export function KopSurat({ compact = false }: { compact?: boolean }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <>
      <div className="flex items-center gap-3">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/logo-tamalate.png"
            alt="Logo Kecamatan Tamalate"
            className="h-20 w-20 shrink-0 object-contain"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-black text-center text-[10px] font-sans">
            LOGO
          </div>
        )}
        <div className="flex-1 text-center">
          <p className={compact ? "text-sm font-bold" : "text-base font-bold"}>PEMERINTAH KOTA MAKASSAR</p>
          <p className={compact ? "text-base font-bold" : "text-lg font-bold"}>KECAMATAN TAMALATE</p>
          <p className="text-xs">Jalan Danau Tanjung Bunga Utara No. 181 Makassar 90224</p>
          <p className="text-xs">Telp. +62411 - 879 249</p>
          <p className="text-xs">
            Email : tamalate.beker22@gmail.com&nbsp;&nbsp;Home page : http://www.kectamalate.com
          </p>
        </div>
      </div>
      <div className="mt-1 border-t-[3px] border-black" />
      <div className="mt-[2px] border-t border-black" />
    </>
  );
}
