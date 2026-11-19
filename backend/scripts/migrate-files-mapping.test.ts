import assert from 'node:assert/strict';
import {
  documentObjectKey,
  safeExtension,
  uploadsRelativePath,
} from '../src/lib/migrate-paths';

/**
 * Uji murni pemetaan path migrasi berkas (tanpa DB/AWS/Supabase).
 * Jalankan: npx tsx scripts/migrate-files-mapping.test.ts
 */

let total = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  assert.deepEqual(actual, expected, name);
  total += 1;
}

check('ekstensi dari nama asli', safeExtension('Surat.PDF', 'uploads/x'), '.pdf');
check('ekstensi dari path bila nama kosong', safeExtension('', 'C:\\a\\b.JPG'), '.jpg');
check('ekstensi tanpa titik', safeExtension('tanpa-ekstensi', 'uploads/x'), '');
check('tanpa karakter aneh', safeExtension('a.p<n>g', 'uploads/x'), '.png');

check('relatif backslash', uploadsRelativePath('uploads\\a.pdf'), 'a.pdf');
check('relatif slash', uploadsRelativePath('./uploads/a.pdf'), 'a.pdf');
check('absolut linux', uploadsRelativePath('/opt/simpeg/uploads/2026/a.pdf'), '2026/a.pdf');
check('absolut windows', uploadsRelativePath('D:\\proj\\backend\\uploads\\x y.jpg'), 'x y.jpg');
check('bukan path uploads', uploadsRelativePath('supabase://bucket/key.pdf'), null);
check('traversal ditolak', uploadsRelativePath('uploads/../etc/passwd'), null);
check('folder uploads kosong', uploadsRelativePath('/opt/simpeg/uploads/'), null);
check('path kosong', uploadsRelativePath(''), null);

check(
  'key final cuti',
  documentObjectKey('leave/abc', 'doc-1', 'Surat.PDF', 'uploads/x'),
  'leave/abc/doc-1.pdf',
);
check(
  'key final foto apel',
  documentObjectKey('attendance/2026-01-02/pagi', 'foto-1', '', 'uploads/x.jpg'),
  'attendance/2026-01-02/pagi/foto-1.jpg',
);
check(
  'key final pensiun',
  documentObjectKey('pension/b1/items/i1', 'doc-9', 'berkas', 'uploads/berkas.pdf'),
  'pension/b1/items/i1/doc-9.pdf',
);

console.log(`OK ${total} kasus pemetaan path.`);
