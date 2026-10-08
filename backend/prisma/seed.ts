import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

const PERMS = [
  ['auth.me', 'auth', 'me'],
  ['user.view', 'user', 'view'],
  ['user.manage', 'user', 'manage'],
  ['employee.view', 'employee', 'view'],
  ['employee.manage', 'employee', 'manage'],
  ['master.view', 'master', 'view'],
  ['leave.view', 'leave', 'view'],
  ['leave.create', 'leave', 'create'],
  ['leave.submit', 'leave', 'submit'],
  ['leave.verify', 'leave', 'verify'],
  ['leave.revise', 'leave', 'revise'],
  ['leave.paraf', 'leave', 'paraf'],
  ['leave.approve', 'leave', 'approve'],
  ['leave.reject', 'leave', 'reject'],
  ['leave.sign', 'leave', 'sign'],
  ['leave.document.upload', 'leave', 'document.upload'],
  ['attendance.view', 'attendance', 'view'],
  ['attendance.checkin', 'attendance', 'checkin'],
  ['attendance.manage', 'attendance', 'manage'],
  ['attendance.summary', 'attendance', 'summary'],
  ['letter.view', 'letter', 'view'],
  ['letter.create', 'letter', 'create'],
  ['letter.dispose', 'letter', 'dispose'],
  ['letter.followup', 'letter', 'followup'],
  ['letter.complete', 'letter', 'complete'],
  ['letter.archive', 'letter', 'archive'],
  ['letter.document.upload', 'letter', 'document.upload'],
  ['kgb.view', 'kgb', 'view'],
  ['kgb.create', 'kgb', 'create'],
  ['kgb.submit', 'kgb', 'submit'],
  ['kgb.verify', 'kgb', 'verify'],
  ['kgb.revise', 'kgb', 'revise'],
  ['kgb.paraf', 'kgb', 'paraf'],
  ['kgb.approve', 'kgb', 'approve'],
  ['kgb.reject', 'kgb', 'reject'],
  ['kgb.document.upload', 'kgb', 'document.upload'],
  ['leave.forward', 'leave', 'forward'],
  ['letter.expedition', 'letter', 'expedition'],
  ['letter.paraf', 'letter', 'paraf'],
  ['leave.receive', 'leave', 'receive'],
  ['leave.register', 'leave', 'register'],
  ['letter.register', 'letter', 'register'],
  ['outgoing.view', 'outgoing', 'view'],
  ['outgoing.create', 'outgoing', 'create'],
  ['outgoing.reserve', 'outgoing', 'reserve'],
  ['outgoing.issue', 'outgoing', 'issue'],
  ['outgoing.cancel', 'outgoing', 'cancel'],
] as const;

const ROLE_MAP: Record<string, string[]> = {
  // VERIFIER basis = operator (Staf Kepegawaian/Arsip). Pemeriksa (Kasubag) via GRANT per user.
  VERIFIER: ['auth.me', 'user.view', 'employee.view', 'leave.view', 'leave.receive', 'leave.register', 'leave.document.upload', 'attendance.view', 'attendance.manage', 'letter.view', 'letter.create', 'letter.register', 'letter.document.upload', 'letter.expedition', 'letter.archive', 'kgb.view', 'kgb.document.upload', 'outgoing.view', 'outgoing.create', 'outgoing.reserve', 'outgoing.issue', 'outgoing.cancel'],
  LEADER: ['auth.me', 'user.view', 'employee.view', 'leave.view', 'leave.create', 'leave.submit', 'leave.document.upload', 'leave.paraf', 'leave.approve', 'leave.reject', 'leave.forward', 'attendance.view', 'attendance.summary', 'letter.view', 'letter.dispose', 'letter.followup', 'letter.complete', 'letter.paraf', 'kgb.view', 'kgb.paraf', 'kgb.approve', 'kgb.reject', 'outgoing.view'],
  EMPLOYEE: ['auth.me', 'leave.view', 'leave.create', 'leave.submit', 'leave.document.upload', 'attendance.view', 'attendance.checkin', 'letter.view', 'letter.followup', 'kgb.view', 'kgb.create', 'kgb.submit', 'kgb.document.upload'],
};

// Hak pemeriksa Kasubag (di-GRANT ke user position KASUBAG).
const KASUBAG_GRANTS = ['leave.verify', 'leave.revise', 'leave.reject', 'leave.forward', 'attendance.summary', 'kgb.verify', 'kgb.revise', 'kgb.reject'];

async function main() {
  for (const [code, resource, action] of PERMS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, resource, action } });
  }
  for (const code of ['SUPER_ADMIN', 'VERIFIER', 'LEADER', 'EMPLOYEE'] as const) {
    await prisma.role.upsert({ where: { code }, update: {}, create: { code, name: code } });
  }
  // role_permissions (SUPER_ADMIN = semua via bypass, tetap isi penuh agar eksplisit).
  // Sinkronisasi penuh: link yang tidak lagi di ROLE_MAP dihapus (mis. setelah split operator/Kasubag).
  const allPerms = await prisma.permission.findMany();
  for (const rp of await prisma.role.findMany()) {
    const codes = rp.code === 'SUPER_ADMIN' ? allPerms.map((p) => p.code) : ROLE_MAP[rp.code] ?? [];
    const wantedIds: string[] = [];
    for (const c of codes) {
      const p = allPerms.find((x) => x.code === c)!;
      wantedIds.push(p.id);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: rp.id, permissionId: p.id } },
        update: {},
        create: { roleId: rp.id, permissionId: p.id },
      });
    }
    if (rp.code !== 'SUPER_ADMIN') {
      await prisma.rolePermission.deleteMany({
        where: { roleId: rp.id, permissionId: { notIn: wantedIds } },
      });
    }
  }

  const org = await prisma.organizationalUnit.upsert({
    where: { code: 'KEC-TAMALATE' },
    update: {},
    create: { code: 'KEC-TAMALATE', name: 'Kecamatan Tamalate', type: 'KECAMATAN' },
  });

  // 11 kelurahan (SE Sekda Makassar) — untuk kolom unit_kerja saat impor pegawai
  const kelurahan: Array<[string, string]> = [
    ['KB', 'Kelurahan Bongaya'],
    ['KBB', 'Kelurahan Balang Baru'],
    ['KBR', 'Kelurahan Barombong'],
    ['KJ', 'Kelurahan Jongaya'],
    ['KM', 'Kelurahan Mangasa'],
    ['KMN', 'Kelurahan Manuruki'],
    ['KMS', 'Kelurahan Maccini Sombala'],
    ['KPT', 'Kelurahan Parang Tambung'],
    ['BTD', 'Kelurahan Bonto Duri'],
    ['KPB', "Kelurahan Pa'baeng-baeng"],
    ['TJM', 'Kelurahan Tanjung Merdeka'],
  ];
  for (const [code, name] of kelurahan) {
    await prisma.organizationalUnit.upsert({
      where: { code },
      update: { name, parentId: org.id },
      create: { code, name, type: 'KELURAHAN', parentId: org.id },
    });
  }

  for (const lt of [
    { code: 'TAHUNAN', name: 'Cuti Tahunan', maxDays: 12 },
    { code: 'BESAR', name: 'Cuti Besar', maxDays: 90 },
    { code: 'SAKIT', name: 'Cuti Sakit', requiresDocument: true },
    { code: 'MELAHIRKAN', name: 'Cuti Melahirkan' },
    { code: 'ALASAN_PENTING', name: 'Cuti Karena Alasan Penting' },
    { code: 'LUAR_TANGGUNGAN', name: 'Cuti di Luar Tanggungan Negara' },
  ]) {
    await prisma.leaveType.upsert({ where: { code: lt.code }, update: {}, create: lt });
  }

  // Kode klasifikasi arsip (Permendagri 83/2022 + SE Sekda Makassar) — subset operasional kecamatan
  for (const c of [
    { code: '000.1.5', name: 'Rapat pimpinan / notula' },
    { code: '000.1.2.3', name: 'Perjalanan dinas pegawai' },
    { code: '000.5.3.1', name: 'Buku registrasi naskah, agenda, ekspedisi' },
    { code: '100.2.4', name: 'Fasilitasi kecamatan' },
    { code: '400.10.2', name: 'Pemerintahan desa dan kelurahan' },
    { code: '800.1.11.2', name: 'Cuti sakit' },
    { code: '800.1.11.3', name: 'Cuti bersalin' },
    { code: '800.1.11.4', name: 'Cuti tahunan' },
    { code: '800.1.11.5', name: 'Cuti alasan penting' },
    { code: '800.1.11.13', name: 'Kenaikan gaji berkala' },
    { code: '800.1.3.2', name: 'Kenaikan pangkat/golongan' },
    { code: '800.1.6.6', name: 'Pensiun ASN' },
    { code: '800.1.9', name: 'Sistem informasi kepegawaian' },
    { code: '900.1.3.7', name: 'Daftar gaji' },
  ]) {
    await prisma.archiveClassification.upsert({ where: { code: c.code }, update: { name: c.name }, create: c });
  }

  // 9 tujuan disposisi tetap
  const targets: Array<[string, string, number]> = [
    ['SEKCAM', 'Sekretaris Camat', 1],
    ['KASI_PEM', 'Kasi Pemerintahan, Kinerja Lurah & RT/RW', 2],
    ['KASI_TRANTIB', 'Kasi Trantib & Penegakan Perda', 3],
    ['KASI_PMK', 'Kasi PMK & Kesos', 4],
    ['KASI_EKBANG', 'Kasi Ekbang & Sistem Manajemen Informasi', 5],
    ['KASI_BERSIH', 'Kasi Pengelolaan Kebersihan', 6],
    ['KASUBAG_UMUM', 'Kasubag Umum & Kepegawaian', 7],
    ['KASUBAG_RENKEU', 'Kasubag Perencanaan & Keuangan', 8],
    ['BENDAHARA', 'Bendahara Pengeluaran', 9],
  ];
  for (const [code, name, sortOrder] of targets) {
    await prisma.dispositionTarget.upsert({ where: { code }, update: { name, sortOrder }, create: { code, name, sortOrder } });
  }

  // Data kepegawaian dummy untuk form (nama, NIP, jabatan, masa kerja via joinDate, unit kerja).
  // employmentStatus: PNS|PPPK|HONORER. joinDate dipakai frontend menghitung masa kerja.
  async function mkUser(username: string, password: string, role: any, position: string, empNum: string, name: string, extraDeny: string[] = [], extraGrant: string[] = [], empExtra: { nip?: string; joinDate?: string; rank?: string; orgCode?: string; gender?: string } = {}) {
    const orgId = empExtra.orgCode
      ? (await prisma.organizationalUnit.findUnique({ where: { code: empExtra.orgCode } }))?.id ?? org.id
      : org.id;
    const emp = await prisma.employee.upsert({
      where: { employeeNumber: empNum },
      update: {
        name, nip: empExtra.nip ?? null, position, rank: empExtra.rank ?? null,
        joinDate: empExtra.joinDate ? new Date(empExtra.joinDate) : null,
        orgUnitId: orgId,
      },
      create: {
        employeeNumber: empNum, name, gender: empExtra.gender ?? 'L',
        employmentStatus: role === 'EMPLOYEE' ? 'PNS' : 'PNS',
        position, rank: empExtra.rank, nip: empExtra.nip,
        joinDate: empExtra.joinDate ? new Date(empExtra.joinDate) : null,
        orgUnitId: orgId,
      },
    });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { username: username.toLowerCase() },
      update: { passwordHash: hash, role, position, employeeId: emp.id, orgUnitId: orgId, isActive: true },
      create: {
        username: username.toLowerCase(), passwordHash: hash,
        role, position, employeeId: emp.id, orgUnitId: orgId,
      },
    });
    for (const code of [...extraGrant.map((c) => ({ c, e: 'GRANT' })), ...extraDeny.map((c) => ({ c, e: 'DENY' }))]) {
      const p = await prisma.permission.findUnique({ where: { code: code.c } });
      if (p) {
        await prisma.userPermissionOverride.upsert({
          where: { userId_permissionId: { userId: user.id, permissionId: p.id } },
          update: { effect: code.e },
          create: { userId: user.id, permissionId: p.id, effect: code.e, reason: 'seed' },
        });
      }
    }
    return user;
  }

  await mkUser('superadmin', 'Admin123!', 'SUPER_ADMIN', 'ADMIN', 'EMP-000', 'Super Admin', [], [], { nip: '198001012005011001', joinDate: '2005-01-10', rank: 'IV/a' });
  // Staf Kepegawaian = operator (murni administrasi, tanpa hak verifikasi).
  await mkUser('verifier1', 'Verifier123!', 'VERIFIER', 'STAF_KEPEGAWAIAN', 'EMP-001', 'Staf Kepegawaian', [], [], { nip: '199203032020121002', joinDate: '2020-12-01', rank: 'III/a' });
  // Kasubag Umum & Kepegawaian = pemeriksa (verify/revise/reject via GRANT per user).
  await mkUser('kasubag1', 'Kasubag123!', 'VERIFIER', 'KASUBAG', 'EMP-005', 'Kasubag Umum', [], KASUBAG_GRANTS, { nip: '198707152010012003', joinDate: '2010-01-15', rank: 'III/d' });
  await mkUser('sekcam1', 'Sekcam123!', 'LEADER', 'SEKCAM', 'EMP-002', 'Sekcam Satu', ['leave.approve', 'leave.sign'], [], { nip: '198205102008011004', joinDate: '2008-01-20', rank: 'IV/a' });
  await mkUser('camat1', 'Camat123!', 'LEADER', 'CAMAT', 'EMP-003', 'Camat Satu', ['leave.verify'], ['leave.approve', 'leave.sign'], { nip: '197809122003121005', joinDate: '2003-12-01', rank: 'IV/b' });
  await mkUser('pegawai1', 'Pegawai123!', 'EMPLOYEE', 'STAF', 'EMP-004', 'Ahmad Pegawai', [], [], { nip: '199501012022031006', joinDate: '2022-03-01', rank: 'III/a' });
  // Pegawai kelurahan (pemohon luar kecamatan — registrasi BKPSDMD tetap oleh staf kecamatan).
  await mkUser('pegawai2', 'Pegawai123!', 'EMPLOYEE', 'STAF', 'EMP-006', 'Budi Kelurahan', [], [], { nip: '199806062024051007', joinDate: '2024-05-10', rank: 'II/c', orgCode: 'KMN' });

  console.log('Seed OK');
}

main().finally(() => prisma.$disconnect());
