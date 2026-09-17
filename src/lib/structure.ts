import * as XLSX from 'xlsx';
import type { OrganizationalEnrichment, StructurePerson } from '../types';
import { headerKey, norm, parseSurnameInitials } from './text';

const EXPECTED = [
  'ф.и.о.',
  'шифр',
  'должность',
  'департаменты',
  'руководитель- куратор',
  'руководитель-куратор',
  'руководитель подразделения',
  'подразделение',
  'руководители сп',
];

export function parseStructureWorkbook(wb: XLSX.WorkBook): StructurePerson[] {
  const out: StructurePerson[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
    let headerIdx = -1;
    let map: Record<string, number> = {};
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const keys = rows[i].map((c) => headerKey(c));
      const hasFio = keys.some((k) => k === 'ф.и.о.' || k === 'фио');
      const hasCode = keys.some((k) => k === 'шифр');
      if (hasFio && hasCode) {
        headerIdx = i;
        keys.forEach((k, idx) => {
          if (k.includes('куратор')) map['куратор'] = idx;
          else if (k.includes('руководитель подразделения')) map['head'] = idx;
          else if (k.includes('руководители сп')) map['sp'] = idx;
          else if (k.includes('департамент')) map['dept'] = idx;
          else if (k === 'подразделение') map['unit'] = idx;
          else if (k === 'должность') map['pos'] = idx;
          else if (k === 'шифр') map['code'] = idx;
          else if (k === 'ф.и.о.' || k === 'фио') map['fio'] = idx;
        });
        break;
      }
    }
    if (headerIdx < 0) continue;
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const fio = String(row[map.fio] ?? '').trim();
      const code = String(row[map.code] ?? '').trim();
      if (!fio && !code) continue;
      if (/^структура/i.test(fio)) continue;
      out.push({
        fullName: fio || null,
        code: code || null,
        position: String(row[map.pos] ?? '').trim() || null,
        departmentGroup: String(row[map.dept] ?? '').trim() || null,
        curator: String(row[map.куратор] ?? '').trim() || null,
        departmentHead: String(row[map.head] ?? '').trim() || null,
        unit: String(row[map.unit] ?? '').trim() || null,
        spLeader: String(row[map.sp] ?? '').trim() || null,
        sourceRowNumber: r + 1,
      });
    }
  }
  return out;
}

export function buildLookups(people: StructurePerson[]) {
  const byFull = new Map<string, StructurePerson[]>();
  const bySI = new Map<string, StructurePerson[]>();
  const bySurname = new Map<string, StructurePerson[]>();
  for (const p of people) {
    if (!p.fullName) continue;
    const n = norm(p.fullName);
    byFull.set(n, [...(byFull.get(n) || []), p]);
    const si = parseSurnameInitials(p.fullName);
    if (si) {
      const k = `${si.surname}|${si.initials}`;
      bySI.set(k, [...(bySI.get(k) || []), p]);
      bySurname.set(si.surname, [...(bySurname.get(si.surname) || []), p]);
    }
  }
  return { byFull, bySI, bySurname };
}

export function matchPersons(
  names: string[],
  lookups: ReturnType<typeof buildLookups>
): { matches: StructurePerson[]; org: OrganizationalEnrichment } {
  const matches: StructurePerson[] = [];
  let state: OrganizationalEnrichment['matchState'] = names.length ? 'NOT_FOUND' : 'NOT_FOUND';
  for (const name of names) {
    const n = norm(name);
    let found = lookups.byFull.get(n) || [];
    if (!found.length) {
      const si = parseSurnameInitials(name);
      if (si) {
        found = lookups.bySI.get(`${si.surname}|${si.initials}`) || [];
        if (!found.length) {
          const same = lookups.bySurname.get(si.surname) || [];
          if (same.length === 1 && !si.initials) found = same;
          else if (same.length > 1 && si.initials) state = 'AMBIGUOUS';
        }
      }
    }
    if (found.length === 1) {
      matches.push(found[0]);
      state = matches.length === names.length ? 'MATCHED' : 'PARTIAL';
    } else if (found.length > 1) {
      matches.push(...found);
      state = 'AMBIGUOUS';
    }
  }
  const uniq = Array.from(new Map(matches.map((m) => [m.fullName + '|' + m.code, m])).values());
  const pick = (fn: (p: StructurePerson) => string | null) =>
    Array.from(new Set(uniq.map(fn).filter((x): x is string => !!x)));
  return {
    matches: uniq,
    org: {
      employeeNames: pick((p) => p.fullName),
      codes: pick((p) => p.code),
      positions: pick((p) => p.position),
      departments: pick((p) => p.departmentGroup),
      curators: pick((p) => p.curator),
      departmentHeads: pick((p) => p.departmentHead),
      units: pick((p) => p.unit),
      spLeaders: pick((p) => p.spLeader),
      matchState: uniq.length ? (state === 'AMBIGUOUS' ? 'AMBIGUOUS' : names.length > uniq.length ? 'PARTIAL' : 'MATCHED') : 'NOT_FOUND',
    },
  };
}
