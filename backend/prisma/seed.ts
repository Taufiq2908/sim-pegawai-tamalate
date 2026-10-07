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
  ['letter.expedition', 'letter', 'expedition'],
  ['outgoing.view', 'outgoing', 'view'],
  ['outgoing.create', 'outgoing', 'create'],
  ['outgoing.reserve', 'outgoing', 'reserve'],
  ['outgoing.issue', 'outgoing', 'issue'],
  ['outgoing.cancel', 'outgoing', 'cancel'],
] as const;

const ROLE_MAP: Record<string, string[]> = {
  VERIFIER: ['auth.me', 'employee.view', 'leave.view', 'leave.verify', 'leave.revise', 'leave.document.upload', 'leave.reject', 'attendance.view', 'attendance.manage', 'attendance.summary', 'letter.view', 'letter.create', 'letter.document.upload', 'letter.archive', 'letter.expedition', 'kgb.view', 'kgb.verify', 'kgb.revise', 'kgb.document.upload', 'kgb.reject', 'outgoing.view', 'outgoing.create', 'outgoing.reserve', 'outgoing.issue', 'outgoing.cancel'],
  LEADER: ['auth.me', 'employee.view', 'leave.view', 'leave.paraf', 'leave.approve', 'leave.reject', 'leave.sign', 'attendance.view', 'attendance.summary', 'letter.view', 'letter.dispose', 'letter.followup', 'letter.complete', 'kgb.view', 'kgb.paraf', 'kgb.approve', 'kgb.reject', 'outgoing.view'],
  EMPLOYEE: ['auth.me', 'leave.view', 'leave.create', 'leave.submit', 'leave.document.upload', 'attendance.view', 'attendance.checkin', 'letter.view', 'letter.followup', 'kgb.view', 'kgb.create', 'kgb.submit', 'kgb.document.upload'],
};

async function main() {
  for (const [code, resource, action] of PERMS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, resource, action } });
  }
  for (const code of ['SUPER_ADMIN', 'VERIFIER', 'LEADER', 'EMPLOYEE'] as const) {
    await prisma.role.upsert({ where: { code }, update: {}, create: { code, name: code } });
  }
  // role_permissions (SUPER_ADMIN = semua via bypass, tetap isi penuh agar eksplisit)
  const allPerms = await prisma.permission.findMany();
  for (const rp of await prisma.role.findMany()) {
    const codes = rp.code === 'SUPER_ADMIN' ? allPerms.map((p) => p.code) : ROLE_MAP[rp.code] ?? [];
    for (const c of codes) {
      const p = allPerms.find((x) => x.code === c)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: rp.id, permissionId: p.id } },
        update: {},
        create: { roleId: rp.id, permissionId: p.id },
      });
    }
  }

  const org = await prisma.organizationalUnit.upsert({
    where: { code: 'KEC-TAMALATE' },
    update: {},
    create: { code: 'KEC-TAMALATE', name: 'Kecamatan Tamalate', type: 'KECAMATAN' },
  });

  for (const lt of [
    { code: 'TAHUNAN', name: 'Cuti Tahunan', maxDays: 12 },
    { code: 'SAKIT', name: 'Cuti Sakit', requiresDocument: true },
    { code: 'MELAHIRKAN', name: 'Cuti Melahirkan' },
    { code: 'ALASAN_PENTING', name: 'Cuti Alasan Penting' },
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

  async function mkUser(username: string, password: string, role: any, position: string, empNum: string, name: string, extraDeny: string[] = [], extraGrant: string[] = []) {
    const emp = await prisma.employee.upsert({
      where: { employeeNumber: empNum },
      update: {},
      create: {
        employeeNumber: empNum, name, gender: 'L',
        employmentStatus: role === 'EMPLOYEE' ? 'PNS' : 'PNS',
        position, orgUnitId: org.id,
      },
    });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { username: username.toLowerCase() },
      update: { passwordHash: hash, role, position, employeeId: emp.id, orgUnitId: org.id, isActive: true },
      create: {
        username: username.toLowerCase(), passwordHash: hash,
        role, position, employeeId: emp.id, orgUnitId: org.id,
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

  await mkUser('superadmin', 'Admin123!', 'SUPER_ADMIN', 'ADMIN', 'EMP-000', 'Super Admin');
  await mkUser('verifier1', 'Verifier123!', 'VERIFIER', 'VERIFIKATOR', 'EMP-001', 'Verifier Satu');
  await mkUser('sekcam1', 'Sekcam123!', 'LEADER', 'SEKCAM', 'EMP-002', 'Sekcam Satu', ['leave.approve', 'leave.sign']);
  await mkUser('camat1', 'Camat123!', 'LEADER', 'CAMAT', 'EMP-003', 'Camat Satu', ['leave.verify'], ['leave.approve', 'leave.sign']);
  await mkUser('pegawai1', 'Pegawai123!', 'EMPLOYEE', 'STAF', 'EMP-004', 'Ahmad Pegawai');

  console.log('Seed OK');
}

main().finally(() => prisma.$disconnect());
