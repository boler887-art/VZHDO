import type {
  AppealRecord,
  DataWarning,
  FileMeta,
  IncomingRecord,
  ProtocolRecord,
  ProtocolStatus,
  AppealStatus,
  IncomingStatus,
  StructurePerson,
} from './types';
import { classifyDeadline, deadlineBucket, differenceInCalendarDays, parseDate } from './dates';
import {
  cellStr,
  findHeaderRow,
  findSheet,
  getByHeader,
  headerIndexMap,
  matchPerson,
  missingRequired,
  readWorkbook,
  sheetToRows,
  splitNames,
} from './excel';

function enrichFromPerson(name: string | null, structure: StructurePerson[]) {
  if (!name) return { department: 'Не определено', curator: 'Не определено', departmentHead: 'Не определено' };
  const first = splitNames(name)[0] || name;
  const p = matchPerson(first, structure);
  if (!p) return { department: 'Не определено', curator: 'Не определено', departmentHead: 'Не определено' };
  return {
    department: p.unit || p.department || 'Не определено',
    curator: p.curator || 'Не определено',
    departmentHead: p.head || 'Не определено',
  };
}

function protoStatus(raw: string | null): ProtocolStatus {
  const s = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return 'Не определено';
  if (s.includes('снят с контроля')) return 'Снят с контроля';
  if (s.includes('на снятии')) return 'На снятии с контроля';
  if (s.includes('рабочий контроль')) return 'Рабочий контроль';
  if (s.includes('не исполнен')) return 'Не исполнен';
  if (s.includes('в работе')) return 'В работе';
  return 'Не определено';
}

function appealStatus(raw: string | null): AppealStatus {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('заверш')) return 'Завершено';
  if (s.includes('исполнен')) return 'На исполнении';
  return raw ? 'Не определено' : 'Не определено';
}

function incomingStatus(raw: string | null): IncomingStatus {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'выполнено' || s === 'выполнен') return s === 'выполнено' ? 'Выполнено' : 'Выполнен';
  if (s.includes('выполн')) return 'Выполнено';
  if (s.includes('не исполн')) return 'Не исполнено';
  if (s.includes('исполнен')) return 'На исполнении';
  return raw ? 'Не определено' : 'Не определено';
}

export function parseProtocols(
  buf: ArrayBuffer,
  fileName: string,
  referenceDate: Date,
  structure: StructurePerson[],
): { records: ProtocolRecord[]; warnings: DataWarning[]; meta: FileMeta } {
  const warnings: DataWarning[] = [];
  const wb = readWorkbook(buf);
  const required = [
    '№ Протокола',
    'Дата',
    '№ поручения',
    'Содержание поручений',
    'Ответственный исполнитель',
    'Срок исполнения',
    'Информация о ходе исполнения',
    'Статус исполнения',
  ];
  const sheet = findSheet(wb, 'Протокола ЦУО 2026', required);
  if (!sheet) {
    warnings.push({ level: 'ERROR', message: 'Не найден лист протоколов', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const rows = sheetToRows(wb, sheet);
  const hi = findHeaderRow(rows, required);
  if (hi < 0) {
    warnings.push({ level: 'ERROR', message: 'Не найдена шапка в 1.xlsx', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const map = headerIndexMap(rows[hi]);
  const miss = missingRequired(map, required);
  if (miss.length) {
    warnings.push({
      level: 'ERROR',
      message: `Файл 1.xlsx не загружен: не найден обязательный столбец «${miss[0]}».`,
      sourceFile: fileName,
    });
    return emptyMeta(fileName, warnings);
  }
  const records: ProtocolRecord[] = [];
  let ignored = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const assignmentNumberRaw = cellStr(getByHeader(row, map, '№ поручения'));
    const assignmentText = cellStr(getByHeader(row, map, 'Содержание поручений'));
    if (!assignmentNumberRaw && !assignmentText) {
      ignored++;
      continue;
    }
    const statusRaw = cellStr(getByHeader(row, map, 'Статус исполнения'));
    const status = protoStatus(statusRaw);
    if (status === 'Не определено' && statusRaw) {
      warnings.push({ level: 'WARNING', message: `Неизвестный статус: ${statusRaw}`, sourceFile: fileName, sourceRowNumber: i + 1 });
    }
    const deadlineRaw = getByHeader(row, map, 'Срок исполнения');
    const dl = classifyDeadline(deadlineRaw);
    const isFinal = status === 'Снят с контроля';
    const isActive = !isFinal;
    const daysDelta = dl.type === 'DATE' && dl.date ? differenceInCalendarDays(dl.date, referenceDate) : null;
    const isOverdue = isActive && dl.type === 'DATE' && dl.date !== null && dl.date < referenceDate;
    const responsibleRaw = cellStr(getByHeader(row, map, 'Ответственный исполнитель'));
    const org = enrichFromPerson(responsibleRaw, structure);
    const protocolDateRaw = getByHeader(row, map, 'Дата');
    records.push({
      id: `p-${i + 1}`,
      sourceFile: fileName,
      sourceSheet: sheet,
      sourceRowNumber: i + 1,
      protocolNumberRaw: cellStr(getByHeader(row, map, '№ Протокола')),
      protocolDateRaw,
      protocolDate: parseDate(protocolDateRaw),
      assignmentNumberRaw,
      assignmentText,
      responsibleRaw,
      responsiblePersons: splitNames(responsibleRaw),
      deadlineRaw,
      deadlineDate: dl.date,
      deadlineType: dl.type,
      progressInfo: cellStr(getByHeader(row, map, 'Информация о ходе исполнения')),
      executionStatusRaw: statusRaw,
      executionStatusNormalized: status,
      daysDelta,
      isFinal,
      isActive,
      isOverdue,
      deadlineBucket: deadlineBucket(daysDelta, dl.type),
      ...org,
    });
  }
  return {
    records,
    warnings,
    meta: makeMeta(fileName, sheet, hi + 1, records.length, ignored, warnings),
  };
}

export function parseAppeals(
  buf: ArrayBuffer,
  fileName: string,
  referenceDate: Date,
  structure: StructurePerson[],
): { records: AppealRecord[]; warnings: DataWarning[]; meta: FileMeta } {
  const warnings: DataWarning[] = [];
  const wb = readWorkbook(buf);
  const required = [
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
  const sheet = findSheet(wb, 'Report', required);
  if (!sheet) {
    warnings.push({ level: 'ERROR', message: 'Не найден лист обращений', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const rows = sheetToRows(wb, sheet);
  const hi = findHeaderRow(rows, required);
  if (hi < 0) {
    warnings.push({ level: 'ERROR', message: 'Не найдена шапка в 2.xlsx', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const map = headerIndexMap(rows[hi]);
  const miss = missingRequired(map, required);
  if (miss.length) {
    warnings.push({
      level: 'ERROR',
      message: `Файл 2.xlsx не загружен: не найден обязательный столбец «${miss[0]}».`,
      sourceFile: fileName,
    });
    return emptyMeta(fileName, warnings);
  }
  const records: AppealRecord[] = [];
  let ignored = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const appealNumber = cellStr(getByHeader(row, map, 'Номер обращения'));
    const summary = cellStr(getByHeader(row, map, 'Краткое содержание'));
    if (!appealNumber && !summary) {
      ignored++;
      continue;
    }
    const statusRaw = cellStr(getByHeader(row, map, 'Статус исполнения'));
    const status = appealStatus(statusRaw);
    const deadlineRaw = getByHeader(row, map, 'Срок исполнения');
    const dl = classifyDeadline(deadlineRaw);
    const isFinal = status === 'Завершено';
    const isActive = status === 'На исполнении';
    const daysDelta = dl.type === 'DATE' && dl.date ? differenceInCalendarDays(dl.date, referenceDate) : null;
    const isOverdue = isActive && dl.type === 'DATE' && daysDelta != null && daysDelta < 0;
    const responsibleEmployee = cellStr(getByHeader(row, map, 'Ответственный исполнитель'));
    records.push({
      id: `a-${i + 1}`,
      sourceFile: fileName,
      sourceSheet: sheet,
      sourceRowNumber: i + 1,
      appealNumber,
      registrationDateRaw: getByHeader(row, map, 'Дата регистрации обращения'),
      registrationDate: parseDate(getByHeader(row, map, 'Дата регистрации обращения')),
      applicant: cellStr(getByHeader(row, map, 'Автор обращения')),
      appealType: cellStr(getByHeader(row, map, 'Вид обращения')),
      summary,
      deadlineRaw,
      deadlineDate: dl.date,
      deadlineType: dl.type,
      responseDateRaw: getByHeader(row, map, 'Дата предоставления ответа'),
      responseDate: parseDate(getByHeader(row, map, 'Дата предоставления ответа')),
      executionStatusRaw: statusRaw,
      executionStatusNormalized: status,
      responsibleEmployee,
      daysDelta,
      isFinal,
      isActive,
      isOverdue,
      deadlineBucket: deadlineBucket(daysDelta, dl.type),
      ...enrichFromPerson(responsibleEmployee, structure),
    });
  }
  return { records, warnings, meta: makeMeta(fileName, sheet, hi + 1, records.length, ignored, warnings) };
}

export function parseIncoming(
  buf: ArrayBuffer,
  fileName: string,
  referenceDate: Date,
  structure: StructurePerson[],
): { records: IncomingRecord[]; warnings: DataWarning[]; meta: FileMeta } {
  const warnings: DataWarning[] = [];
  const wb = readWorkbook(buf);
  const required = [
    'Рег. номер и дата входящего документа',
    'Краткое содержание',
    'Ответственный исполнитель',
    'Подразделение',
    'Срок исполнения',
    'Статус исполнения',
  ];
  const sheet = findSheet(wb, 'Напоминание', required);
  if (!sheet) {
    warnings.push({ level: 'ERROR', message: 'Не найден лист входящих', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const rows = sheetToRows(wb, sheet);
  const hi = findHeaderRow(rows, required);
  if (hi < 0) {
    warnings.push({ level: 'ERROR', message: 'Не найдена шапка в 3.xlsx', sourceFile: fileName });
    return emptyMeta(fileName, warnings);
  }
  const map = headerIndexMap(rows[hi]);
  const miss = missingRequired(map, required);
  if (miss.length) {
    warnings.push({
      level: 'ERROR',
      message: `Файл 3.xlsx не загружен: не найден обязательный столбец «${miss[0]}».`,
      sourceFile: fileName,
    });
    return emptyMeta(fileName, warnings);
  }
  const records: IncomingRecord[] = [];
  let ignored = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const registrationNumberAndDate = cellStr(getByHeader(row, map, 'Рег. номер и дата входящего документа'));
    const summary = cellStr(getByHeader(row, map, 'Краткое содержание'));
    if (!registrationNumberAndDate && !summary) {
      ignored++;
      continue;
    }
    const statusRaw = cellStr(getByHeader(row, map, 'Статус исполнения'));
    const status = incomingStatus(statusRaw);
    const deadlineRaw = getByHeader(row, map, 'Срок исполнения');
    const dl = classifyDeadline(deadlineRaw);
    const isFinal = status === 'Выполнен' || status === 'Выполнено';
    const isActive = status === 'Не исполнено' || status === 'На исполнении';
    const daysDelta = dl.type === 'DATE' && dl.date ? differenceInCalendarDays(dl.date, referenceDate) : null;
    const isOverdue = isActive && dl.type === 'DATE' && daysDelta != null && daysDelta < 0;
    const responsibleEmployee = cellStr(getByHeader(row, map, 'Ответственный исполнитель'));
    const departmentRaw = cellStr(getByHeader(row, map, 'Подразделение'));
    const org = enrichFromPerson(responsibleEmployee, structure);
    records.push({
      id: `i-${i + 1}`,
      sourceFile: fileName,
      sourceSheet: sheet,
      sourceRowNumber: i + 1,
      registrationNumberAndDate,
      summary,
      responsibleEmployee,
      departmentRaw,
      deadlineRaw,
      deadlineDate: dl.date,
      deadlineType: dl.type,
      executionStatusRaw: statusRaw,
      executionStatusNormalized: status,
      daysDelta,
      isFinal,
      isActive,
      isOverdue,
      deadlineBucket: deadlineBucket(daysDelta, dl.type),
      department: departmentRaw || org.department,
      curator: org.curator,
      departmentHead: org.departmentHead,
    });
  }
  return { records, warnings, meta: makeMeta(fileName, sheet, hi + 1, records.length, ignored, warnings) };
}

function makeMeta(
  fileName: string,
  sheet: string,
  headerRow: number,
  valid: number,
  ignored: number,
  warnings: DataWarning[],
): FileMeta {
  return {
    fileName,
    sheet,
    headerRow,
    validCount: valid,
    ignoredCount: ignored,
    warningCount: warnings.filter((w) => w.level === 'WARNING').length,
    errorCount: warnings.filter((w) => w.level === 'ERROR').length,
    loadedAt: new Date().toISOString(),
  };
}

function emptyMeta(fileName: string, warnings: DataWarning[]) {
  return {
    records: [] as never[],
    warnings,
    meta: makeMeta(fileName, '—', 0, 0, 0, warnings),
  };
}
