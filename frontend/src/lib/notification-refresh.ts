/** Meminta shell memperbarui badge notifikasi setelah aksi workflow. */
export function refreshNotificationBadge() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications:refresh"));
  }
}
