// Tipe domain mengikuti kontrak docs/02-api-contract.md
// + bentuk aktual backend yang terverifikasi (list: data=array, meta=top-level).

export type Role = "SUPER_ADMIN" | "VERIFIER" | "SUPERVISOR" | "LEADER" | "EMPLOYEE";

export interface OrgUnit {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeRef {
  id: string;
  nip: string | null;
  employeeNumber?: string;
  name: string;
  employmentStatus?: string;
  position?: string;
  rank?: string | null;
  joinDate?: string | null;
  orgUnit?: OrgUnit | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  position: string | null;
  orgUnit: OrgUnit | null;
  employee: EmployeeRef | null;
  permissions: string[];
}

export interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta: PageMeta | null;
  errors: Record<string, string[]> | null;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export type LeaveStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "REVIEWED"
  | "REVISION"
  | "POSTPONED"
  | "VERIFIED"
  | "PARAF"
  | "APPROVED"
  | "REGISTERED"
  | "SUBMITTED_BKPSDMD"
  | "FORWARDED"
  | "COMPLETED"
  | "ARCHIVED"
  | "REJECTED";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  maxDays: number | null;
  requiresDocument?: boolean;
  isActive?: boolean;
}

export interface LeaveItem {
  id: string;
  requestNumber: string;
  employee: EmployeeRef;
  leaveType: { code: string; name: string };
  startDate: string;
  endDate: string;
  totalDays: number;
  status: LeaveStatus;
  currentHolderRole?: string | null;
  submittedAt?: string | null;
}

export interface LeaveDocument {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface LeaveTimelineEntry {
  action: string;
  fromStatus: string;
  toStatus: string;
  actor: string;
  actorUsername?: string | null;
  actorName?: string | null;
  actorNip?: string | null;
  actorRole?: string | null;
  actorPosition?: string | null;
  note: string | null;
  createdAt: string;
}

export interface SupervisorMini {
  id: string;
  username: string;
  name: string;
  nip: string | null;
  position: string | null;
}

export interface SupervisorInfo {
  direct: SupervisorMini | null;
  chain: SupervisorMini[];
  note: string | null;
}

export interface LeaveDetail extends Omit<LeaveItem, "employee" | "leaveType"> {
  employeeId: string;
  employee: EmployeeRef & Record<string, unknown>;
  leaveType: LeaveType;
  reason: string;
  addressDuringLeave: string | null;
  contactDuringLeave: string | null;
  revisionNote: string | null;
  rejectionReason: string | null;
  postponeNote?: string | null;
  supervisor?: SupervisorInfo | null;
  camat?: { name: string; nip: string | null; position: string | null; rank?: string | null } | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  documents: LeaveDocument[];
  timeline: LeaveTimelineEntry[];
  availableActions: string[];
}

export type AttendanceStatus = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "DL" | "ALPA";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  method: string;
  note: string | null;
  recorder?: { id: string; username: string; employee?: { name: string } | null } | null;
  corrector?: { id: string; username: string; employee?: { name: string } | null } | null;
  correctedAt?: string | null;
  employee?: EmployeeRef & { orgUnit?: OrgUnit };
}

export interface AttendanceToday {
  record: AttendanceRecord | null;
  serverTime: string;
  makassarTime?: { ymd: string; minutes: number };
  deadline: string;
}

export interface AttendanceReportRow {
  nomor: number;
  nama: string;
  nip: string | null;
  gol: string | null;
  jabatan: string;
  jamHadir: string | null;
  jamPulang: string | null;
  status: string;
  diisiOleh: string | null;
  koreksi: { oleh: string | null; pada: string } | null;
}

export interface AttendanceSummaryItem {
  employee: { id: string; nip: string | null; name: string; position: string; orgUnit: string };
  kantor?: string;
  counts: Record<AttendanceStatus, number> & { DL?: number };
  rekapitulasi?: number;
  recorded: number;
}

export interface ProblematicItem {
  employee: { id: string; nip: string | null; name: string; position: string };
  weekStart: string;
  weekEnd: string;
  absenceCount: number;
  absentDates?: string[];
  days?: Array<{ date: string; pagi: string; sore: string }>;
}

export interface SessionPhoto {
  id: string;
  date: string;
  session: "PAGI" | "SORE";
  photoUrl: string;
  createdAt?: string;
}

export interface WarningLetterDetail {
  id: string;
  letterNumber: string;
  employeeId: string;
  weekStart: string;
  weekEnd: string;
  absenceCount: number;
  content: string;
  summonScheduledAt: string | null;
  summonNote: string | null;
  coachingResult: string | null;
  coachingFollowUp: "NONE" | "BKPSDM" | null;
  coachedAt: string | null;
  forwardBy?: string | null;
  forwardAt?: string | null;
  forwardNote?: string | null;
  instructedBy?: string | null;
  instructedAt?: string | null;
  instruction?: string | null;
  createdAt: string;
  employee?: { name: string; position: string; nip: string | null };
}

export type LetterStatus = "RECEIVED" | "PARAF" | "DISPOSED" | "COMPLETED" | "ARCHIVED";

export interface Disposition {
  id: string;
  from: { id: string; username: string };
  to: { id: string; username: string };
  targetCode: string | null;
  targetName: string | null;
  instruction: string;
  deadline: string | null;
  status: "PENDING" | "DONE";
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
  canFollowUp: boolean;
}

export interface IncomingLetter {
  id: string;
  agendaNumber: string;
  letterNumber: string;
  sender: string;
  subject: string;
  summary: string | null;
  letterDate: string;
  receivedDate: string;
  priority: string;
  secrecy: string;
  addressedTo: string | null;
  pic: string | null;
  remarks: string | null;
  status: LetterStatus;
  availableActions?: string[];
  dispositions?: Disposition[];
  _count?: { documents: number };
  documents?: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; downloadUrl: string }>;
  activityDate?: string | null;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
  activityLocation?: string | null;
  agendaAssignments?: Array<{
    id: string;
    userId: string;
    note: string | null;
    user: {
      id: string;
      username: string;
      position: string | null;
      employee: { name: string; nip: string | null; position?: string | null } | null;
    };
  }>;
  assignedStaff?: Array<{
    id: string;
    username: string;
    name: string;
    nip: string | null;
    position: string | null;
    note: string | null;
  }>;
  archiveRecord?: { id: string; archiveNumber: string; listId: string | null } | null;
  classification?: { code: string; name: string } | null;
}

export interface OutgoingLetter {
  id: string;
  letterNumber: string;
  subject: string;
  recipient: string | null;
  destinationNumber: string | null;
  personInCharge: string | null;
  letterCode: string | null;
  remarks: string | null;
  sequenceNumber?: number;
  year?: number;
  letterDate: string;
  priority: string;
  secrecy: string;
  signerName: string | null;
  status: "RESERVED" | "ISSUED" | "CANCELLED";
  reservationReason: string | null;
  cancelReason: string | null;
  documents?: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; downloadUrl: string }>;
  archiveRecord?: { id: string; archiveNumber: string; listId: string | null } | null;
}

export type KgbStatus =
  | "DRAFT" | "SUBMITTED" | "REVISION" | "VERIFIED"
  | "PARAF" | "APPROVED" | "REGISTERED" | "SUBMITTED_BKPSDMD"
  | "COMPLETED" | "ARCHIVED" | "REJECTED";

export interface KgbItem {
  id: string;
  requestNumber: string;
  employee: EmployeeRef;
  oldRank: string;
  newRank: string;
  oldSalary: number;
  newSalary: number;
  effectiveDate: string;
  status: KgbStatus;
}

export interface KgbDetail extends KgbItem {
  note: string | null;
  revisionNote: string | null;
  rejectionReason: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  camat?: { name: string; nip: string | null; position: string | null; rank?: string | null } | null;
  documents: LeaveDocument[];
  timeline: LeaveTimelineEntry[];
  availableActions: string[];
}

export interface KgbMonitoringItem {
  employee: {
    id: string;
    nip: string | null;
    name: string;
    position: string;
    rank: string | null;
    orgUnit: string;
  };
  lastKgb: {
    id: string;
    requestNumber: string;
    oldRank: string;
    newRank: string;
    effectiveDate: string;
    status: KgbStatus;
  } | null;
  nextKgbDate: string | null;
  monthsUntil: number | null;
  dueSoon: boolean;
  isOverdue: boolean;
  requiredDocs: string[];
}

export interface KgbReminderResult {
  employee: string;
  nextKgbDate: string;
  monthsUntil: number;
  isOverdue: boolean;
  notified: number;
}

export type ArchiveSourceType = "INCOMING" | "OUTGOING";
export type ArchiveCategory = "AKTIF" | "INAKTIF" | "PENTING";
export type ArchiveLocation = "LEMARI_ARSIP" | "GUDANG_ARSIP" | "LURAH";
export type ArchiveListStatus = "DRAFT" | "SIGNED";

export interface ArchiveRecord {
  id: string;
  archiveNumber: string;
  sourceType: ArchiveSourceType;
  incomingLetterId: string | null;
  outgoingLetterId: string | null;
  classificationId: string | null;
  code: string;
  bundleCode: string | null;
  title: string;
  documentNumber: string | null;
  documentDate: string | null;
  archiveDate: string;
  category: ArchiveCategory;
  location: ArchiveLocation;
  retentionUntil: string | null;
  notes: string | null;
  listId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  classification?: { id: string; code: string; name: string } | null;
  incomingLetter?: {
    id: string;
    agendaNumber: string;
    letterNumber: string;
    subject: string;
    sender: string;
    letterDate: string;
    status: string;
  } | null;
  outgoingLetter?: {
    id: string;
    letterNumber: string;
    subject: string;
    recipient: string;
    letterDate: string;
    status: string;
  } | null;
  list?: {
    id: string;
    listNumber: string;
    status: ArchiveListStatus;
    signedAt?: string | null;
  } | null;
}

export interface ArchiveList {
  id: string;
  listNumber: string;
  periodStart: string;
  periodEnd: string;
  status: ArchiveListStatus;
  notes: string | null;
  signerUserId: string | null;
  signerName: string | null;
  signerNip: string | null;
  signerPosition: string | null;
  signedAt: string | null;
  createdBy: string;
  records: ArchiveRecord[];
}

export interface ArchiveStats {
  year: number;
  total: number;
  unlisted: number;
  signedLists: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
}

export interface ArchiveCandidate {
  id: string;
  sourceType: ArchiveSourceType;
  agendaNumber: string | null;
  letterNumber: string;
  subject: string;
  party: string;
  date: string;
  status: string;
  classification: { code: string; name: string } | null;
}

export interface KgbRegisterBookRow {
  tglSk: string;
  nama: string;
  nip: string | null;
  gol: string;
  pangkat: string;
  jabatan: string;
  unitKerja: string;
  lama: {
    nomorSk: string;
    tanggalSk: string;
    tglMulai: string;
    masaKerja: string;
    tahun: number;
    golMasaKerja: string;
    gajiPokok: number;
  };
  baru: {
    tglMulai: string;
    kgbYad: string;
    masaKerja: string;
    tahun: number;
    golMasaKerja: string;
    gajiPokok: number;
  };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export type PensionStatus =
  | "DRAFT" | "VERIFIED" | "PARAF" | "APPROVED"
  | "REGISTERED" | "EXPEDITED" | "SENT"
  | "COMPLETED" | "ARCHIVED" | "REVISION" | "REJECTED";

export type PensionItemStatus = "PENDING" | "VERIFIED" | "REVISION" | "REJECTED";

export type PensionType = "BUP" | "APS" | "UDZUR" | "JANDA" | "DUDA";

export interface PensionChecklistItem {
  code: string;
  label: string;
  uploaded: boolean;
  documentId: string | null;
  originalName: string | null;
  uploadedAt: string | null;
}

export interface PensionDocument {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string;
}

export interface PensionItem {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string | null;
  employeeNumber: string;
  rank: string | null;
  position: string;
  orgUnitName: string | null;
  birthDate: string;
  retirementDate: string;
  bupAge: number;
  yearsOfService: number | null;
  pensionType: PensionType | string;
  status: PensionItemStatus;
  note: string | null;
  documents: PensionDocument[];
  documentsChecklist: PensionChecklistItem[];
  missingDocuments: string[];
}

export interface PensionBatch {
  id: string;
  batchNumber: string;
  periodYear: number;
  periodMonth: number | null;
  bupAge: number;
  status: PensionStatus;
  statusLabel: string;
  note: string | null;
  outgoingLetterId: string | null;
  outgoingLetterNumber: string | null;
  outgoingLetterDate: string | null;
  agendaNumber: string | null;
  expeditionNumber: string | null;
  expeditionDate: string | null;
  courierName: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  receivedBy: string | null;
  items: PensionItem[];
  timeline: Array<{
    action: string;
    fromStatus: string;
    toStatus: string;
    actorName: string | null;
    actorRole: string;
    actorPosition: string | null;
    note: string | null;
    createdAt: string;
  }>;
  availableActions: string[];
  signers: {
    camat: { name: string; nip: string | null; position: string } | null;
    sekcam: { name: string; nip: string | null; position: string } | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PensionBupRow {
  employee: {
    id: string;
    nip: string | null;
    employeeNumber: string;
    name: string;
    gender: string;
    rank: string | null;
    position: string;
    employmentStatus: string;
    orgUnit: { id: string; code: string; name: string } | null;
  };
  birthDate: string;
  age: { years: number; months: number };
  retirementDate: string;
  bupAge: number;
  yearsOfService: number | null;
  monthsUntil: number;
  daysUntil: number;
  existingItem: {
    id: string;
    batchId: string;
    batchNumber: string;
    batchStatus: PensionStatus;
    periodYear: number;
    itemStatus: PensionItemStatus;
  } | null;
}

export interface PensionBupMeta {
  total: number;
  from: string;
  to: string;
  bupAge: number;
  missingBirthDate: number;
  alreadyInBatch: number;
}

export interface PensionRegisterRow {
  id: string;
  batchNumber: string;
  periodYear: number;
  periodMonth: number | null;
  periodLabel: string;
  status: PensionStatus;
  statusLabel: string;
  jumlahPegawai: number;
  pegawai: Array<{
    name: string;
    nip: string | null;
    retirementDate: string | null;
    status: PensionItemStatus;
  }>;
  nomorSurat: string | null;
  tanggalSurat: string | null;
  nomorAgenda: string | null;
  nomorEkspedisi: string | null;
  tanggalEkspedisi: string | null;
  nomorTandaTerima: string | null;
  tanggalTandaTerima: string | null;
  createdAt: string | null;
}

export interface PensionNominativeRow {
  nomor: number;
  itemId: string;
  batchId: string;
  batchNumber: string;
  periodYear: number;
  periodMonth: number | null;
  periodLabel: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string | null;
  employeeNumber: string;
  rank: string | null;
  position: string;
  orgUnitName: string | null;
  birthDate: string | null;
  retirementDate: string | null;
  bupAge: number;
  yearsOfService: number | null;
  pensionType: PensionType | string;
  itemStatus: PensionItemStatus;
  batchStatus: PensionStatus;
  statusLabel: string;
  documentsChecklist: PensionChecklistItem[];
  missingDocuments: string[];
  nomorSurat: string | null;
  nomorAgenda: string | null;
  nomorTandaTerima: string | null;
  tanggalTandaTerima: string | null;
}

export interface PensionExpeditionRow {
  id: string;
  tanggalEkspedisi: string | null;
  nomorEkspedisi: string | null;
  nomorSurat: string | null;
  tujuan: string;
  penerima: string | null;
  jumlahPegawai: number;
  pegawai: Array<{
    employeeName: string;
    employeeNip: string | null;
  }>;
  status: PensionStatus;
  statusLabel: string;
  catatan: string | null;
}
