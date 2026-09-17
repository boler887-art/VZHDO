import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AppealRecord,
  AppState,
  DataWarning,
  IncomingRecord,
  PageId,
  ProtocolRecord,
  StructurePerson,
} from './types';
import { todayStart } from './dates';
import { parseStructure, readWorkbook } from './excel';
import { parseAppeals, parseIncoming, parseProtocols } from './parseOperational';
import { loadOperational, saveOperational } from './db';

interface Store extends AppState {
  page: PageId;
  setPage: (p: PageId) => void;
  loadStructure: () => Promise<void>;
  uploadFile: (kind: 'protocols' | 'appeals' | 'incoming', file: File) => Promise<string | null>;
  restore: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>('overview');
  const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [incoming, setIncoming] = useState<IncomingRecord[]>([]);
  const [structure, setStructure] = useState<StructurePerson[]>([]);
  const [structureLoaded, setStructureLoaded] = useState(false);
  const [warnings, setWarnings] = useState<DataWarning[]>([]);
  const [meta, setMeta] = useState<AppState['meta']>({});
  const referenceDate = todayStart().toISOString();

  const loadStructure = useCallback(async () => {
    const w: DataWarning[] = [];
    try {
      const res = await fetch('/structure.xlsx');
      if (!res.ok) throw new Error('not found');
      const buf = await res.arrayBuffer();
      const wb = readWorkbook(buf);
      const people = parseStructure(wb, w);
      setStructure(people);
      setStructureLoaded(people.length > 0);
      if (!people.length) w.push({ level: 'WARNING', message: 'Организационная структура пуста' });
    } catch {
      setStructureLoaded(false);
      w.push({ level: 'WARNING', message: 'Организационная структура: недоступна' });
    }
    setWarnings((prev) => [...prev.filter((x) => x.sourceFile !== 'structure.xlsx'), ...w]);
  }, []);

  const restore = useCallback(async () => {
    const p = await loadOperational<ProtocolRecord>('protocols');
    const a = await loadOperational<AppealRecord>('appeals');
    const i = await loadOperational<IncomingRecord>('incoming');
    if (p?.records) {
      setProtocols(p.records);
      setMeta((m) => ({ ...m, protocols: p.meta }));
    }
    if (a?.records) {
      setAppeals(a.records);
      setMeta((m) => ({ ...m, appeals: a.meta }));
    }
    if (i?.records) {
      setIncoming(i.records);
      setMeta((m) => ({ ...m, incoming: i.meta }));
    }
  }, []);

  const uploadFile = useCallback(
    async (kind: 'protocols' | 'appeals' | 'incoming', file: File) => {
      const buf = await file.arrayBuffer();
      const ref = todayStart();
      if (kind === 'protocols') {
        const r = parseProtocols(buf, file.name, ref, structure);
        if (r.warnings.some((x) => x.level === 'ERROR')) {
          setWarnings((w) => [...w, ...r.warnings]);
          return r.warnings.find((x) => x.level === 'ERROR')!.message;
        }
        setProtocols(r.records);
        setMeta((m) => ({ ...m, protocols: r.meta }));
        setWarnings((w) => [...w.filter((x) => x.sourceFile !== file.name), ...r.warnings]);
        await saveOperational('protocols', r.records, r.meta);
      } else if (kind === 'appeals') {
        const r = parseAppeals(buf, file.name, ref, structure);
        if (r.warnings.some((x) => x.level === 'ERROR')) {
          setWarnings((w) => [...w, ...r.warnings]);
          return r.warnings.find((x) => x.level === 'ERROR')!.message;
        }
        setAppeals(r.records);
        setMeta((m) => ({ ...m, appeals: r.meta }));
        setWarnings((w) => [...w.filter((x) => x.sourceFile !== file.name), ...r.warnings]);
        await saveOperational('appeals', r.records, r.meta);
      } else {
        const r = parseIncoming(buf, file.name, ref, structure);
        if (r.warnings.some((x) => x.level === 'ERROR')) {
          setWarnings((w) => [...w, ...r.warnings]);
          return r.warnings.find((x) => x.level === 'ERROR')!.message;
        }
        setIncoming(r.records);
        setMeta((m) => ({ ...m, incoming: r.meta }));
        setWarnings((w) => [...w.filter((x) => x.sourceFile !== file.name), ...r.warnings]);
        await saveOperational('incoming', r.records, r.meta);
      }
      return null;
    },
    [structure],
  );

  useEffect(() => {
    loadStructure().then(restore);
  }, [loadStructure, restore]);

  const value = useMemo<Store>(
    () => ({
      page,
      setPage,
      protocols,
      appeals,
      incoming,
      structure,
      structureLoaded,
      warnings,
      meta,
      referenceDate,
      loadStructure,
      uploadFile,
      restore,
    }),
    [page, protocols, appeals, incoming, structure, structureLoaded, warnings, meta, referenceDate, loadStructure, uploadFile, restore],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('store');
  return v;
}
