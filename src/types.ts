export type DeadlineType = 'DATE' | 'TEXT' | 'MISSING';
export type MatchState = 'MATCHED' | 'PARTIAL' | 'AMBIGUOUS' | 'NOT_FOUND';
export type PageId = 'overview' | 'protocols' | 'appeals' | 'incoming' | 'upload';

export interface StructurePerson {
  fullName: string | null;
  code: string | null;
  position: string | null;
  departmentGroup: string | null;
  curator: string | null;
  departmentHead: string | null;
  unit: string | null;
  spLeader: string | null;
  sourceRowNumber: number;
}

export interface OrganizationalEnrichment {
  employeeNames: string[];
  codes: string[];
  positions: string[];
  departments: string[];
  curators: string[];
  departmentHeads: string[];
  units: string[];
  spLeaders: string[];
  matchState: MatchState;
}

export interface QualityIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

export interface BaseRecord {
  id: string;
  responsibleRaw: string | null;
  responsiblePersons: string[];
  deadlineRaw: unknown;
  deadlineDate: Date | null;
  deadlineType: DeadlineType;
  deadlineTextNormalized: string | null;
  executionStatusRaw: string | null;
  executionStatusNormalized: string;
  daysDelta: number | null;
  deadlineDisplay: string;
  structureMatches: StructurePerson[];
  organization: OrganizationalEnrichment;
  nextAction: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRowNumber: number;
  qualityWarnings: string[];
}

export interface ProtocolRecord extends BaseRecord {
  protocolNumberRaw: string | null;
  protocolDateRaw: unknown;
  protocolDate: Date | null;
  assignmentNumberRaw: string | null;
  assignmentText: string | null;
  progressInfo: string | null;
  progressPreview: string | null;
  sourceFile: '1.xlsx';
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
  sourceFile: '2.xlsx';
}

export interface IncomingRecord extends BaseRecord {
  registrationNumberAndDate: string | null;
  summary: string | null;
  sourceDepartmentRaw: string | null;
  sourceFile: '3.xlsx';
}

export interface FileMeta {
  fileName: string;
  sheet: string;
  headerRow: number;
  validRows: number;
  ignoredRows: number;
  warnings: string[];
  errors: string[];
  dateRange: string;
  loadedAt: string;
}

export interface FilterState {
  search: string;
  statuses: string[];
  names: string[];
  codes: string[];
  positions: string[];
  departments: string[];
  curators: string[];
  departmentHeads: string[];
  units: string[];
  spLeaders: string[];
  deadlineBuckets: string[];
  period: string;
  dateFrom: string;
  dateTo: string;
  appealTypes: string[];
  applicants: string[];
  protocolNumbers: string[];
  assignmentNumbers: string[];
  appealNumbers: string[];
  summaries: string[];
  incomingRegs: string[];
  sourceDepartments: string[];
  regFrom: string;
  regTo: string;
  responseFrom: string;
  responseTo: string;
  deadlineFrom: string;
  deadlineTo: string;
}

export const emptyFilters = (): FilterState => ({
  search: '',
  statuses: [],
  names: [],
  codes: [],
  positions: [],
  departments: [],
  curators: [],
  departmentHeads: [],
  units: [],
  spLeaders: [],
  deadlineBuckets: [],
  period: 'Все',
  dateFrom: '',
  dateTo: '',
  appealTypes: [],
  applicants: [],
  protocolNumbers: [],
  assignmentNumbers: [],
  appealNumbers: [],
  summaries: [],
  incomingRegs: [],
  sourceDepartments: [],
  regFrom: '',
  regTo: '',
  responseFrom: '',
  responseTo: '',
  deadlineFrom: '',
  deadlineTo: '',
});
