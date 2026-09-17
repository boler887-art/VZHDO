import type { AppealRecord, FilterState, IncomingRecord, ProtocolRecord } from '../types';
import { deadlineBucket, periodRange } from './dates';
import { norm } from './text';

function orgHit(values: string[], selected: string[]) {
  if (!selected.length) return true;
  return values.some((v) => selected.includes(v));
}

function searchHit(hay: string, q: string) {
  if (!q) return true;
  return norm(hay).includes(norm(q));
}

function inRange(d: Date | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!d) return false;
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}

function orgBlock(r: { organization: ProtocolRecord['organization']; responsiblePersons: string[]; responsibleRaw: string | null }, f: FilterState) {
  if (f.names.length) {
    const ok =
      orgHit(r.organization.employeeNames, f.names) ||
      r.responsiblePersons.some((p) => f.names.includes(p)) ||
      (r.responsibleRaw != null && f.names.includes(r.responsibleRaw));
    if (!ok) return false;
  }
  if (f.codes.length && !orgHit(r.organization.codes, f.codes)) return false;
  if (f.positions.length && !orgHit(r.organization.positions, f.positions)) return false;
  if (f.departments.length && !orgHit(r.organization.departments, f.departments)) return false;
  if (f.curators.length && !orgHit(r.organization.curators, f.curators)) return false;
  if (f.departmentHeads.length && !orgHit(r.organization.departmentHeads, f.departmentHeads)) return false;
  if (f.spLeaders.length && !orgHit(r.organization.spLeaders, f.spLeaders)) return false;
  return true;
}

export function filterProtocols(rows: ProtocolRecord[], f: FilterState, ref: Date, kpi?: string): ProtocolRecord[] {
  const pr = periodRange(f.period, ref);
  const from = f.dateFrom || (pr.from ? pr.from.toISOString().slice(0, 10) : '');
  const to = f.dateTo || (pr.to ? pr.to.toISOString().slice(0, 10) : '');
  return rows.filter((r) => {
    if (kpi === 'ПРОСРОЧЕНО' && r.executionStatusNormalized !== 'Просрочено') return false;
    if (kpi === 'В РАБОТЕ' && r.executionStatusNormalized !== 'В работе') return false;
    if (kpi === 'РАБОЧИЙ КОНТРОЛЬ' && r.executionStatusNormalized !== 'Рабочий контроль') return false;
    if (kpi === 'НА СНЯТИИ С КОНТРОЛЯ' && r.executionStatusNormalized !== 'На снятии с контроля') return false;
    if (kpi === 'СНЯТ С КОНТРОЛЯ' && r.executionStatusNormalized !== 'Снят с контроля') return false;
    if (f.statuses.length && !f.statuses.includes(r.executionStatusNormalized)) return false;
    if (!inRange(r.protocolDate, from, to)) return false;
    if (f.protocolNumbers.length && (!r.protocolNumberRaw || !f.protocolNumbers.includes(r.protocolNumberRaw))) return false;
    if (f.assignmentNumbers.length && (!r.assignmentNumberRaw || !f.assignmentNumbers.includes(r.assignmentNumberRaw))) return false;
    const bucket =
      r.deadlineType === 'TEXT' ? r.deadlineTextNormalized || 'текстовый срок' : deadlineBucket(r.daysDelta, r.deadlineType);
    if (
      f.deadlineBuckets.length &&
      !f.deadlineBuckets.includes(bucket) &&
      !(r.deadlineType === 'TEXT' && f.deadlineBuckets.includes(r.deadlineTextNormalized || ''))
    )
      return false;
    if (!inRange(r.deadlineDate, f.deadlineFrom, f.deadlineTo)) return false;
    if (f.units.length && !orgHit(r.organization.units, f.units)) return false;
    if (!orgBlock(r, f)) return false;
    const hay = [
      r.protocolNumberRaw,
      r.assignmentNumberRaw,
      r.assignmentText,
      r.responsibleRaw,
      r.progressInfo,
      ...r.organization.employeeNames,
      ...r.organization.units,
    ].join(' ');
    if (!searchHit(hay, f.search)) return false;
    return true;
  });
}

export function filterAppeals(rows: AppealRecord[], f: FilterState, kpi?: string, tab?: string): AppealRecord[] {
  return rows.filter((r) => {
    const overdue = r.executionStatusNormalized !== 'Завершено' && r.daysDelta != null && r.daysDelta < 0;
    const due7 = r.executionStatusNormalized !== 'Завершено' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7;
    if (kpi === 'ПРОСРОЧЕНО' && !overdue) return false;
    if (kpi === 'СРОК ДО 7 ДНЕЙ' && !due7) return false;
    if (kpi === 'ЗАВЕРШЕНО' && r.executionStatusNormalized !== 'Завершено') return false;
    if (!kpi) {
      if (tab === 'На исполнении' && r.executionStatusNormalized !== 'На исполнении') return false;
      if (tab === 'Просроченные' && !overdue) return false;
      if (tab === 'Завершённые' && r.executionStatusNormalized !== 'Завершено') return false;
    }
    if (f.statuses.length && !f.statuses.includes(r.executionStatusNormalized)) return false;
    if (f.appealTypes.length && (!r.appealType || !f.appealTypes.includes(r.appealType))) return false;
    if (f.applicants.length && (!r.applicant || !f.applicants.includes(r.applicant))) return false;
    if (f.appealNumbers.length && (!r.appealNumber || !f.appealNumbers.includes(r.appealNumber))) return false;
    if (f.summaries.length && (!r.summary || !f.summaries.includes(r.summary))) return false;
    if (!inRange(r.registrationDate, f.regFrom, f.regTo)) return false;
    if ((f.responseFrom || f.responseTo) && !inRange(r.responseDate, f.responseFrom, f.responseTo)) return false;
    if (!inRange(r.deadlineDate, f.deadlineFrom, f.deadlineTo)) return false;
    const bucket =
      r.deadlineType === 'TEXT' ? r.deadlineTextNormalized || 'текстовый срок' : deadlineBucket(r.daysDelta, r.deadlineType);
    if (f.deadlineBuckets.length && !f.deadlineBuckets.includes(bucket)) return false;
    if (f.units.length && !orgHit(r.organization.units, f.units) && !orgHit(r.organization.departments, f.units)) return false;
    if (!orgBlock(r, f)) return false;
    const hay = [r.appealNumber, r.applicant, r.appealType, r.summary, r.responsibleRaw, ...r.organization.employeeNames].join(' ');
    if (!searchHit(hay, f.search)) return false;
    return true;
  });
}

export function filterIncoming(rows: IncomingRecord[], f: FilterState, kpi?: string, tab?: string): IncomingRecord[] {
  return rows.filter((r) => {
    const final = ['Выполнено', 'Выполнен'].includes(r.executionStatusNormalized);
    const overdue = !final && r.daysDelta != null && r.daysDelta < 0;
    const due7 = !final && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7;
    if (kpi === 'ПРОСРОЧЕНО' && !overdue) return false;
    if (kpi === 'СРОК ДО 7 ДНЕЙ' && !due7) return false;
    if (kpi === 'ВЫПОЛНЕНО' && !final) return false;
    if (!kpi) {
      if (tab === 'На исполнении' && r.executionStatusNormalized !== 'На исполнении') return false;
      if (tab === 'Просроченные' && !overdue) return false;
      if (tab === 'Выполненные' && !final) return false;
    }
    if (f.statuses.length && !f.statuses.includes(r.executionStatusNormalized)) return false;
    if (f.incomingRegs.length && (!r.registrationNumberAndDate || !f.incomingRegs.includes(r.registrationNumberAndDate))) return false;
    if (f.summaries.length && (!r.summary || !f.summaries.includes(r.summary))) return false;
    if (f.sourceDepartments.length && (!r.sourceDepartmentRaw || !f.sourceDepartments.includes(r.sourceDepartmentRaw))) return false;
    if (f.units.length) {
      const hit = (r.sourceDepartmentRaw && f.units.includes(r.sourceDepartmentRaw)) || orgHit(r.organization.units, f.units);
      if (!hit) return false;
    }
    if (!inRange(r.deadlineDate, f.deadlineFrom, f.deadlineTo)) return false;
    const bucket =
      r.deadlineType === 'TEXT' ? r.deadlineTextNormalized || 'текстовый срок' : deadlineBucket(r.daysDelta, r.deadlineType);
    if (f.deadlineBuckets.length && !f.deadlineBuckets.includes(bucket)) return false;
    if (!orgBlock(r, f)) return false;
    const hay = [r.registrationNumberAndDate, r.summary, r.responsibleRaw, r.sourceDepartmentRaw, ...r.organization.employeeNames].join(
      ' '
    );
    if (!searchHit(hay, f.search)) return false;
    return true;
  });
}

export function attentionSort<T extends { executionStatusNormalized: string; daysDelta: number | null; deadlineType: string }>(
  rows: T[]
): T[] {
  const rank = (r: T) => {
    if (r.executionStatusNormalized === 'Просрочено') return 0;
    if (r.daysDelta != null && r.daysDelta < 0 && !['Снят с контроля', 'Завершено', 'Выполнено'].includes(r.executionStatusNormalized))
      return 1;
    if (r.daysDelta === 0) return 2;
    if (r.daysDelta != null && r.daysDelta <= 3) return 3;
    if (r.daysDelta != null && r.daysDelta <= 7) return 4;
    if (r.daysDelta != null) return 5;
    if (r.deadlineType === 'TEXT') return 6;
    return 7;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.daysDelta ?? 999) - (b.daysDelta ?? 999));
}

export function uniqueSorted(vals: (string | null | undefined)[]) {
  return Array.from(new Set(vals.filter((x): x is string => !!x && !!String(x).trim()))).sort((a, b) => a.localeCompare(b, 'ru'));
}
