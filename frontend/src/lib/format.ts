export function formatRupiah(n: number): string {
  return "Rp" + Number(n).toLocaleString("id-ID");
}
