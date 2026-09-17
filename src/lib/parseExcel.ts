import * as XLSX from 'xlsx';
import type { AppealRecord, FileMeta, IncomingRecord, ProtocolRecord, StructurePerson } from '../types';
import {
  classifyDeadlineText,
  differenceInCalendarDays,
  formatDate,
  formatDaysDelta,
  parseDate,
  startOfDay,
} from './dates';
import { appealNextAction, incomingNextAction, protocolNextAction } from './nextAction';
import { buildLookups, matchPersons } from './structure';
import { headerKey, normalizeStatus, previewText, splitPersons } from './text';

export const PROTOCOL_COLS = [
  '№ Протокола',
  'Дата',
  '№ поручения',
  'Содержание поручений',
  'Ответственный исполнитель',
  'Срок исполнения',
  'Информация о ходе исполнения',
  'Статус исполнения',
];

export const APPEAL_COLS = [
  'Номер обращения',
  'Дата регистрации обращения',
  'Автор обращения',
  'Вид обращения',
  'Краткое содержание',
  'Срок исполнения',
  'Дата предоставления ответа',
  'Статус исполнения',
  'Ответственный исполнитель',
];

export const INCOMING_COLS = [
  'Рег. номер и дата входящего документа',
  'Краткое содержание',
  'Ответственный исполнитель',
  'Подразделение',
  'Срок исполнения',
  'Статус исполнения',
];

function findHeader(rows: unknown[][], required: string[]): { idx: number; map: Record<string, number> } | null {
  const need = required.map((c) => headerKey(c));
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const keys = rows[i].map((c) => headerKey(c));
    if (keys.every((k) => !k || k.startsWith('column'))) continue;
    const map: Record<string, number> = {};
    keys.forEach((k, idx) => {
      if (k) map[k] = idx;
    });
    const resolved: Record<string, number> = {};
    for (const col of required) {
      const hk = headerKey(col);
      if (map[hk] != null) resolved[col] = map[hk];
      else {
        const alt = Object.keys(map).find((k) => k === hk);
        if (alt) resolved[col] = map[alt];
      }
    }
    if (Object.keys(resolved).length === required.length) return { idx: i, map: resolved };
  }
  return null;
}

function cell(row: unknown[], map: Record<string, number>, col: string): unknown {
  const i = map[col];
  return i == null ? '' : row[i];
}

function deadlineFields(raw: unknown, ref: Date) {
  const textCat = classifyDeadlineText(raw);
  const date = textCat ? null : parseDate(raw);
  const type = date ? 'DATE' : textCat ? 'TEXT' : String(raw ?? '').trim() ? 'TEXT' : 'MISSING';
  const daysDelta = date ? differenceInCalendarDays(date, startOfDay(ref)) : null;
  return {
    deadlineRaw: raw,
    deadlineDate: date,
    deadlineType: type as 'DATE' | 'TEXT' | 'MISSING',
    deadlineTextNormalized: textCat || (type === 'TEXT' ? String(raw).trim() : null),
    daysDelta,
    deadlineDisplay: type === 'DATE' ? `${formatDate(date)} · ${formatDaysDelta(daysDelta, type, textCat)}` : formatDaysDelta(daysDelta, type, textCat || String(raw ?? '').trim() || null),
  };
}

export function parseProtocols(
  wb: XLSX.WorkBook,
  people: StructurePerson[],
  ref: Date,
  fileName: string
): { rows: ProtocolRecord[]; meta: FileMeta } {
  const lookups = buildLookups(people);
  const warnings: string[] = [];
  const errors: string[] = [];
  let sheetName = wb.SheetNames[0];
  let header: ReturnType<typeof findHeader> = null;
  let rows: unknown[][] = [];
  for (const sn of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }) as unknown[][];
    const h = findHeader(r, PROTOCOL_COLS);
    if (h) {
      sheetName = sn;
      header = h;
      rows = r;
      break;
    }
  }
  if (!header) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: 0, validRows: 0, ignoredRows: 0,
        warnings, errors: ['Не найдены обязательные колонки протоколов'], dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const missing = PROTOCOL_COLS.filter((c) => header!.map[c] == null);
  if (missing.length) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: 0, ignoredRows: 0,
        warnings: [], errors: ['Отсутствуют обязательные колонки: ' + missing.join(', ')],
        dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const out: ProtocolRecord[] = [];
  let ignored = 0;
  for (let i = header.idx + 1; i < rows.length; i++) {
    const row = rows[i];
    const assignment = String(cell(row, header.map, '№ поручения') ?? '').trim();
    const text = String(cell(row, header.map, 'Содержание поручений') ?? '').trim();
    if (!assignment && !text) {
      ignored++;
      continue;
    }
    if (/^протокол/i.test(text) && !assignment) {
      ignored++;
      continue;
    }
    const responsibleRaw = String(cell(row, header.map, 'Ответственный исполнитель') ?? '').trim() || null;
    const persons = splitPersons(responsibleRaw);
    const { matches, org } = matchPersons(persons.length ? persons : responsibleRaw ? [responsibleRaw] : [], lookups);
    const dl = deadlineFields(cell(row, header.map, 'Срок исполнения'), ref);
    const statusRaw = String(cell(row, header.map, 'Статус исполнения') ?? '').trim() || null;
    const status = normalizeStatus(statusRaw);
    const progress = String(cell(row, header.map, 'Информация о ходе исполнения') ?? '').trim() || null;
    const protoDate = parseDate(cell(row, header.map, 'Дата'));
    const rec: ProtocolRecord = {
      id: `p-${i}-${assignment}`,
      protocolNumberRaw: String(cell(row, header.map, '№ Протокола') ?? '').trim() || null,
      protocolDateRaw: cell(row, header.map, 'Дата'),
      protocolDate: protoDate,
      assignmentNumberRaw: assignment || null,
      assignmentText: text || null,
      responsibleRaw,
      responsiblePersons: persons,
      ...dl,
      progressInfo: progress,
      progressPreview: previewText(progress),
      executionStatusRaw: statusRaw,
      executionStatusNormalized: status,
      structureMatches: matches,
      organization: org,
      nextAction: '',
      sourceFile: '1.xlsx',
      sourceSheet: sheetName,
      sourceRowNumber: i + 1,
      qualityWarnings: [],
    };
    rec.nextAction = protocolNextAction(rec);
    const active = !['Снят с контроля', 'Постоянно'].includes(status);
    if (active && rec.deadlineType === 'DATE' && rec.daysDelta != null && rec.daysDelta < 0 && status !== 'Просрочено') {
      rec.qualityWarnings.push('Срок истёк, но статус источника не «Просрочено»');
    }
    if (org.matchState === 'NOT_FOUND' && responsibleRaw) rec.qualityWarnings.push('Исполнитель не сопоставлен со структурой');
    out.push(rec);
  }
  const dates = out.map((r) => r.protocolDate).filter(Boolean) as Date[];
  const dateRange = dates.length
    ? `${formatDate(new Date(Math.min(...dates.map((d) => d.getTime()))))} — ${formatDate(new Date(Math.max(...dates.map((d) => d.getTime()))))}`
    : '—';
  return {
    rows: out,
    meta: {
      fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: out.length, ignoredRows: ignored,
      warnings, errors, dateRange, loadedAt: new Date().toISOString(),
    },
  };
}

export function parseAppeals(
  wb: XLSX.WorkBook,
  people: StructurePerson[],
  ref: Date,
  fileName: string
): { rows: AppealRecord[]; meta: FileMeta } {
  const lookups = buildLookups(people);
  const errors: string[] = [];
  let sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' }) as unknown[][];
  const header = findHeader(rows, APPEAL_COLS);
  if (!header) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: 0, validRows: 0, ignoredRows: 0,
        warnings: [], errors: ['Не найдены обязательные колонки e-Өтініш'], dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const missing = APPEAL_COLS.filter((c) => header.map[c] == null);
  if (missing.length) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: 0, ignoredRows: 0,
        warnings: [], errors: ['Отсутствуют обязательные колонки: ' + missing.join(', ')],
        dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const out: AppealRecord[] = [];
  let ignored = 0;
  for (let i = header.idx + 1; i < rows.length; i++) {
    const row = rows[i];
    const num = String(cell(row, header.map, 'Номер обращения') ?? '').trim();
    const summary = String(cell(row, header.map, 'Краткое содержание') ?? '').trim();
    if (!num && !summary) {
      ignored++;
      continue;
    }
    const responsibleRaw = String(cell(row, header.map, 'Ответственный исполнитель') ?? '').trim() || null;
    const persons = splitPersons(responsibleRaw);
    const { matches, org } = matchPersons(persons.length ? persons : responsibleRaw ? [responsibleRaw] : [], lookups);
    const dl = deadlineFields(cell(row, header.map, 'Срок исполнения'), ref);
    const rec: AppealRecord = {
      id: `a-${i}-${num}`,
      appealNumber: num || null,
      registrationDateRaw: cell(row, header.map, 'Дата регистрации обращения'),
      registrationDate: parseDate(cell(row, header.map, 'Дата регистрации обращения')),
      applicant: String(cell(row, header.map, 'Автор обращения') ?? '').trim() || null,
      appealType: String(cell(row, header.map, 'Вид обращения') ?? '').trim() || null,
      summary: summary || null,
      ...dl,
      responseDateRaw: cell(row, header.map, 'Дата предоставления ответа'),
      responseDate: parseDate(cell(row, header.map, 'Дата предоставления ответа')),
      executionStatusRaw: String(cell(row, header.map, 'Статус исполнения') ?? '').trim() || null,
      executionStatusNormalized: normalizeStatus(cell(row, header.map, 'Статус исполнения')),
      responsibleRaw,
      responsiblePersons: persons,
      structureMatches: matches,
      organization: org,
      nextAction: '',
      sourceFile: '2.xlsx',
      sourceSheet: sheetName,
      sourceRowNumber: i + 1,
      qualityWarnings: [],
    };
    rec.nextAction = appealNextAction(rec);
    out.push(rec);
  }
  return {
    rows: out,
    meta: {
      fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: out.length, ignoredRows: ignored,
      warnings: [], errors, dateRange: '—', loadedAt: new Date().toISOString(),
    },
  };
}

export function parseIncoming(
  wb: XLSX.WorkBook,
  people: StructurePerson[],
  ref: Date,
  fileName: string
): { rows: IncomingRecord[]; meta: FileMeta } {
  const lookups = buildLookups(people);
  const errors: string[] = [];
  let sheetName = wb.SheetNames[0];
  let header: ReturnType<typeof findHeader> = null;
  let rows: unknown[][] = [];
  for (const sn of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }) as unknown[][];
    const h = findHeader(r, INCOMING_COLS);
    if (h) {
      sheetName = sn;
      header = h;
      rows = r;
      break;
    }
  }
  if (!header) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: 0, validRows: 0, ignoredRows: 0,
        warnings: [], errors: ['Не найдены обязательные колонки входящих'], dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const missing = INCOMING_COLS.filter((c) => header!.map[c] == null);
  if (missing.length) {
    return {
      rows: [],
      meta: {
        fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: 0, ignoredRows: 0,
        warnings: [], errors: ['Отсутствуют обязательные колонки: ' + missing.join(', ')],
        dateRange: '—', loadedAt: new Date().toISOString(),
      },
    };
  }
  const out: IncomingRecord[] = [];
  let ignored = 0;
  for (let i = header.idx + 1; i < rows.length; i++) {
    const row = rows[i];
    const reg = String(cell(row, header.map, 'Рег. номер и дата входящего документа') ?? '').trim();
    const summary = String(cell(row, header.map, 'Краткое содержание') ?? '').trim();
    if (!reg && !summary) {
      ignored++;
      continue;
    }
    if (/напоминание|по сроку исполнения/i.test(reg + summary)) {
      ignored++;
      continue;
    }
    const responsibleRaw = String(cell(row, header.map, 'Ответственный исполнитель') ?? '').trim() || null;
    const dept = String(cell(row, header.map, 'Подразделение') ?? '').trim() || null;
    const persons = splitPersons(responsibleRaw);
    const { matches, org } = matchPersons(persons.length ? persons : responsibleRaw ? [responsibleRaw] : [], lookups);
    const dl = deadlineFields(cell(row, header.map, 'Срок исполнения'), ref);
    const rec: IncomingRecord = {
      id: `i-${i}-${reg}`,
      registrationNumberAndDate: reg || null,
      summary: summary || null,
      responsibleRaw,
      responsiblePersons: persons,
      sourceDepartmentRaw: dept,
      ...dl,
      executionStatusRaw: String(cell(row, header.map, 'Статус исполнения') ?? '').trim() || null,
      executionStatusNormalized: normalizeStatus(cell(row, header.map, 'Статус исполнения')),
      structureMatches: matches,
      organization: org,
      nextAction: '',
      sourceFile: '3.xlsx',
      sourceSheet: sheetName,
      sourceRowNumber: i + 1,
      qualityWarnings: [],
    };
    rec.nextAction = incomingNextAction(rec);
    out.push(rec);
  }
  return {
    rows: out,
    meta: {
      fileName, sheet: sheetName, headerRow: header.idx + 1, validRows: out.length, ignoredRows: ignored,
      warnings: [], errors, dateRange: '—', loadedAt: new Date().toISOString(),
    },
  };
}

export function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'array', cellDates: true });
}
