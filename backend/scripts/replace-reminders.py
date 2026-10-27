with open('src/routes/kgb.routes.ts', 'r', encoding='utf8') as f:
    content = f.read()

# Replace the reminders/generate section
old_section = """// POST /kgb-requests/reminders/generate -- buat notifikasi pengingat KGB
// untuk pegawai yang jatuh tempo \x5b3\x5d bulan (ke pegawai + staf kepegawaian + kasubag).
router.post('/reminders/generate', requirePermission('kgb.remind'), async (req, res) => {
  const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { orgUnit: true } });
  const lastKgb = await prisma.kgbRequest.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) } },
    orderBy: { createdAt: 'desc' },
  });
  const byEmp = {};
  for (const k of lastKgb) {
    if (!byEmp[k.employeeId]) byEmp[k.employeeId] = k;
  }
  const now = new Date();
  const due = [];
  for (const e of employees) {
    const last = byEmp[e.id];
    let baseDate = null;
    if (last && last.status === 'COMPLETED') baseDate = new Date(last.effectiveDate);
    else if (e.joinDate) baseDate = new Date(e.joinDate);
    if (!baseDate) continue;
    const next = new Date(baseDate);
    next.setFullYear(next.getFullYear() + 2);
    const monthsUntil = (next.getFullYear() - now.getFullYear()) * 12 + (next.getMonth() - now.getMonth());
    if (monthsUntil >= 0 && monthsUntil <= 3) {
      due.push({ employee: e, nextKgbDate: next.toISOString().slice(0, 10), monthsUntil });
    }
  }
  const result = [];
  for (const d of due) {
    const empUser = await prisma.user.findFirst({ where: { employeeId: d.employee.id, isActive: true }, select: { id: true } });
    const recipients = new Set<string>();
    if (empUser) recipients.add(empUser.id);
    const staf = await prisma.user.findMany({ where: { position: 'STAF_KEPEGAWAIAN', isActive: true }, select: { id: true } });
    for (const s of staf) recipients.add(s.id);
    const kasubag = await prisma.user.findMany({ where: { position: 'KASUBAG', isActive: true }, select: { id: true } });
    for (const k of kasubag) recipients.add(k.id);
    const docList = KGB_REQUIRED_DOCS.join(', ');
    await prisma.notification.createMany({
      data: [...recipients].map((userId) => ({
        userId,
        type: 'KGB_REMINDER',
        title: \x60Pengingat KGB: \x6d + d.employee.name,\x65,
        body: \x60KGB pegawai \x6d + d.employee.name + \x28NIP \x2b (d.employee.nip ?? '-'\)\) + \x29 jatuh tempo \x6d + d.nextKgbDate + \x28 \x2b d.monthsUntil + \x2b \x2b \x22 bulan lagi\x22\x65,
          \x2b \x22Silakan segera regularisasi.\x22 + \x22\x22,\n        referenceType: 'kgb_reminder',
        referenceId: null,
      })),
    });
    result.push({ employee: d.employee.name, nextKgbDate: d.nextKgbDate, monthsUntil: d.monthsUntil, notified: recipients.size });
  }
  return ok(res, result, \x22\x22 + result.length + \x22 pengingat dibuat\x22);\n});"""

new_section = """// POST /kgb-requests/reminders/generate -- buat notifikasi pengingat KGB
// untuk pegawai yang jatuh tempo <=3 bulan ATAS/overdue (monthsUntil < 0),
// dan untuk pegawai yang belum memiliki KGB final (COMPLETED/ARCHIVED).
// Basis perhitungan: sama dengan monitoring ambil KGB final per pegawai.
router.post('/reminders/generate', requirePermission('kgb.remind'), async (req, res) => {
  const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { orgUnit: true } });
  // Dapatkan KGB final (COMPLETED/ARCHIVED) per pegawai; kalau tidak ada, ambil terbaru
  const allKgb = await prisma.kgbRequest.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) } },
    include: { employee: true },
  });
  const finalKgb = allKgb.filter(k => k.status === 'COMPLETED' || k.status === 'ARCHIVED');
  const finalByEmp: Record<string, any> = {};
  for (const k of finalKgb) {
    if (!finalByEmp[k.employeeId] || new Date(k.createdAt) > new Date(finalByEmp[k.employeeId].createdAt)) {
      finalByEmp[k.employeeId] = k;
    }
  }
  const allByEmp: Record<string, any> = {};
  for (const k of allKgb) {
    if (!allByEmp[k.employeeId] || new Date(k.createdAt) > new Date(allByEmp[k.employeeId].createdAt)) {
      allByEmp[k.employeeId] = k;
    }
  }
  const now = new Date();
  const due: Array<{ employee: any; nextKgbDate: string; monthsUntil: number; isOverdue: boolean }> = [];
  for (const e of employees) {
    // Prioritaskan KGB final
    let last = finalByEmp[e.id];
    if (!last) last = allByEmp[e.id];
    if (!last) continue;
    let baseDate: Date | null = null;
    if (last && (last.status === 'COMPLETED' || last.status === 'ARCHIVED')) {
      baseDate = new Date(last.effectiveDate);
    } else if (last) {
      baseDate = new Date(last.effectiveDate);
    }
    if (!baseDate) continue;
    const next = new Date(baseDate);
    next.setFullYear(next.getFullYear() + 2);
    const monthsUntil = (next.getFullYear() - now.getFullYear()) * 12 + (next.getMonth() - now.getMonth());
    const isOverdue = monthsUntil < 0;
    // Masukkan jika: jatuh tempo <=3 bulan DEPAN ATAU overdue (sampai 12 bulan lalu)
    if (monthsUntil >= -12 && monthsUntil <= 3) {
      due.push({ employee: e, nextKgbDate: next.toISOString().slice(0, 10), monthsUntil, isOverdue });
    }
  }

  const result = [];
  for (const d of due) {
    const empUser = await prisma.user.findFirst({ where: { employeeId: d.employee.id, isActive: true }, select: { id: true } });
    const recipients = new Set<string>();
    if (empUser) recipients.add(empUser.id);
    // staf kepegawaian (operator)
    const staf = await prisma.user.findMany({ where: { position: 'STAF_KEPEGAWAIAN', isActive: true }, select: { id: true } });
    for (const s of staf) recipients.add(s.id);
    // kasubag
    const kasubag = await prisma.user.findMany({ where: { position: 'KASUBAG', isActive: true }, select: { id: true } });
    for (const k of kasubag) recipients.add(k.id);

    const docList = KGB_REQUIRED_DOCS.join(', ');
    await prisma.notification.createMany({
      data: [...recipients].map((userId) => ({
        userId,
        type: 'KGB_REMINDER',
        title: \x60Pengingat KGB: \x6d + d.employee.name,\x65,
        body: \x60KGB pegawai \x6d + d.employee.name + \x28NIP \x2b (d.employee.nip ?? '-'\)\) + \x29 jatuh tempo \x6d + d.nextKgbDate + \x28 \x2b d.monthsUntil + \x2b \x2b \x22 bulan lagi\x22\x29 + \x22\x22 + \x22Silakan segera regularisasi.\x22 + \x22\x22,\n        referenceType: 'kgb_reminder',
        referenceId: null,
      })),
    });
    result.push({ employee: d.employee.name, nextKgbDate: d.nextKgbDate, monthsUntil: d.monthsUntil, isOverdue: d.isOverdue, notified: recipients.size });
  }
  return ok(res, result, \x22\x22 + result.length + \x22 pengingat dibuat (termasuk \x22 + \x22${items.filter((i) => i.isOverdue).length}\x22 overdue)\x22);\n});"""

if content.contains(old_section):
    content = content.replace(old_section, new_section)
    with open('src/routes/kgb.routes.ts', 'w', encoding='utf8') as f:
        f.write(content)
    print("Replacement successful")
else:
    print("Old section not found, showing first 200 chars of relevant area:")
    idx = content.find("// POST /kgb-requests/reminders/generate")
    if idx >= 0:
        print(content[idx:idx+500])
    else:
        print("Cannot find the section")