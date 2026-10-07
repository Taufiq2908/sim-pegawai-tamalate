export const MAKASSAR_OFFSET_MIN = 8 * 60; // WITA tetap UTC+8

export function deadlineMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m) return 450; // fallback 07:30
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

// Wall-clock Makassar dari sebuah instant.
export function makassarParts(d: Date): { ymd: string; minutes: number } {
  const shifted = new Date(d.getTime() + MAKASSAR_OFFSET_MIN * 60000);
  return {
    ymd: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function todayYMD(now = new Date()): string {
  return makassarParts(now).ymd;
}

export function autoStatus(now: Date, deadline: number): 'HADIR' | 'TERLAMBAT' {
  return makassarParts(now).minutes <= deadline ? 'HADIR' : 'TERLAMBAT';
}

export function parseYMD(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return null;
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(+d) ? null : d;
}

// "2026-10-07" + "07:05" (WITA) -> instant UTC untuk kolom timestamptz.
export function checkInUTC(ymd: string, hhmm: string): Date | null {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(
    `${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`,
  );
  return isNaN(+d) ? null : d;
}

// 0=Min..6=Sab dalam zona WITA. Jumat=5.
export function makassarWeekday(d: Date): number {
  return new Date(d.getTime() + MAKASSAR_OFFSET_MIN * 60000).getUTCDay();
}

export function isFridayWita(d: Date): boolean {
  return makassarWeekday(d) === 5;
}

export function hhmmWita(d: Date | null): string | null {
  if (!d) return null;
  const m = makassarParts(d).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Senin–Jumat pada pekan yang memuat tanggal WITA ts (ts = UTC midnight).
export function workdaysOfWeek(weekStartYmd: string): string[] {
  const days: string[] = [];
  const base = new Date(weekStartYmd + 'T00:00:00Z').getTime();
  for (let i = 0; i < 5; i++) {
    days.push(new Date(base + i * 86400000).toISOString().slice(0, 10));
  }
  return days;
}
