"use client";

import { useEffect, useRef, useState } from "react";
import { loadSignature, saveSignature, clearSignature } from "@/lib/signature";
import { toast } from "@/components/toast";

/** Papan gambar tanda tangan. Simpan → dataURL PNG ke localStorage per username. */
export function SignaturePad({ username, onSaved }: { username: string; onSaved?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  function setup() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = 160;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#141b22";
    const existing = loadSignature(username);
    if (existing) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setEmpty(false);
      };
      img.src = existing;
    }
  }

  useEffect(() => {
    setup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-40 w-full cursor-crosshair touch-none rounded-lg border border-dashed border-line bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
        }}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) {
              ctx.clearRect(0, 0, canvas.clientWidth, 160);
              setEmpty(true);
            }
          }}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
        >
          Hapus
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            saveSignature(username, canvas.toDataURL("image/png"));
            toast.success("Tanda tangan tersimpan di browser ini.");
            onSaved?.();
          }}
          className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Simpan tanda tangan
        </button>
        <button
          type="button"
          onClick={() => {
            clearSignature(username);
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.clientWidth, 160);
            setEmpty(true);
            onSaved?.();
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-bad-700"
        >
          Buang
        </button>
      </div>
    </div>
  );
}
