export function reviveDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return startOfDay(value);
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? parseDate(value) : startOfDay(d);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return startOfDay(value);
  if (typeof value === 'number' && isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(value * 86400000);
    const d = new Date(excelEpoch.getTime() + ms);
    if (!isNaN(d.getTime()) && value > 20000 && value < 80000) {
      return startOfDay(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  const s = String(value).trim();
  const m1 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m1) {
    const d = new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) {
    const d = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }
  return null;
}

export function formatDate(d: Date | null): string {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function differenceInCalendarDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

export function classifyDeadlineText(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/постоянн/.test(s)) return 'постоянно';
  if (/еженедельн/.test(s)) return 'еженедельно';
  if (/ежемесячн/.test(s)) return 'ежемесячно';
  if (/ежедневн/.test(s)) return 'ежедневно';
  if (/до завершения/.test(s)) return 'до завершения работ';
  return null;
}

export function deadlineBucket(daysDelta: number | null, type: string): string {
  if (type === 'TEXT') return classifyDeadlineText('') || 'текстовый срок';
  if (type === 'MISSING' || daysDelta == null) return 'Не указан';
  if (daysDelta < 0) return 'Просроченный срок';
  if (daysDelta === 0) return 'Сегодня';
  if (daysDelta <= 3) return '1–3 дня';
  if (daysDelta <= 7) return '4–7 дней';
  if (daysDelta <= 30) return '8–30 дней';
  return 'Более 30 дней';
}

export function formatDaysDelta(daysDelta: number | null, type: string, text: string | null): string {
  if (type === 'TEXT') return text || 'текстовый срок';
  if (daysDelta == null) return 'Срок не указан';
  if (daysDelta < 0) return `Срок истёк ${Math.abs(daysDelta)} дн. назад`;
  if (daysDelta === 0) return 'Срок сегодня';
  return `Осталось ${daysDelta} дн.`;
}

export function periodRange(period: string, ref: Date): { from: Date | null; to: Date | null } {
  const d = startOfDay(ref);
  if (period === 'Сегодня') return { from: d, to: d };
  if (period === 'Текущая неделя') {
    const day = d.getDay() || 7;
    const from = new Date(d);
    from.setDate(d.getDate() - day + 1);
    return { from, to: d };
  }
  if (period === 'Текущий месяц') return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: d };
  if (period === 'Текущий квартал') {
    const q = Math.floor(d.getMonth() / 3) * 3;
    return { from: new Date(d.getFullYear(), q, 1), to: d };
  }
  if (period === 'Текущий год') return { from: new Date(d.getFullYear(), 0, 1), to: d };
  return { from: null, to: null };
}
