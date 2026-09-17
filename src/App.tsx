import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileInput,
  Home,
  Inbox,
  Lock,
  Upload,
} from 'lucide-react';
import type {
  AppealRecord,
  FileMeta,
  FilterState,
  IncomingRecord,
  PageId,
  ProtocolRecord,
  StructurePerson,
} from './types';
import { emptyFilters } from './types';
import { formatDate, startOfDay } from './lib/dates';
import { enrichOperational } from './lib/enrich';
import { attentionSort, filterAppeals, filterIncoming, filterProtocols, uniqueSorted } from './lib/filters';
import { parseAppeals, parseIncoming, parseProtocols, readWorkbook } from './lib/parseExcel';
import { loadStore, saveStore } from './lib/persist';
import { parseStructureWorkbook } from './lib/structure';

const base = import.meta.env.BASE_URL;
const LOGO = `${base}assets/vzhdo-logo.png`;

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const opts = options.filter((o) => o && o.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="ms">
      <button className="chip-btn" type="button" onClick={() => setOpen((v) => !v)}>
        {label}
        {value.length ? ` (${value.length})` : ''} ▾
      </button>
      {open && (
        <div className="ms-menu">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" style={{ width: '100%', marginBottom: 8 }} />
          <label>
            <input type="checkbox" checked={!value.length} onChange={() => onChange([])} /> Все
          </label>
          {opts.slice(0, 200).map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={value.includes(o)}
                onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
              />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function statusBadge(s: string) {
  const n = (s || '').toLowerCase();
  const cls =
    /на снятии/.test(n) ? 'b-orange' :
    /просроч|не исполнен/.test(n) ? 'b-red' :
    /рабочий контроль|на исполнен|в работе/.test(n) ? 'b-amber' :
    /снят с контроля|заверш|выполнен/.test(n) ? 'b-green' : 'b-blue';
  return <span className={`badge ${cls}`}>{s || '—'}</span>;
}

export default function App() {
  const [page, setPage] = useState<PageId>('overview');
  const [people, setPeople] = useState<StructurePerson[]>([]);
  const [structStatus, setStructStatus] = useState('загрузка…');
  const [logoOk, setLogoOk] = useState(true);
  const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [incoming, setIncoming] = useState<IncomingRecord[]>([]);
  const [meta, setMeta] = useState<Record<string, FileMeta | null>>({ p: null, a: null, i: null });
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [kpi, setKpi] = useState<string | undefined>();
  const [tab, setTab] = useState('Все');
  const [drawer, setDrawer] = useState<ProtocolRecord | AppealRecord | IncomingRecord | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const ref = startOfDay(new Date());

  useEffect(() => {
    let loadedPeople: StructurePerson[] = [];
    const apply = (ppl: StructurePerson[], s: { protocols?: ProtocolRecord[]; appeals?: AppealRecord[]; incoming?: IncomingRecord[]; meta?: Record<string, FileMeta | null> } | null) => {
      if (!s) return;
      setProtocols(enrichOperational(s.protocols || [], ppl, ref));
      setAppeals(enrichOperational(s.appeals || [], ppl, ref));
      setIncoming(enrichOperational(s.incoming || [], ppl, ref));
      setMeta(s.meta || { p: null, a: null, i: null });
    };
    Promise.all([
      fetch(`${base}structure.xlsx`)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const p = parseStructureWorkbook(readWorkbook(buf));
          loadedPeople = p;
          setPeople(p);
          setStructStatus(p.length ? `загружена · ${p.length} записей` : 'ошибка: пустая структура');
          return p;
        })
        .catch(() => {
          setStructStatus('ошибка загрузки');
          return [] as StructurePerson[];
        }),
      loadStore(),
    ]).then(([ppl, s]) => apply(ppl.length ? ppl : loadedPeople, s));
  }, []);

  useEffect(() => {
    if (!people.length) return;
    setProtocols((rows) => (rows.length ? enrichOperational(rows, people, ref) : rows));
    setAppeals((rows) => (rows.length ? enrichOperational(rows, people, ref) : rows));
    setIncoming((rows) => (rows.length ? enrichOperational(rows, people, ref) : rows));
  }, [people]);

  useEffect(() => {
    if (protocols.length || appeals.length || incoming.length) {
      saveStore({ protocols, appeals, incoming, meta }).catch(() => undefined);
    }
  }, [protocols, appeals, incoming, meta]);

  const fP = useMemo(() => filterProtocols(protocols, filters, ref, page === 'protocols' || page === 'overview' ? kpi : undefined), [protocols, filters, kpi, page]);
  const fA = useMemo(() => filterAppeals(appeals, filters, page === 'appeals' ? kpi : undefined, page === 'appeals' ? tab : undefined), [appeals, filters, kpi, tab, page]);
  const fI = useMemo(() => filterIncoming(incoming, filters, page === 'incoming' ? kpi : undefined, page === 'incoming' ? tab : undefined), [incoming, filters, kpi, tab, page]);

  const pAll = useMemo(() => filterProtocols(protocols, filters, ref), [protocols, filters]);
  const aAll = useMemo(() => filterAppeals(appeals, filters), [appeals, filters]);
  const iAll = useMemo(() => filterIncoming(incoming, filters), [incoming, filters]);

  const pCounts = {
    all: pAll.length,
    overdue: pAll.filter((r) => r.executionStatusNormalized === 'Просрочено').length,
    work: pAll.filter((r) => r.executionStatusNormalized === 'В работе').length,
    ctrl: pAll.filter((r) => r.executionStatusNormalized === 'Рабочий контроль').length,
    off: pAll.filter((r) => r.executionStatusNormalized === 'На снятии с контроля').length,
    done: pAll.filter((r) => r.executionStatusNormalized === 'Снят с контроля').length,
  };
  const aOver = aAll.filter((r) => r.executionStatusNormalized !== 'Завершено' && r.daysDelta != null && r.daysDelta < 0).length;
  const aDue = aAll.filter((r) => r.executionStatusNormalized !== 'Завершено' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7).length;
  const aDone = aAll.filter((r) => r.executionStatusNormalized === 'Завершено').length;
  const iFinal = (r: IncomingRecord) => ['Выполнено', 'Выполнен'].includes(r.executionStatusNormalized);
  const iOver = iAll.filter((r) => !iFinal(r) && r.daysDelta != null && r.daysDelta < 0).length;
  const iDue = iAll.filter((r) => !iFinal(r) && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7).length;
  const iDone = iAll.filter(iFinal).length;

  async function onFile(kind: 'p' | 'a' | 'i', file: File) {
    const buf = await file.arrayBuffer();
    const wb = readWorkbook(buf);
    if (kind === 'p') {
      const res = parseProtocols(wb, people, ref, file.name);
      if (res.meta.errors.length && !res.rows.length) {
        setMeta((m) => ({ ...m, p: res.meta }));
        return;
      }
      setProtocols(res.rows);
      setMeta((m) => ({ ...m, p: res.meta }));
    } else if (kind === 'a') {
      const res = parseAppeals(wb, people, ref, file.name);
      if (res.meta.errors.length && !res.rows.length) {
        setMeta((m) => ({ ...m, a: res.meta }));
        return;
      }
      setAppeals(res.rows);
      setMeta((m) => ({ ...m, a: res.meta }));
    } else {
      const res = parseIncoming(wb, people, ref, file.name);
      if (res.meta.errors.length && !res.rows.length) {
        setMeta((m) => ({ ...m, i: res.meta }));
        return;
      }
      setIncoming(res.rows);
      setMeta((m) => ({ ...m, i: res.meta }));
    }
  }

  function exportXlsx(rows: object[], name: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'export');
    XLSX.writeFile(wb, name);
  }

  const cascadedPeople = useMemo(() => {
    return people.filter((p) => {
      if (filters.curators.length && !filters.curators.includes(p.curator || '')) return false;
      if (filters.departments.length && !filters.departments.includes(p.departmentGroup || '')) return false;
      if (filters.departmentHeads.length && !filters.departmentHeads.includes(p.departmentHead || '')) return false;
      if (filters.units.length && !filters.units.includes(p.unit || '')) return false;
      if (filters.spLeaders.length && !filters.spLeaders.includes(p.spLeader || '')) return false;
      if (filters.names.length && !filters.names.includes(p.fullName || '')) return false;
      if (filters.codes.length && !filters.codes.includes(p.code || '')) return false;
      if (filters.positions.length && !filters.positions.includes(p.position || '')) return false;
      return true;
    });
  }, [people, filters.curators, filters.departments, filters.departmentHeads, filters.units, filters.spLeaders, filters.names, filters.codes, filters.positions]);

  const orgOpts = useMemo(() => {
    const pool = (except: keyof FilterState) =>
      people.filter((p) => {
        if (except !== 'curators' && filters.curators.length && !filters.curators.includes(p.curator || '')) return false;
        if (except !== 'departments' && filters.departments.length && !filters.departments.includes(p.departmentGroup || '')) return false;
        if (except !== 'departmentHeads' && filters.departmentHeads.length && !filters.departmentHeads.includes(p.departmentHead || '')) return false;
        if (except !== 'units' && filters.units.length && !filters.units.includes(p.unit || '')) return false;
        if (except !== 'spLeaders' && filters.spLeaders.length && !filters.spLeaders.includes(p.spLeader || '')) return false;
        if (except !== 'names' && filters.names.length && !filters.names.includes(p.fullName || '')) return false;
        if (except !== 'codes' && filters.codes.length && !filters.codes.includes(p.code || '')) return false;
        if (except !== 'positions' && filters.positions.length && !filters.positions.includes(p.position || '')) return false;
        return true;
      });
    const take = (list: StructurePerson[], fn: (p: StructurePerson) => string | null) => uniqueSorted(list.map(fn));
    return {
      names: take(pool('names'), (p) => p.fullName),
      codes: take(pool('codes'), (p) => p.code),
      positions: take(pool('positions'), (p) => p.position),
      departments: take(pool('departments'), (p) => p.departmentGroup),
      curators: take(pool('curators'), (p) => p.curator),
      heads: take(pool('departmentHeads'), (p) => p.departmentHead),
      units: uniqueSorted([
        ...pool('units').map((p) => p.unit),
        ...incoming.map((r) => r.sourceDepartmentRaw),
      ]),
      sp: take(pool('spLeaders'), (p) => p.spLeader),
    };
  }, [people, incoming, filters]);

  const statusesP = Array.from(new Set(protocols.map((r) => r.executionStatusNormalized))).sort();
  const statusesA = Array.from(new Set(appeals.map((r) => r.executionStatusNormalized))).sort();
  const statusesI = Array.from(new Set(incoming.map((r) => r.executionStatusNormalized))).sort();
  const typesA = Array.from(new Set(appeals.map((r) => r.appealType).filter(Boolean))) as string[];
  const appsA = Array.from(new Set(appeals.map((r) => r.applicant).filter(Boolean))) as string[];

  const goKpi = (pageId: PageId, key?: string) => {
    setPage(pageId);
    setKpi(key);
    setTab('Все');
  };

  const orgFilters = (
    <>
      <MultiSelect label="Ф.И.О." options={orgOpts.names} value={filters.names} onChange={(v) => setFilters({ ...filters, names: v })} />
      <MultiSelect label="Шифр" options={orgOpts.codes} value={filters.codes} onChange={(v) => setFilters({ ...filters, codes: v })} />
      <MultiSelect label="Должность" options={orgOpts.positions} value={filters.positions} onChange={(v) => setFilters({ ...filters, positions: v })} />
      <MultiSelect label="Департаменты" options={orgOpts.departments} value={filters.departments} onChange={(v) => setFilters({ ...filters, departments: v })} />
      <MultiSelect label="Куратор" options={orgOpts.curators} value={filters.curators} onChange={(v) => setFilters({ ...filters, curators: v })} />
      <MultiSelect label="Рук. подразделения" options={orgOpts.heads} value={filters.departmentHeads} onChange={(v) => setFilters({ ...filters, departmentHeads: v })} />
      <MultiSelect label="Подразделение" options={orgOpts.units} value={filters.units} onChange={(v) => setFilters({ ...filters, units: v })} />
      <MultiSelect label="Руководители СП" options={orgOpts.sp} value={filters.spLeaders} onChange={(v) => setFilters({ ...filters, spLeaders: v })} />
    </>
  );

  const chips = (
    [
      ['names', filters.names],
      ['codes', filters.codes],
      ['positions', filters.positions],
      ['departments', filters.departments],
      ['curators', filters.curators],
      ['departmentHeads', filters.departmentHeads],
      ['units', filters.units],
      ['spLeaders', filters.spLeaders],
      ['statuses', filters.statuses],
      ['deadlineBuckets', filters.deadlineBuckets],
      ['appealTypes', filters.appealTypes],
      ['applicants', filters.applicants],
      ['protocolNumbers', filters.protocolNumbers],
      ['assignmentNumbers', filters.assignmentNumbers],
      ['appealNumbers', filters.appealNumbers],
      ['incomingRegs', filters.incomingRegs],
      ['sourceDepartments', filters.sourceDepartments],
      ['summaries', filters.summaries],
    ] as [string, string[]][]
  ).flatMap(([k, arr]) => arr.map((v) => ({ k, v })));

  const deadlineOpts = uniqueSorted([
    'Просроченный срок',
    'Сегодня',
    '1–3 дня',
    '4–7 дней',
    '8–30 дней',
    'Более 30 дней',
    'постоянно',
    'еженедельно',
    'ежемесячно',
    'Не указан',
    ...protocols.map((r) => r.deadlineTextNormalized),
    ...appeals.map((r) => r.deadlineTextNormalized),
    ...incoming.map((r) => r.deadlineTextNormalized),
  ]);

  const dateRow = (
    <>
      <label className="chip-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        с
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, period: 'Произвольный период' })} />
      </label>
      <label className="chip-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        по
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, period: 'Произвольный период' })} />
      </label>
    </>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo-wrap">
          <img src={LOGO} alt="ВЖДО" onError={() => setLogoOk(false)} />
        </div>
        <div className="brand">ТОО «ВЖДО»</div>
        <nav className="nav">
          <button className={page === 'overview' ? 'active' : ''} onClick={() => { setPage('overview'); setKpi(undefined); }}><Home size={18} /><span className="label">Обзор</span></button>
          <button className={page === 'protocols' ? 'active' : ''} onClick={() => { setPage('protocols'); setKpi(undefined); }}><ClipboardList size={18} /><span className="label">Протоколы</span></button>
          <button className={page === 'appeals' ? 'active' : ''} onClick={() => { setPage('appeals'); setKpi(undefined); setTab('Все'); }}><Inbox size={18} /><span className="label">e-Өтініш</span></button>
          <button className={page === 'incoming' ? 'active' : ''} onClick={() => { setPage('incoming'); setKpi(undefined); setTab('Все'); }}><FileInput size={18} /><span className="label">Входящие</span></button>
        </nav>
        <div className="nav-spacer" />
        <nav className="nav" style={{ marginBottom: 18 }}>
          <button className={page === 'upload' ? 'active' : ''} onClick={() => setPage('upload')}><Upload size={18} /><span className="label">Загрузка</span></button>
        </nav>
      </aside>
      <main className="content">
        {page === 'overview' && (
          <>
            <h1 className="page-title">Исполнительская дисциплина</h1>
            <p className="page-sub">Протокольные поручения · контрольная дата {formatDate(ref)}</p>
            {!protocols.length && !appeals.length && !incoming.length ? (
              <div className="empty">Данные не загружены. Загрузите актуальные файлы 1.xlsx, 2.xlsx и 3.xlsx для формирования дашборда.</div>
            ) : (
              <>
                <div className="kpi-row">
                  <div className="kpi green" onClick={() => goKpi('protocols')}><div className="label"><CheckCircle2 size={18} /> ВСЕГО</div><div className="num">{pCounts.all}</div><div className="hint">Подтверждённый результат</div></div>
                  <div className="kpi red selected={false}" onClick={() => goKpi('protocols', 'ПРОСРОЧЕНО')}><div className="label"><AlertCircle size={18} /> ПРОСРОЧЕНО</div><div className="num">{pCounts.overdue}</div><div className="hint">Требует вмешательства</div></div>
                  <div className="kpi amber" onClick={() => goKpi('protocols', 'В РАБОТЕ')}><div className="label"><Clock3 size={18} /> В РАБОТЕ</div><div className="num">{pCounts.work}</div><div className="hint">Предупредить просрочку</div></div>
                </div>
                <div className="kpi-row sec">
                  <div className="kpi amber" onClick={() => goKpi('protocols', 'РАБОЧИЙ КОНТРОЛЬ')}><div className="label">РАБОЧИЙ КОНТРОЛЬ</div><div className="num">{pCounts.ctrl}</div></div>
                  <div className="kpi orange" onClick={() => goKpi('protocols', 'НА СНЯТИИ С КОНТРОЛЯ')}><div className="label">НА СНЯТИИ С КОНТРОЛЯ</div><div className="num">{pCounts.off}</div></div>
                  <div className="kpi mint" onClick={() => goKpi('protocols', 'СНЯТ С КОНТРОЛЯ')}><div className="label"><Lock size={16} /> СНЯТ С КОНТРОЛЯ</div><div className="num">{pCounts.done}</div></div>
                </div>
                <div className="duo">
                  <div className="panel">
                    <h3>e-Өтініш</h3>
                    <div className="panel-kpis">
                      <div className="pk g" onClick={() => goKpi('appeals')}><div className="n">{aAll.length}</div><div className="l">ВСЕГО</div></div>
                      <div className="pk r" onClick={() => goKpi('appeals', 'ПРОСРОЧЕНО')}><div className="n">{aOver}</div><div className="l">ПРОСРОЧЕНО</div></div>
                      <div className="pk a" onClick={() => goKpi('appeals', 'СРОК ДО 7 ДНЕЙ')}><div className="n">{aDue}</div><div className="l">В РАБОТЕ / 7 ДН.</div></div>
                    </div>
                  </div>
                  <div className="panel">
                    <h3>Входящие по сроку</h3>
                    <div className="panel-kpis">
                      <div className="pk g" onClick={() => goKpi('incoming')}><div className="n">{iAll.length}</div><div className="l">ВСЕГО</div></div>
                      <div className="pk r" onClick={() => goKpi('incoming', 'ПРОСРОЧЕНО')}><div className="n">{iOver}</div><div className="l">ПРОСРОЧЕНО</div></div>
                      <div className="pk a" onClick={() => goKpi('incoming', 'СРОК ДО 7 ДНЕЙ')}><div className="n">{iDue}</div><div className="l">В РАБОТЕ / 7 ДН.</div></div>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <h2 style={{ marginTop: 0, color: 'var(--navy)' }}>Что требует внимания</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>№ Протокола</th><th>Дата</th><th>№ поручения</th><th>Содержание поручений</th>
                          <th>Ответственный исполнитель</th><th>Срок исполнения</th>
                          <th>Информация о ходе исполнения</th><th>Статус исполнения</th><th>Следующее действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attentionSort(pAll.filter((r) => !['Снят с контроля'].includes(r.executionStatusNormalized))).slice(0, 25).map((r) => (
                          <tr key={r.id} onClick={() => setDrawer(r)}>
                            <td>{r.protocolNumberRaw}</td>
                            <td>{formatDate(r.protocolDate)}</td>
                            <td>{r.assignmentNumberRaw}</td>
                            <td>{r.assignmentText?.slice(0, 140)}</td>
                            <td>{r.responsibleRaw}</td>
                            <td>{r.deadlineDisplay}</td>
                            <td title={r.progressInfo || ''}>{r.progressPreview}</td>
                            <td>{statusBadge(r.executionStatusNormalized)}</td>
                            <td>{r.nextAction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {page === 'protocols' && (
          <>
            <h1 className="page-title">Контроль протокольных поручений</h1>
            <div className="filters">
              <select value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value, dateFrom: '', dateTo: '' })}>
                {['Все', 'Сегодня', 'Текущая неделя', 'Текущий месяц', 'Текущий квартал', 'Текущий год', 'Произвольный период'].map((p) => <option key={p}>{p}</option>)}
              </select>
              {filters.period === 'Произвольный период' && dateRow}
              <MultiSelect label="Статус исполнения" options={statusesP} value={filters.statuses} onChange={(v) => setFilters({ ...filters, statuses: v })} />
              <MultiSelect label="Сроки исполнения" options={deadlineOpts} value={filters.deadlineBuckets} onChange={(v) => setFilters({ ...filters, deadlineBuckets: v })} />
              <MultiSelect label="Ф.И.О." options={orgOpts.names} value={filters.names} onChange={(v) => setFilters({ ...filters, names: v })} />
              <button className="chip-btn" type="button" onClick={() => setAdvanced((v) => !v)}>Все фильтры ⚙</button>
              <input className="search" placeholder="Поиск" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              <button className="chip-btn" onClick={() => { setFilters(emptyFilters()); setKpi(undefined); }}>Сбросить все</button>
              <button className="chip-btn" onClick={() => exportXlsx(fP.map((r) => ({
                '№ Протокола': r.protocolNumberRaw, Дата: formatDate(r.protocolDate), '№ поручения': r.assignmentNumberRaw,
                Содержание: r.assignmentText, Исполнитель: r.responsibleRaw, Срок: r.deadlineDisplay, Статус: r.executionStatusNormalized, 'Следующее действие': r.nextAction,
              })), 'protocols.xlsx')}>Экспорт</button>
            </div>
            <div className="chips">{chips.map((c) => <span className="chip" key={c.k + c.v}>{c.v} <button onClick={() => setFilters({ ...filters, [c.k]: (filters as any)[c.k].filter((x: string) => x !== c.v) })}>×</button></span>)}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>Найдено: {fP.length}</span>
            </div>
            {advanced && (
              <div className="card" style={{ marginBottom: 14 }}>
                <b>Документ</b>
                <div className="filters">
                  <MultiSelect label="№ Протокола" options={uniqueSorted(protocols.map((r) => r.protocolNumberRaw))} value={filters.protocolNumbers} onChange={(v) => setFilters({ ...filters, protocolNumbers: v })} />
                  <MultiSelect label="№ поручения" options={uniqueSorted(protocols.map((r) => r.assignmentNumberRaw))} value={filters.assignmentNumbers} onChange={(v) => setFilters({ ...filters, assignmentNumbers: v })} />
                  {dateRow}
                  <label className="chip-btn">срок с <input type="date" value={filters.deadlineFrom} onChange={(e) => setFilters({ ...filters, deadlineFrom: e.target.value })} /></label>
                  <label className="chip-btn">срок по <input type="date" value={filters.deadlineTo} onChange={(e) => setFilters({ ...filters, deadlineTo: e.target.value })} /></label>
                </div>
                <b>Организационная структура</b>
                <div className="filters">{orgFilters}</div>
              </div>
            )}
            <div className="kpi-row">
              <div className={`kpi green ${!kpi ? 'selected' : ''}`} onClick={() => setKpi(undefined)}><div className="label">ВСЕГО</div><div className="num">{pCounts.all}</div></div>
              <div className={`kpi red ${kpi === 'ПРОСРОЧЕНО' ? 'selected' : ''}`} onClick={() => setKpi('ПРОСРОЧЕНО')}><div className="label">ПРОСРОЧЕНО</div><div className="num">{pCounts.overdue}</div></div>
              <div className={`kpi amber ${kpi === 'В РАБОТЕ' ? 'selected' : ''}`} onClick={() => setKpi('В РАБОТЕ')}><div className="label">В РАБОТЕ</div><div className="num">{pCounts.work}</div></div>
            </div>
            <div className="kpi-row sec">
              <div className={`kpi amber ${kpi === 'РАБОЧИЙ КОНТРОЛЬ' ? 'selected' : ''}`} onClick={() => setKpi('РАБОЧИЙ КОНТРОЛЬ')}><div className="label">РАБОЧИЙ КОНТРОЛЬ</div><div className="num">{pCounts.ctrl}</div></div>
              <div className={`kpi orange ${kpi === 'НА СНЯТИИ С КОНТРОЛЯ' ? 'selected' : ''}`} onClick={() => setKpi('НА СНЯТИИ С КОНТРОЛЯ')}><div className="label">НА СНЯТИИ С КОНТРОЛЯ</div><div className="num">{pCounts.off}</div></div>
              <div className={`kpi mint ${kpi === 'СНЯТ С КОНТРОЛЯ' ? 'selected' : ''}`} onClick={() => setKpi('СНЯТ С КОНТРОЛЯ')}><div className="label">СНЯТ С КОНТРОЛЯ</div><div className="num">{pCounts.done}</div></div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{kpi || 'Все поручения'} — {fP.length}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>№ Протокола</th><th>Дата</th><th>№ поручения</th><th>Содержание поручений</th>
                      <th>Ответственный исполнитель</th><th>Подразделение</th><th>Срок исполнения</th>
                      <th>Отклонение / осталось</th><th>Статус исполнения</th><th>Следующее действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fP.map((r) => (
                      <tr key={r.id} onClick={() => setDrawer(r)}>
                        <td>{r.protocolNumberRaw}</td>
                        <td>{formatDate(r.protocolDate)}</td>
                        <td>{r.assignmentNumberRaw}</td>
                        <td>{r.assignmentText?.slice(0, 160)}</td>
                        <td>{r.responsibleRaw}</td>
                        <td>{r.organization.units[0] || 'Не определено'}</td>
                        <td>{formatDate(r.deadlineDate) !== '—' ? formatDate(r.deadlineDate) : r.deadlineTextNormalized || '—'}</td>
                        <td>{r.deadlineDisplay}</td>
                        <td>{statusBadge(r.executionStatusNormalized)}{r.qualityWarnings.length ? <div className="warn">⚠</div> : null}</td>
                        <td>{r.nextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {page === 'appeals' && (
          <>
            <h1 className="page-title">Контроль обращений e-Өтініш</h1>
            <div className="filters">
              <MultiSelect label="Номер обращения" options={uniqueSorted(appeals.map((r) => r.appealNumber))} value={filters.appealNumbers} onChange={(v) => setFilters({ ...filters, appealNumbers: v })} />
              <MultiSelect label="Вид обращения" options={typesA} value={filters.appealTypes} onChange={(v) => setFilters({ ...filters, appealTypes: v })} />
              <MultiSelect label="Автор обращения" options={appsA} value={filters.applicants} onChange={(v) => setFilters({ ...filters, applicants: v })} />
              <MultiSelect label="Статус исполнения" options={statusesA} value={filters.statuses} onChange={(v) => setFilters({ ...filters, statuses: v })} />
              <MultiSelect label="Ответственный" options={orgOpts.names} value={filters.names} onChange={(v) => setFilters({ ...filters, names: v })} />
              <button className="chip-btn" type="button" onClick={() => setAdvanced((v) => !v)}>Все фильтры ⚙</button>
              <input className="search" placeholder="Поиск" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              <button className="chip-btn" onClick={() => { setFilters(emptyFilters()); setKpi(undefined); setTab('Все'); }}>Сбросить все</button>
              <button className="chip-btn" onClick={() => exportXlsx(fA as object[], 'appeals.xlsx')}>Экспорт</button>
            </div>
            <div className="chips">{chips.map((c) => <span className="chip" key={'a' + c.k + c.v}>{c.v} <button onClick={() => setFilters({ ...filters, [c.k]: (filters as any)[c.k].filter((x: string) => x !== c.v) })}>×</button></span>)}</div>
            {advanced && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="filters">
                  <MultiSelect label="Краткое содержание" options={uniqueSorted(appeals.map((r) => r.summary))} value={filters.summaries} onChange={(v) => setFilters({ ...filters, summaries: v })} />
                  <label className="chip-btn">рег. с <input type="date" value={filters.regFrom} onChange={(e) => setFilters({ ...filters, regFrom: e.target.value })} /></label>
                  <label className="chip-btn">рег. по <input type="date" value={filters.regTo} onChange={(e) => setFilters({ ...filters, regTo: e.target.value })} /></label>
                  <label className="chip-btn">срок с <input type="date" value={filters.deadlineFrom} onChange={(e) => setFilters({ ...filters, deadlineFrom: e.target.value })} /></label>
                  <label className="chip-btn">срок по <input type="date" value={filters.deadlineTo} onChange={(e) => setFilters({ ...filters, deadlineTo: e.target.value })} /></label>
                  <label className="chip-btn">ответ с <input type="date" value={filters.responseFrom} onChange={(e) => setFilters({ ...filters, responseFrom: e.target.value })} /></label>
                  <label className="chip-btn">ответ по <input type="date" value={filters.responseTo} onChange={(e) => setFilters({ ...filters, responseTo: e.target.value })} /></label>
                  <MultiSelect label="Сроки исполнения" options={deadlineOpts} value={filters.deadlineBuckets} onChange={(v) => setFilters({ ...filters, deadlineBuckets: v })} />
                </div>
                <div className="filters">{orgFilters}</div>
              </div>
            )}
            <div className="kpi-row">
              <div className={`kpi red ${kpi === 'ПРОСРОЧЕНО' ? 'selected' : ''}`} onClick={() => { setKpi('ПРОСРОЧЕНО'); setTab('Все'); }}><div className="label">ПРОСРОЧЕНО</div><div className="num">{aOver}</div></div>
              <div className={`kpi amber ${kpi === 'СРОК ДО 7 ДНЕЙ' ? 'selected' : ''}`} onClick={() => { setKpi('СРОК ДО 7 ДНЕЙ'); setTab('Все'); }}><div className="label">СРОК ДО 7 ДНЕЙ</div><div className="num">{aDue}</div></div>
              <div className={`kpi blue ${kpi === 'ЗАВЕРШЕНО' ? 'selected' : ''}`} onClick={() => { setKpi('ЗАВЕРШЕНО'); setTab('Все'); }}><div className="label">ЗАВЕРШЕНО</div><div className="num">{aDone}</div></div>
            </div>
            <div className="tabs">
              {['Все', 'На исполнении', 'Просроченные', 'Завершённые'].map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setKpi(undefined); }}>{t}</button>
              ))}
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Номер обращения</th><th>Дата регистрации</th><th>Автор обращения</th><th>Вид обращения</th>
                      <th>Краткое содержание</th><th>Ответственный исполнитель</th><th>Подразделение</th>
                      <th>Срок исполнения</th><th>Отклонение / осталось</th><th>Статус исполнения</th><th>Следующее действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fA.map((r) => (
                      <tr key={r.id} onClick={() => setDrawer(r)}>
                        <td>{r.appealNumber}</td>
                        <td>{formatDate(r.registrationDate)}</td>
                        <td>{r.applicant}</td>
                        <td>{r.appealType}</td>
                        <td>{r.summary?.slice(0, 140)}</td>
                        <td>{r.responsibleRaw}</td>
                        <td>{r.organization.units[0] || r.organization.departments[0] || 'Не определено'}</td>
                        <td>{formatDate(r.deadlineDate)}</td>
                        <td>{r.deadlineDisplay}</td>
                        <td>{statusBadge(r.executionStatusNormalized)}</td>
                        <td>{r.nextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {page === 'incoming' && (
          <>
            <h1 className="page-title">Контроль входящих документов</h1>
            <div className="filters">
              <MultiSelect label="Рег. номер и дата" options={uniqueSorted(incoming.map((r) => r.registrationNumberAndDate))} value={filters.incomingRegs} onChange={(v) => setFilters({ ...filters, incomingRegs: v })} />
              <MultiSelect label="Краткое содержание" options={uniqueSorted(incoming.map((r) => r.summary))} value={filters.summaries} onChange={(v) => setFilters({ ...filters, summaries: v })} />
              <MultiSelect label="Ответственный исполнитель" options={orgOpts.names} value={filters.names} onChange={(v) => setFilters({ ...filters, names: v })} />
              <MultiSelect label="Подразделение" options={uniqueSorted(incoming.map((r) => r.sourceDepartmentRaw))} value={filters.sourceDepartments} onChange={(v) => setFilters({ ...filters, sourceDepartments: v })} />
              <MultiSelect label="Статус исполнения" options={statusesI} value={filters.statuses} onChange={(v) => setFilters({ ...filters, statuses: v })} />
              <button className="chip-btn" type="button" onClick={() => setAdvanced((v) => !v)}>Все фильтры ⚙</button>
              <input className="search" placeholder="Поиск" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              <button className="chip-btn" onClick={() => { setFilters(emptyFilters()); setKpi(undefined); setTab('Все'); }}>Сбросить все</button>
              <button className="chip-btn" onClick={() => exportXlsx(fI as object[], 'incoming.xlsx')}>Экспорт</button>
            </div>
            <div className="chips">{chips.map((c) => <span className="chip" key={'i' + c.k + c.v}>{c.v} <button onClick={() => setFilters({ ...filters, [c.k]: (filters as any)[c.k].filter((x: string) => x !== c.v) })}>×</button></span>)}</div>
            {advanced && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="filters">
                  <MultiSelect label="Сроки исполнения" options={deadlineOpts} value={filters.deadlineBuckets} onChange={(v) => setFilters({ ...filters, deadlineBuckets: v })} />
                  <label className="chip-btn">срок с <input type="date" value={filters.deadlineFrom} onChange={(e) => setFilters({ ...filters, deadlineFrom: e.target.value })} /></label>
                  <label className="chip-btn">срок по <input type="date" value={filters.deadlineTo} onChange={(e) => setFilters({ ...filters, deadlineTo: e.target.value })} /></label>
                </div>
                <div className="filters">{orgFilters}</div>
              </div>
            )}
            <div className="kpi-row">
              <div className={`kpi red ${kpi === 'ПРОСРОЧЕНО' ? 'selected' : ''}`} onClick={() => { setKpi('ПРОСРОЧЕНО'); setTab('Все'); }}><div className="label">ПРОСРОЧЕНО</div><div className="num">{iOver}</div></div>
              <div className={`kpi amber ${kpi === 'СРОК ДО 7 ДНЕЙ' ? 'selected' : ''}`} onClick={() => { setKpi('СРОК ДО 7 ДНЕЙ'); setTab('Все'); }}><div className="label">СРОК ДО 7 ДНЕЙ</div><div className="num">{iDue}</div></div>
              <div className={`kpi blue ${kpi === 'ВЫПОЛНЕНО' ? 'selected' : ''}`} onClick={() => { setKpi('ВЫПОЛНЕНО'); setTab('Все'); }}><div className="label">ВЫПОЛНЕНО</div><div className="num">{iDone}</div></div>
            </div>
            <div className="tabs">
              {['Все', 'На исполнении', 'Просроченные', 'Выполненные'].map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setKpi(undefined); }}>{t}</button>
              ))}
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Рег. номер и дата входящего документа</th><th>Краткое содержание</th>
                      <th>Ответственный исполнитель</th><th>Подразделение</th><th>Срок исполнения</th>
                      <th>Отклонение / осталось</th><th>Статус исполнения</th><th>Следующее действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fI.map((r) => (
                      <tr key={r.id} onClick={() => setDrawer(r)}>
                        <td>{r.registrationNumberAndDate}</td>
                        <td>{r.summary}</td>
                        <td>{r.responsibleRaw}</td>
                        <td>{r.sourceDepartmentRaw}</td>
                        <td>{formatDate(r.deadlineDate)}</td>
                        <td>{r.deadlineDisplay}</td>
                        <td>{statusBadge(r.executionStatusNormalized)}</td>
                        <td>{r.nextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {page === 'upload' && (
          <>
            <h1 className="page-title">Загрузка данных</h1>
            <p className="page-sub">Загружаются только три операционных файла. Структура подгружается автоматически.</p>
            <div className="upload-grid">
              {[
                { k: 'p' as const, title: '1.xlsx — Протокольные поручения' },
                { k: 'a' as const, title: '2.xlsx — e-Өтініш' },
                { k: 'i' as const, title: '3.xlsx — Входящие документы' },
              ].map((slot) => {
                const m = meta[slot.k];
                return (
                  <div className="upcard" key={slot.k}>
                    <b>{slot.title}</b>
                    <div>{m?.fileName || 'файл не выбран'}</div>
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(slot.k, e.target.files[0])} />
                    {m && (
                      <div style={{ fontSize: 13, marginTop: 8 }}>
                        Лист: {m.sheet}<br />
                        Строка заголовка: {m.headerRow}<br />
                        Валидных строк: {m.validRows} · игнор: {m.ignoredRows}<br />
                        {m.errors.map((e) => <div key={e} style={{ color: 'var(--red)' }}>{e}</div>)}
                        {m.warnings.map((e) => <div key={e} className="warn">{e}</div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="sysbox">
              <b>Организационная структура</b>
              <div>structure.xlsx · Статус: {structStatus}</div>
              <div>Логотип: {logoOk ? 'загружен' : 'ошибка'}</div>
            </div>
          </>
        )}
      </main>

      {drawer && (
        <div className="drawer-bg" onClick={() => setDrawer(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <h2>Карточка записи</h2>
            {'assignmentText' in drawer && (
              <>
                <div className="kv"><b>№ Протокола</b>{drawer.protocolNumberRaw}</div>
                <div className="kv"><b>Дата</b>{formatDate(drawer.protocolDate)}</div>
                <div className="kv"><b>№ поручения</b>{drawer.assignmentNumberRaw}</div>
                <div className="kv"><b>Содержание</b>{drawer.assignmentText}</div>
                <div className="kv"><b>Информация о ходе исполнения</b>{drawer.progressInfo || '—'}</div>
              </>
            )}
            {'appealNumber' in drawer && (
              <>
                <div className="kv"><b>Номер обращения</b>{drawer.appealNumber}</div>
                <div className="kv"><b>Автор</b>{drawer.applicant}</div>
                <div className="kv"><b>Содержание</b>{drawer.summary}</div>
              </>
            )}
            {'registrationNumberAndDate' in drawer && (
              <>
                <div className="kv"><b>Рег. номер</b>{drawer.registrationNumberAndDate}</div>
                <div className="kv"><b>Содержание</b>{drawer.summary}</div>
                <div className="kv"><b>Подразделение (источник)</b>{drawer.sourceDepartmentRaw}</div>
              </>
            )}
            <div className="kv"><b>Исполнитель</b>{drawer.responsibleRaw}</div>
            <div className="kv"><b>Срок</b>{drawer.deadlineDisplay}</div>
            <div className="kv"><b>Статус</b>{drawer.executionStatusNormalized}</div>
            <div className="kv"><b>Следующее действие</b>{drawer.nextAction}</div>
            <div className="kv"><b>Ф.И.О.</b>{drawer.organization.employeeNames.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Шифр</b>{drawer.organization.codes.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Должность</b>{drawer.organization.positions.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Департаменты</b>{drawer.organization.departments.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Куратор</b>{drawer.organization.curators.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Руководитель подразделения</b>{drawer.organization.departmentHeads.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Подразделение</b>{drawer.organization.units.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Руководители СП</b>{drawer.organization.spLeaders.join(', ') || 'Не определено'}</div>
            <div className="kv"><b>Источник</b>{drawer.sourceFile} / {drawer.sourceSheet} / строка {drawer.sourceRowNumber}</div>
            {drawer.qualityWarnings.map((w) => <div key={w} className="warn">⚠ {w}</div>)}
            <button className="chip-btn" onClick={() => setDrawer(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
