// Tipe domain mengikuti kontrak docs/02-api-contract.md
// + bentuk aktual backend yang terverifikasi (list: data=array, meta=top-level).

export type Role = "SUPER_ADMIN" | "VERIFIER" | "LEADER" | "EMPLOYEE";

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
  | "REVISION"
  | "VERIFIED"
  | "PARAF"
  | "APPROVED"
  | "SIGNED"
  | "FORWARDED"
  | "COMPLETED"
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
  note: string | null;
  createdAt: string;
}

export interface LeaveDetail extends Omit<LeaveItem, "employee" | "leaveType"> {
  employee: EmployeeRef & Record<string, unknown>;
  leaveType: LeaveType;
  reason: string;
  addressDuringLeave: string | null;
  contactDuringLeave: string | null;
  revisionNote: string | null;
  rejectionReason: string | null;
  documents: LeaveDocument[];
  timeline: LeaveTimelineEntry[];
  availableActions: string[];
}

export type AttendanceStatus = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALPA";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  method: string;
  note: string | null;
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
}

export interface AttendanceSummaryItem {
  employee: { id: string; nip: string | null; name: string; position: string; orgUnit: string };
  counts: Record<AttendanceStatus, number>;
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
  documents?: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
}

export interface OutgoingLetter {
  id: string;
  letterNumber: string;
  subject: string;
  recipient: string | null;
  letterDate: string;
  priority: string;
  secrecy: string;
  signerName: string | null;
  status: "RESERVED" | "ISSUED" | "CANCELLED";
  reservationReason: string | null;
  cancelReason: string | null;
}

export type KgbStatus =
  | "DRAFT" | "SUBMITTED" | "REVISION" | "VERIFIED"
  | "PARAF" | "APPROVED" | "COMPLETED" | "REJECTED";

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
  documents: LeaveDocument[];
  timeline: LeaveTimelineEntry[];
  availableActions: string[];
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
