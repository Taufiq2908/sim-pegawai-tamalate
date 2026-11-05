import { prisma } from '../lib/prisma';

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
}

export interface ArchiveNotificationInput {
  title: string;
  body: string;
  referenceType: 'incoming_letter' | 'outgoing_letter';
  referenceId: string;
}

/** Kirim notifikasi ke semua user aktif dengan posisi tertentu. Best-effort. */
export async function notifyPositions(positions: string[], input: NotificationInput): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true, position: { in: positions } },
    select: { id: true },
  });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title.slice(0, 255),
      body: input.body,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })),
  });
}

/** Kirim notifikasi ke satu user. Best-effort. */
export async function notifyUser(userId: string, input: NotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title.slice(0, 255),
      body: input.body,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
  });
}

/** Notifikasi dashboard Sekcam/Camat saat surat masuk/keluar masuk antrean arsip. */
export async function notifyArchiveApprovers(input: ArchiveNotificationInput): Promise<void> {
  await notifyPositions(['SEKCAM', 'CAMAT'], {
    type: 'ARCHIVE_APPROVAL',
    title: input.title,
    body: input.body,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}
