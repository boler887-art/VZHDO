import type { AppealRecord, IncomingRecord, ProtocolRecord, StructurePerson } from '../types';
import {
  classifyDeadlineText,
  differenceInCalendarDays,
  formatDate,
  formatDaysDelta,
  parseDate,
  reviveDate,
  startOfDay,
} from './dates';
import { appealNextAction, incomingNextAction, protocolNextAction } from './nextAction';
import { buildLookups, matchPersons } from './structure';
import { splitPersons } from './text';

export function recalcDeadline<T extends ProtocolRecord | AppealRecord | IncomingRecord>(r: T, ref: Date): T {
  const deadlineDate = reviveDate(r.deadlineDate) || parseDate(r.deadlineRaw);
  const textCat = r.deadlineTextNormalized || classifyDeadlineText(r.deadlineRaw);
  const type = deadlineDate ? 'DATE' : textCat ? 'TEXT' : r.deadlineType || 'MISSING';
  const daysDelta = deadlineDate ? differenceInCalendarDays(deadlineDate, startOfDay(ref)) : null;
  const next = {
    ...r,
    deadlineDate,
    daysDelta,
    deadlineType: type,
    deadlineDisplay:
      type === 'DATE'
        ? `${formatDate(deadlineDate)} · ${formatDaysDelta(daysDelta, type, textCat)}`
        : formatDaysDelta(daysDelta, type, textCat || null),
  } as T;
  if ('protocolDate' in next) {
    (next as ProtocolRecord).protocolDate = reviveDate((next as ProtocolRecord).protocolDate);
    (next as ProtocolRecord).nextAction = protocolNextAction(next as ProtocolRecord);
  } else if ('appealNumber' in next) {
    const a = next as AppealRecord;
    a.registrationDate = reviveDate(a.registrationDate);
    a.responseDate = reviveDate(a.responseDate);
    a.nextAction = appealNextAction(a);
  } else {
    (next as IncomingRecord).nextAction = incomingNextAction(next as IncomingRecord);
  }
  return next;
}

export function enrichOperational<T extends ProtocolRecord | AppealRecord | IncomingRecord>(
  rows: T[],
  people: StructurePerson[],
  ref: Date
): T[] {
  const lookups = buildLookups(people);
  return rows.map((r) => {
    const persons = r.responsiblePersons?.length ? r.responsiblePersons : splitPersons(r.responsibleRaw);
    const { matches, org } = matchPersons(persons.length ? persons : r.responsibleRaw ? [r.responsibleRaw] : [], lookups);
    return recalcDeadline({ ...r, responsiblePersons: persons, structureMatches: matches, organization: org }, ref);
  });
}
