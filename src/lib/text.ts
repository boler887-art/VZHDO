export function norm(s: unknown): string {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ёЁ]/g, (c) => (c === 'ё' ? 'е' : 'Е'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function headerKey(s: unknown): string {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[«»"']/g, '');
}

export function splitPersons(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  const s = String(raw).replace(/\r/g, '');
  return s
    .split(/[;\n]+|(?<=[а-яa-z.])\s*,\s*(?=[А-ЯA-ZӘІҢҒҮҰҚӨҺ])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function previewText(s: string | null, max = 160): string {
  if (!s) return '—';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const n = s.toLowerCase();
  const map: Record<string, string> = {
    'в работе': 'В работе',
    'рабочий контроль': 'Рабочий контроль',
    'на снятии с контроля': 'На снятии с контроля',
    'снят с контроля': 'Снят с контроля',
    'просрочено': 'Просрочено',
    'просрочен': 'Просрочено',
    'не исполнен': 'Не исполнен',
    'не исполнено': 'Не исполнено',
    'на исполнении': 'На исполнении',
    'завершено': 'Завершено',
    'выполнен': 'Выполнено',
    'выполнено': 'Выполнено',
    'постоянно': 'Постоянно',
  };
  return map[n] || s;
}

export function parseSurnameInitials(name: string): { surname: string; initials: string } | null {
  const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return {
    surname: norm(parts[0]),
    initials: parts.slice(1).map((p) => norm(p)[0]).join(''),
  };
}
