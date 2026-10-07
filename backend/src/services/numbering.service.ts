// Penomoran surat keluar: Kode Klasifikasi / No Urut / Unit / Bulan Romawi / Tahun
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function romanMonth(month1to12: number): string {
  return ROMAN[month1to12 - 1] ?? 'I';
}

export function formatLetterNumber(
  classificationCode: string,
  sequence: number,
  unitCode: string,
  letterDateYmd: string,
): string {
  const month = Number(letterDateYmd.slice(5, 7));
  const year = letterDateYmd.slice(0, 4);
  return `${classificationCode} / ${sequence} / ${unitCode} / ${romanMonth(month)} / ${year}`;
}

export function letterUnitCode(): string {
  return process.env.LETTER_UNIT_CODE ?? 'KT'; // Kecamatan Tamalate (SE Sekda Makassar)
}
