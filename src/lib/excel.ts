import type { DataWarning, StructurePerson } from './types';

declare const XLSX: any;

export function normalizeHeader(s: string): string {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function cellStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

export function readWorkbook(data: ArrayBuffer) {
  return XLSX.read(data, { type: 'array', cellDates: true });
}

export function sheetToRows(wb: any, sheetName: string): unknown[][] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
}

export function findSheet(wb: any, preferred: string, requiredHeaders: string[]): string | null {
  if (wb.SheetNames.includes(preferred)) return preferred;
  const needed = requiredHeaders.map(normalizeHeader);
  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb, name).slice(0, 15);
    for (const row of rows) {
      const headers = (row || []).map((c) => normalizeHeader(String(c ?? '')));
      const hit = needed.filter((h) => headers.includes(h)).length;
      if (hit >= Math.min(4, needed.length)) return name;
    }
  }
  return wb.SheetNames[0] || null;
}

export function findHeaderRow(rows: unknown[][], required: string[]): number {
  const needed = required.map(normalizeHeader);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] || []).map((c) => normalizeHeader(String(c ?? '')));
    const score = needed.filter((h) => headers.includes(h)).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function headerIndexMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  (headerRow || []).forEach((c, i) => {
    const n = normalizeHeader(String(c ?? ''));
    if (n && map[n] == null) map[n] = i;
  });
  return map;
}

export function getByHeader(row: unknown[], map: Record<string, number>, label: string): unknown {
  const i = map[normalizeHeader(label)];
  if (i == null) return null;
  return row[i] ?? null;
}

export function missingRequired(map: Record<string, number>, required: string[]): string[] {
  return required.filter((r) => map[normalizeHeader(r)] == null);
}

export function splitNames(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normPerson(name: string): string {
  return name
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '.')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export function matchPerson(name: string, structure: StructurePerson[]): StructurePerson | null {
  const n = normPerson(name);
  if (!n) return null;
  const exact = structure.filter((p) => normPerson(p.fullName) === n);
  if (exact.length === 1) return exact[0];
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const sur = normPerson(parts[0]);
    const initials = parts
      .slice(1)
      .map((p) => p.replace(/\./g, '').charAt(0).toLowerCase())
      .join('');
    const cand = structure.filter((p) => {
      const pp = p.fullName.trim().split(/\s+/);
      if (!pp.length) return false;
      if (normPerson(pp[0]) !== sur) return false;
      const pi = pp
        .slice(1)
        .map((x) => x.replace(/\./g, '').charAt(0).toLowerCase())
        .join('');
      return pi.startsWith(initials) || initials.startsWith(pi);
    });
    if (cand.length === 1) return cand[0];
  }
  return null;
}

export function parseStructure(wb: any, warnings: DataWarning[]): StructurePerson[] {
  const sheet = wb.SheetNames[0];
  const rows = sheetToRows(wb, sheet);
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = (rows[i] || []).map((c) => normalizeHeader(String(c ?? ''))).join('|');
    if (joined.includes('ф.и.о') || joined.includes('фио') || joined.includes('шифр')) {
      header = i;
      break;
    }
  }
  if (header < 0) {
    warnings.push({ level: 'WARNING', message: 'Не найдена шапка в structure.xlsx', sourceFile: 'structure.xlsx' });
    return [];
  }
  const map = headerIndexMap(rows[header]);
  const out: StructurePerson[] = [];
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const fullName = cellStr(getByHeader(row, map, 'Ф.И.О.')) || cellStr(row[0]);
    if (!fullName) continue;
    if (fullName.length < 3) continue;
    out.push({
      fullName,
      code: cellStr(getByHeader(row, map, 'Шифр')) || '',
      position: cellStr(getByHeader(row, map, 'Должность')) || '',
      department: cellStr(getByHeader(row, map, 'Департаменты')) || cellStr(getByHeader(row, map, 'Подразделение')) || '',
      curator: cellStr(getByHeader(row, map, 'Руководитель- куратор')) || cellStr(getByHeader(row, map, 'Руководитель-куратор')) || '',
      head: cellStr(getByHeader(row, map, 'Руководитель подразделения')) || '',
      unit: cellStr(getByHeader(row, map, 'Подразделение')) || '',
    });
  }
  return out;
}
