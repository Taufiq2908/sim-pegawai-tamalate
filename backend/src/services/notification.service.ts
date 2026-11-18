import { prisma } from '../lib/prisma';
import { userIdsForPosition } from './position.service';

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

/** Kirim notifikasi ke semua user aktif dengan posisi tertentu, termasuk Plt aktif. Best-effort. */
export async function notifyPositions(positions: string[], input: NotificationInput): Promise<void> {
  const ids = new Set<string>();
  for (const position of positions) {
    for (const id of await userIdsForPosition(position)) ids.add(id);
  }
  if (ids.size === 0) return;

  await prisma.notification.createMany({
    data: [...ids].map((userId) => ({
      userId,
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

/**
 * Notifikasi antrean arsip. Staf arsip ikut diberi tahu karena sekarang dapat
 * menyelesaikan arsip surat masuk; Sekcam/Camat tetap menjadi approver.
 */
export async function notifyArchiveApprovers(input: ArchiveNotificationInput): Promise<void> {
  await notifyPositions(['SEKCAM', 'CAMAT', 'STAF_KEPEGAWAIAN', 'ARSIP'], {
    type: 'ARCHIVE_APPROVAL',
    title: input.title,
    body: input.body,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}
