export type DeadlineType = 'DATE' | 'TEXT' | 'MISSING';
export type DeadlineBucket =
  | 'OVERDUE'
  | 'TODAY'
  | 'DUE_1_3'
  | 'DUE_4_7'
  | 'DUE_8_30'
  | 'DUE_31_PLUS'
  | 'TEXT_DEADLINE'
  | 'UNKNOWN_DEADLINE';

export type ProtocolStatus =
  | 'В работе'
  | 'Рабочий контроль'
  | 'На снятии с контроля'
  | 'Снят с контроля'
  | 'Не исполнен'
  | 'Не определено';

export type AppealStatus = 'На исполнении' | 'Завершено' | 'Не определено';
export type IncomingStatus = 'Не исполнено' | 'На исполнении' | 'Выполнен' | 'Выполнено' | 'Не определено';

export type WarningLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface DataWarning {
  level: WarningLevel;
  message: string;
  sourceFile?: string;
  sourceRowNumber?: number;
}

export interface StructurePerson {
  fullName: string;
  code: string;
  position: string;
  department: string;
  curator: string;
  head: string;
  unit: string;
}

export interface BaseRecord {
  id: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRowNumber: number;
  deadlineRaw: unknown;
  deadlineDate: Date | null;
  deadlineType: DeadlineType;
  daysDelta: number | null;
  isFinal: boolean;
  isActive: boolean;
  isOverdue: boolean;
  deadlineBucket: DeadlineBucket;
  department: string;
  curator: string;
  departmentHead: string;
}

export interface ProtocolRecord extends BaseRecord {
  protocolNumberRaw: string | null;
  protocolDateRaw: unknown;
  protocolDate: Date | null;
  assignmentNumberRaw: string | null;
  assignmentText: string | null;
  responsibleRaw: string | null;
  responsiblePersons: string[];
  progressInfo: string | null;
  executionStatusRaw: string | null;
  executionStatusNormalized: ProtocolStatus;
}

export interface AppealRecord extends BaseRecord {
  appealNumber: string | null;
  registrationDateRaw: unknown;
  registrationDate: Date | null;
  applicant: string | null;
  appealType: string | null;
  summary: string | null;
  responseDateRaw: unknown;
  responseDate: Date | null;
  executionStatusRaw: string | null;
  executionStatusNormalized: AppealStatus;
  responsibleEmployee: string | null;
}

export interface IncomingRecord extends BaseRecord {
  registrationNumberAndDate: string | null;
  summary: string | null;
  responsibleEmployee: string | null;
  departmentRaw: string | null;
  executionStatusRaw: string | null;
  executionStatusNormalized: IncomingStatus;
}

export interface FileMeta {
  fileName: string;
  sheet: string;
  headerRow: number;
  validCount: number;
  ignoredCount: number;
  warningCount: number;
  errorCount: number;
  loadedAt: string;
  dateRange?: string;
}

export interface AppState {
  protocols: ProtocolRecord[];
  appeals: AppealRecord[];
  incoming: IncomingRecord[];
  structure: StructurePerson[];
  structureLoaded: boolean;
  warnings: DataWarning[];
  meta: {
    protocols?: FileMeta;
    appeals?: FileMeta;
    incoming?: FileMeta;
  };
  referenceDate: string;
}

export type PageId = 'overview' | 'protocols' | 'appeals' | 'incoming' | 'upload';
