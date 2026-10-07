export default function Home() {
  return (
    <main>
      <h1>SIMPEG-TAMALATE</h1>
      <p>Sistem Informasi Manajemen Kepegawaian — Kecamatan Tamalate.</p>
      <p>
        Backend: <code>{process.env.NEXT_PUBLIC_API_URL}</code> (lihat{" "}
        <code>docs/02-api-contract.md</code> di root repo).
      </p>
    </main>
  );
}
