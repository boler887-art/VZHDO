import type { DeadlineBucket, DeadlineType } from './types';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function todayStart(): Date {
  return startOfDay(new Date());
}

export function differenceInCalendarDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

export function formatDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return startOfDay(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + value * 86400000);
      return startOfDay(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  return null;
}

export function classifyDeadline(raw: unknown): { type: DeadlineType; date: Date | null; rawText: string } {
  if (raw == null || String(raw).trim() === '') {
    return { type: 'MISSING', date: null, rawText: '' };
  }
  const text = String(raw).trim();
  const lower = text.toLowerCase();
  const textual = ['постоянно', 'еженедельно', 'ежедневно', 'ежемесячно', 'на постоянной основе', 'по результатам'];
  if (textual.some((t) => lower.includes(t)) && !parseDate(raw)) {
    return { type: 'TEXT', date: null, rawText: text };
  }
  const date = parseDate(raw);
  if (date) return { type: 'DATE', date, rawText: text };
  if (/[а-яёәғқңөұүі]/i.test(text) || /[a-z]/i.test(text)) {
    return { type: 'TEXT', date: null, rawText: text };
  }
  return { type: 'MISSING', date: null, rawText: text };
}

export function deadlineBucket(daysDelta: number | null, type: DeadlineType): DeadlineBucket {
  if (type === 'TEXT') return 'TEXT_DEADLINE';
  if (type !== 'DATE' || daysDelta == null) return 'UNKNOWN_DEADLINE';
  if (daysDelta < 0) return 'OVERDUE';
  if (daysDelta === 0) return 'TODAY';
  if (daysDelta <= 3) return 'DUE_1_3';
  if (daysDelta <= 7) return 'DUE_4_7';
  if (daysDelta <= 30) return 'DUE_8_30';
  return 'DUE_31_PLUS';
}

export function formatDeviation(daysDelta: number | null, type: DeadlineType, raw: unknown): string {
  if (type === 'TEXT') return String(raw ?? '—');
  if (daysDelta == null) return '—';
  if (daysDelta < 0) return `Просрочено ${Math.abs(daysDelta)} дн.`;
  if (daysDelta === 0) return 'Сегодня';
  if (daysDelta <= 3) return `Осталось ${daysDelta} дн.`;
  return `Осталось ${daysDelta} дн.`;
}

export function nextAction(opts: {
  isFinal: boolean;
  isOverdue: boolean;
  daysDelta: number | null;
  status?: string;
}): string {
  if (opts.status === 'На снятии с контроля') return 'Утвердить снятие';
  if (opts.isFinal) return 'Результат подтверждён';
  if (opts.isOverdue) return 'Представить результат';
  if (opts.daysDelta === 0) return 'Проверить исполнение сегодня';
  if (opts.daysDelta != null && opts.daysDelta <= 3) return 'Проверить готовность';
  if (opts.daysDelta != null && opts.daysDelta <= 7) return 'Контроль срока';
  return 'Контроль исполнения';
}
