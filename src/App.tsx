import { useMemo, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import type { AppealRecord, IncomingRecord, PageId, ProtocolRecord } from './lib/types';
import { formatDate, formatDeviation, nextAction } from './lib/dates';

function Icon({ t }: { t: 'g' | 'r' | 'a' | 'b' | 'o' }) {
  const map = { g: '✓', r: '!', a: '⏱', b: '▢', o: '◎' };
  return <span className={`icon ${t}`}>{map[t]}</span>;
}

function statusClass(s: string, overdue?: boolean) {
  if (overdue) return 'badge overdue';
  if (s.includes('Снят') || s.includes('Заверш') || s.includes('Выполн')) return 'badge ok';
  if (s.includes('снятии')) return 'badge remove';
  if (s.includes('Рабочий')) return 'badge ctrl';
  if (s.includes('Не исполн')) return 'badge overdue';
  return 'badge work';
}

function searchHit(q: string, parts: (string | null | undefined)[]) {
  if (!q.trim()) return true;
  const n = q.toLowerCase().replace(/\s+/g, ' ');
  return parts.some((p) => (p || '').toLowerCase().includes(n));
}

function sortActive<T extends { isOverdue: boolean; daysDelta: number | null; deadlineType: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const rank = (r: T) => {
      if (r.isOverdue) return r.daysDelta ?? -9999;
      if (r.deadlineType !== 'DATE') return 9998;
      return 1000 + (r.daysDelta ?? 999);
    };
    return rank(a) - rank(b);
  });
}

function AppShell() {
  const s = useStore();
  const items: { id: PageId; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'protocols', label: 'Протоколы' },
    { id: 'appeals', label: 'e-Өтініш' },
    { id: 'incoming', label: 'Входящие' },
    { id: 'upload', label: 'Загрузка' },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">ТОО «ВЖДО»</div>
        {items.slice(0,4).map((it) => (
          <button key={it.id} className={`nav-btn ${s.page === it.id ? 'active' : ''}`} onClick={() => s.setPage(it.id)}>
            <span className="label">{it.label}</span>
          </button>
        ))}
        <div className="spacer" />
        <button className={`nav-btn ${s.page === 'upload' ? 'active' : ''}`} onClick={() => s.setPage('upload')}>
          <span className="label">Загрузка</span>
        </button>
      </aside>
      <main className="main">
        {s.page === 'overview' && <Overview />}
        {s.page === 'protocols' && <ProtocolsPage />}
        {s.page === 'appeals' && <AppealsPage />}
        {s.page === 'incoming' && <IncomingPage />}
        {s.page === 'upload' && <UploadPage />}
      </main>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      Данные не загружены
      <div className="muted">Загрузите актуальные файлы 1.xlsx, 2.xlsx и 3.xlsx для формирования дашборда.</div>
    </div>
  );
}

function Overview() {
  const s = useStore();
  const p = s.protocols;
  const a = s.appeals;
  const i = s.incoming;
  if (!p.length && !a.length && !i.length) {
    return (<><h1>Исполнительская дисциплина</h1><Empty /></>);
  }
  const attn = sortActive([
    ...p.filter((r) => r.isActive).map((r) => ({ kind: 'Протокол', title: r.assignmentText || r.assignmentNumberRaw || '', who: r.responsibleRaw || '', rec: r })),
    ...a.filter((r) => r.isActive).map((r) => ({ kind: 'e-Өтініш', title: r.summary || r.appealNumber || '', who: r.responsibleEmployee || '', rec: r })),
    ...i.filter((r) => r.isActive).map((r) => ({ kind: 'Входящий', title: r.summary || r.registrationNumberAndDate || '', who: r.responsibleEmployee || '', rec: r })),
  ]).slice(0, 20);

  return (
    <>
      <h1>Исполнительская дисциплина</h1>
      <div className="section-title">Протокольные поручения</div>
      <div className="cards">
        <div className="card green" onClick={() => s.setPage('protocols')}>
          <div className="card-title"><Icon t="g" /> ВСЕГО</div>
          <div className="count">{p.length}</div>
          <div className="hint">Подтверждённый результат</div>
          <div className="open">Открыть →</div>
        </div>
        <div className="card red" onClick={() => s.setPage('protocols')}>
          <div className="card-title"><Icon t="r" /> ПРОСРОЧЕНО</div>
          <div className="count">{p.filter((r) => r.isOverdue).length}</div>
          <div className="hint">Требует вмешательства</div>
          <div className="open">Открыть →</div>
        </div>
        <div className="card amber" onClick={() => s.setPage('protocols')}>
          <div className="card-title"><Icon t="a" /> В РАБОТЕ</div>
          <div className="count">{p.filter((r) => r.executionStatusNormalized === 'В работе').length}</div>
          <div className="hint">Предупредить просрочку</div>
          <div className="open">Открыть →</div>
        </div>
      </div>
      <div className="section-title">Другие документы</div>
      <div className="mini-cards">
        <div className="mini" onClick={() => s.setPage('appeals')}>
          <h3>e-Өтініш</h3>
          <div className="pills">
            <span className="pill g">Всего {a.length}</span>
            <span className="pill r">Просрочено {a.filter((x) => x.isOverdue).length}</span>
            <span className="pill a">В работе {a.filter((x) => x.isActive).length}</span>
          </div>
        </div>
        <div className="mini" onClick={() => s.setPage('incoming')}>
          <h3>Входящие по сроку</h3>
          <div className="pills">
            <span className="pill g">Всего {i.length}</span>
            <span className="pill r">Просрочено {i.filter((x) => x.isOverdue).length}</span>
            <span className="pill a">В работе {i.filter((x) => x.isActive).length}</span>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <div className="attn-head" style={{ padding: '14px 16px 0' }}>
          <h3 style={{ margin: 0, color: 'var(--heading)' }}>Что требует внимания</h3>
          <span className="muted">Только активные записи</span>
        </div>
        <table>
          <thead><tr><th>Поручение</th><th>Ответственный</th><th>Срок / отклонение</th><th>Сигнал</th></tr></thead>
          <tbody>
            {attn.map((row, idx) => (
              <tr key={idx}>
                <td><div className="muted">{row.kind}</div>{row.title}</td>
                <td>{row.who || '—'}</td>
                <td>{formatDeviation(row.rec.daysDelta, row.rec.deadlineType, row.rec.deadlineRaw)}</td>
                <td><span className={row.rec.isOverdue ? 'badge overdue' : row.rec.daysDelta != null && row.rec.daysDelta <= 3 ? 'badge due' : 'badge work'}>{row.rec.isOverdue ? 'Просрочено' : row.rec.daysDelta != null && row.rec.daysDelta <= 3 ? 'До 3 дней' : 'В работе'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProtocolsPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [who, setWho] = useState('');
  const [kpi, setKpi] = useState<string | null>(null);
  const [open, setOpen] = useState<ProtocolRecord | null>(null);
  const filtered = useMemo(() => {
    let rows = s.protocols.filter((r) => searchHit(q, [r.protocolNumberRaw, r.assignmentNumberRaw, r.assignmentText, r.responsibleRaw, r.department]));
    if (status) rows = rows.filter((r) => r.executionStatusNormalized === status);
    if (who) rows = rows.filter((r) => (r.responsibleRaw || '').includes(who) || r.responsiblePersons.includes(who));
    if (kpi === 'overdue') rows = rows.filter((r) => r.isOverdue);
    if (kpi === 'work') rows = rows.filter((r) => r.executionStatusNormalized === 'В работе');
    if (kpi === 'ctrl') rows = rows.filter((r) => r.executionStatusNormalized === 'Рабочий контроль');
    if (kpi === 'removing') rows = rows.filter((r) => r.executionStatusNormalized === 'На снятии с контроля');
    if (kpi === 'done') rows = rows.filter((r) => r.executionStatusNormalized === 'Снят с контроля');
    return rows;
  }, [s.protocols, q, status, who, kpi]);
  const names = Array.from(new Set(s.protocols.flatMap((r) => r.responsiblePersons))).sort();
  const baseF = (r: ProtocolRecord) => searchHit(q, [r.protocolNumberRaw, r.assignmentNumberRaw, r.assignmentText, r.responsibleRaw]) && (!status || r.executionStatusNormalized === status) && (!who || (r.responsibleRaw || '').includes(who));
  return (
    <>
      <h1>Контроль протокольных поручений</h1>
      <div className="filters">
        <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Ответственный</option>{names.map((n) => <option key={n}>{n}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Статус исполнения</option>{['В работе','Рабочий контроль','На снятии с контроля','Снят с контроля','Не исполнен'].map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="cards">
        <div className={`card green ${kpi === 'all' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'all' ? null : 'all')}><div className="card-title"><Icon t="g" /> ВСЕГО</div><div className="count">{s.protocols.filter(baseF).length}</div><div className="hint">Подтверждённый результат</div><div className="open">Открыть →</div></div>
        <div className={`card red ${kpi === 'overdue' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'overdue' ? null : 'overdue')}><div className="card-title"><Icon t="r" /> ПРОСРОЧЕНО</div><div className="count">{s.protocols.filter((r) => r.isOverdue && baseF(r)).length}</div><div className="hint">Требует вмешательства</div><div className="open">Открыть →</div></div>
        <div className={`card amber ${kpi === 'work' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'work' ? null : 'work')}><div className="card-title"><Icon t="a" /> В РАБОТЕ</div><div className="count">{s.protocols.filter((r) => r.executionStatusNormalized === 'В работе' && baseF(r)).length}</div><div className="hint">Предупредить просрочку</div><div className="open">Открыть →</div></div>
      </div>
      <div className="cards">
        <div className={`card amber ${kpi === 'ctrl' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'ctrl' ? null : 'ctrl')}><div className="card-title"><Icon t="a" /> РАБОЧИЙ КОНТРОЛЬ</div><div className="count">{s.protocols.filter((r) => r.executionStatusNormalized === 'Рабочий контроль').length}</div><div className="hint">Контроль исполнения</div></div>
        <div className={`card orange ${kpi === 'removing' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'removing' ? null : 'removing')}><div className="card-title"><Icon t="o" /> НА СНЯТИЕ С КОНТРОЛЯ</div><div className="count">{s.protocols.filter((r) => r.executionStatusNormalized === 'На снятии с контроля').length}</div><div className="hint">Ожидает подтверждения</div></div>
        <div className={`card green ${kpi === 'done' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'done' ? null : 'done')}><div className="card-title"><Icon t="g" /> СНЯТ С КОНТРОЛЯ</div><div className="count">{s.protocols.filter((r) => r.executionStatusNormalized === 'Снят с контроля').length}</div><div className="hint">Исполнение подтверждено</div></div>
      </div>
      <h3>Что требует внимания — {filtered.length}</h3>
      {!s.protocols.length ? <Empty /> : (
        <div className="table-wrap"><table><thead><tr><th>№ протокола и дата</th><th>Содержание поручения</th><th>Ответственный</th><th>Срок</th><th>Состояние контроля</th><th>Что требуется</th></tr></thead>
          <tbody>{filtered.map((r) => (
            <tr key={r.id} onClick={() => setOpen(r)}>
              <td>{r.protocolNumberRaw || '—'}<div className="muted">{formatDate(r.protocolDate)}</div></td>
              <td>{r.assignmentText}</td>
              <td>{r.responsibleRaw}</td>
              <td>{r.deadlineType === 'DATE' ? formatDate(r.deadlineDate) : String(r.deadlineRaw || '—')}<div className="muted">{formatDeviation(r.daysDelta, r.deadlineType, r.deadlineRaw)}</div></td>
              <td><span className={statusClass(r.executionStatusNormalized, r.isOverdue)}>{r.isOverdue ? 'Просрочено' : r.executionStatusNormalized}</span></td>
              <td className="link">{nextAction({ isFinal: r.isFinal, isOverdue: r.isOverdue, daysDelta: r.daysDelta, status: r.executionStatusNormalized })} →</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {open && (<div className="drawer-bg" onClick={() => setOpen(null)}><div className="drawer" onClick={(e) => e.stopPropagation()}><h3>Поручение</h3>
        <div className="kv">
          <b>Протокол</b><span>{open.protocolNumberRaw}</span>
          <b>Дата</b><span>{formatDate(open.protocolDate)}</span>
          <b>№ поручения</b><span>{open.assignmentNumberRaw}</span>
          <b>Содержание</b><span>{open.assignmentText}</span>
          <b>Ответственный</b><span>{open.responsibleRaw}</span>
          <b>Подразделение</b><span>{open.department}</span>
          <b>Срок</b><span>{open.deadlineType === 'DATE' ? formatDate(open.deadlineDate) : String(open.deadlineRaw || '—')}</span>
          <b>Отклонение</b><span>{formatDeviation(open.daysDelta, open.deadlineType, open.deadlineRaw)}</span>
          <b>Ход исполнения</b><span>{open.progressInfo || '—'}</span>
          <b>Статус</b><span>{open.executionStatusNormalized}</span>
          <b>Куратор</b><span>{open.curator}</span>
          <b>Источник</b><span>{open.sourceFile} / {open.sourceSheet} / строка {open.sourceRowNumber}</span>
        </div></div></div>)}
    </>
  );
}

function AppealsPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'active' | 'overdue' | 'done'>('active');
  const [kpi, setKpi] = useState<string | null>(null);
  const [open, setOpen] = useState<AppealRecord | null>(null);
  const base = s.appeals.filter((r) => searchHit(q, [r.appealNumber, r.applicant, r.appealType, r.summary, r.responsibleEmployee, r.department]));
  let rows = base;
  if (kpi === 'overdue') rows = base.filter((r) => r.isOverdue);
  else if (kpi === 'soon') rows = base.filter((r) => r.isActive && r.deadlineType === 'DATE' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7);
  else if (kpi === 'done') rows = base.filter((r) => r.isFinal);
  else if (tab === 'active') rows = base.filter((r) => r.isActive);
  else if (tab === 'overdue') rows = base.filter((r) => r.isOverdue);
  else rows = base.filter((r) => r.isFinal);
  return (
    <>
      <h1>Контроль обращений e-Өтініш</h1>
      <div className="filters"><input placeholder="Номер / текст / заявитель" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="cards">
        <div className={`card red ${kpi === 'overdue' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'overdue' ? null : 'overdue')}><div className="card-title"><Icon t="r" /> ПРОСРОЧЕНО</div><div className="count">{base.filter((r) => r.isOverdue).length}</div><div className="hint">Обращения с истёкшим сроком ответа</div></div>
        <div className={`card amber ${kpi === 'soon' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'soon' ? null : 'soon')}><div className="card-title"><Icon t="a" /> СРОК ДО 7 ДНЕЙ</div><div className="count">{base.filter((r) => r.isActive && r.deadlineType === 'DATE' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7).length}</div><div className="hint">Требуют внимания в ближайшее время</div></div>
        <div className={`card blue ${kpi === 'done' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'done' ? null : 'done')}><div className="card-title"><Icon t="b" /> ЗАВЕРШЕНО</div><div className="count">{base.filter((r) => r.isFinal).length}</div><div className="hint">Ответ или решение по обращению предоставлен</div></div>
      </div>
      <div className="tabs">
        <button className={`tab ${!kpi && tab === 'active' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('active'); }}>На исполнении</button>
        <button className={`tab ${!kpi && tab === 'overdue' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('overdue'); }}>Просроченные</button>
        <button className={`tab ${!kpi && tab === 'done' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('done'); }}>Завершённые</button>
      </div>
      {!s.appeals.length ? <Empty /> : (
        <div className="table-wrap"><table><thead><tr><th>Номер и заявитель</th><th>Вид</th><th>Краткое содержание</th><th>Ответственный</th><th>Срок ответа</th><th>До срока / отклонение</th><th>Статус</th><th>Что требуется дальше</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} onClick={() => setOpen(r)}>
              <td>{r.appealNumber}<div className="muted">{r.applicant}</div></td>
              <td>{r.appealType}</td><td>{r.summary}</td><td>{r.responsibleEmployee}</td>
              <td>{formatDate(r.deadlineDate)}</td>
              <td><span className={r.isOverdue ? 'badge overdue' : r.daysDelta != null && r.daysDelta <= 7 ? 'badge due' : 'badge work'}>{formatDeviation(r.daysDelta, r.deadlineType, r.deadlineRaw)}</span></td>
              <td><span className={statusClass(r.executionStatusNormalized)}>{r.executionStatusNormalized}</span></td>
              <td className="link">{nextAction({ isFinal: r.isFinal, isOverdue: r.isOverdue, daysDelta: r.daysDelta })} →</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {open && (<div className="drawer-bg" onClick={() => setOpen(null)}><div className="drawer" onClick={(e) => e.stopPropagation()}><h3>Обращение</h3>
        <div className="kv">
          <b>Номер</b><span>{open.appealNumber}</span>
          <b>Дата регистрации</b><span>{formatDate(open.registrationDate)}</span>
          <b>Заявитель</b><span>{open.applicant}</span>
          <b>Вид</b><span>{open.appealType}</span>
          <b>Содержание</b><span>{open.summary}</span>
          <b>Срок</b><span>{formatDate(open.deadlineDate)}</span>
          <b>Отклонение</b><span>{formatDeviation(open.daysDelta, open.deadlineType, open.deadlineRaw)}</span>
          <b>Дата ответа</b><span>{formatDate(open.responseDate)}</span>
          <b>Статус</b><span>{open.executionStatusNormalized}</span>
          <b>Ответственный</b><span>{open.responsibleEmployee}</span>
          <b>Подразделение</b><span>{open.department}</span>
          <b>Источник</b><span>{open.sourceFile} / {open.sourceSheet} / строка {open.sourceRowNumber}</span>
        </div></div></div>)}
    </>
  );
}

function IncomingPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'overdue' | 'done'>('overdue');
  const [kpi, setKpi] = useState<string | null>(null);
  const [open, setOpen] = useState<IncomingRecord | null>(null);
  const base = s.incoming.filter((r) => searchHit(q, [r.registrationNumberAndDate, r.summary, r.responsibleEmployee, r.department]));
  let rows = base;
  if (kpi === 'overdue') rows = base.filter((r) => r.isOverdue);
  else if (kpi === 'soon') rows = base.filter((r) => r.isActive && r.deadlineType === 'DATE' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7);
  else if (kpi === 'done') rows = base.filter((r) => r.isFinal);
  else if (tab === 'active') rows = base.filter((r) => r.isActive);
  else if (tab === 'overdue') rows = base.filter((r) => r.isOverdue);
  else if (tab === 'done') rows = base.filter((r) => r.isFinal);
  return (
    <>
      <h1>Контроль входящих документов</h1>
      <div className="filters"><input placeholder="Номер / содержание / исполнитель" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="cards">
        <div className={`card red ${kpi === 'overdue' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'overdue' ? null : 'overdue')}><div className="card-title"><Icon t="r" /> ПРОСРОЧЕНО</div><div className="count">{base.filter((r) => r.isOverdue).length}</div><div className="hint">Неисполненные документы с истёкшим сроком</div></div>
        <div className={`card amber ${kpi === 'soon' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'soon' ? null : 'soon')}><div className="card-title"><Icon t="a" /> СРОК ДО 7 ДНЕЙ</div><div className="count">{base.filter((r) => r.isActive && r.deadlineType === 'DATE' && r.daysDelta != null && r.daysDelta >= 0 && r.daysDelta <= 7).length}</div><div className="hint">Ближайшие сроки исполнения</div></div>
        <div className={`card blue ${kpi === 'done' ? 'selected' : ''}`} onClick={() => setKpi(kpi === 'done' ? null : 'done')}><div className="card-title"><Icon t="b" /> ВЫПОЛНЕНО</div><div className="count">{base.filter((r) => r.isFinal).length}</div><div className="hint">По статусу в выгрузке</div></div>
      </div>
      <div className="tabs">
        <button className={`tab ${!kpi && tab === 'all' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('all'); }}>Все</button>
        <button className={`tab ${!kpi && tab === 'active' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('active'); }}>На исполнении</button>
        <button className={`tab ${!kpi && tab === 'overdue' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('overdue'); }}>Просроченные</button>
        <button className={`tab ${!kpi && tab === 'done' ? 'on' : ''}`} onClick={() => { setKpi(null); setTab('done'); }}>Выполненные</button>
      </div>
      {!s.incoming.length ? <Empty /> : (
        <div className="table-wrap"><table><thead><tr><th>Рег. номер и дата</th><th>Краткое содержание</th><th>Подразделение</th><th>Ответственный</th><th>Срок исполнения</th><th>Отклонение</th><th>Статус</th><th>Следующее действие</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} onClick={() => setOpen(r)}>
              <td>{r.registrationNumberAndDate}</td><td>{r.summary}</td><td>{r.department}</td><td>{r.responsibleEmployee}</td>
              <td>{formatDate(r.deadlineDate)}</td>
              <td><span className={r.isOverdue ? 'badge overdue' : 'badge due'}>{formatDeviation(r.daysDelta, r.deadlineType, r.deadlineRaw)}</span></td>
              <td><span className={statusClass(r.executionStatusNormalized)}>{r.executionStatusNormalized}</span></td>
              <td className="link">{nextAction({ isFinal: r.isFinal, isOverdue: r.isOverdue, daysDelta: r.daysDelta })} →</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {open && (<div className="drawer-bg" onClick={() => setOpen(null)}><div className="drawer" onClick={(e) => e.stopPropagation()}><h3>Входящий документ</h3>
        <div className="kv">
          <b>Рег. номер</b><span>{open.registrationNumberAndDate}</span>
          <b>Содержание</b><span>{open.summary}</span>
          <b>Ответственный</b><span>{open.responsibleEmployee}</span>
          <b>Подразделение</b><span>{open.department}</span>
          <b>Срок</b><span>{formatDate(open.deadlineDate)}</span>
          <b>Отклонение</b><span>{formatDeviation(open.daysDelta, open.deadlineType, open.deadlineRaw)}</span>
          <b>Статус</b><span>{open.executionStatusNormalized}</span>
          <b>Куратор</b><span>{open.curator}</span>
          <b>Источник</b><span>{open.sourceFile} / {open.sourceSheet} / строка {open.sourceRowNumber}</span>
        </div></div></div>)}
    </>
  );
}

function UploadPage() {
  const s = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  async function onFile(kind: 'protocols' | 'appeals' | 'incoming', f?: File) {
    if (!f) return;
    const err = await s.uploadFile(kind, f);
    setMsg(err || 'Файл принят');
  }
  const card = (title: string, kind: 'protocols' | 'appeals' | 'incoming', metaKey: 'protocols' | 'appeals' | 'incoming') => {
    const m = s.meta[metaKey];
    return (
      <div className="upload-card">
        <h3>{title}</h3>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => onFile(kind, e.target.files?.[0])} />
        {m ? <div className="meta">Файл: {m.fileName}<br/>Лист: {m.sheet}<br/>Шапка: строка {m.headerRow}<br/>Записей: {m.validCount}, пропущено: {m.ignoredCount}<br/>Предупреждения: {m.warningCount}, ошибки: {m.errorCount}<br/>Загружено: {m.loadedAt}</div> : <div className="meta">Файл ещё не загружен</div>}
      </div>
    );
  };
  return (
    <>
      <h1>Загрузка данных</h1>
      <div className="meta">Организационная структура: {s.structureLoaded ? 'загружена из проекта' : 'недоступна'}</div>
      {msg && <div className="warn">{msg}</div>}
      <div className="upload-grid" style={{ marginTop: 16 }}>
        {card('1.xlsx — Протокольные поручения', 'protocols', 'protocols')}
        {card('2.xlsx — e-Өтініш', 'appeals', 'appeals')}
        {card('3.xlsx — Входящие документы', 'incoming', 'incoming')}
      </div>
      {s.warnings.length > 0 && <div className="warn" style={{ marginTop: 16 }}>{s.warnings.slice(-12).map((w, i) => <div key={i}>[{w.level}] {w.message}</div>)}</div>}
    </>
  );
}

export default function App() {
  return <StoreProvider><AppShell /></StoreProvider>;
}
