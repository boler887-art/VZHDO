import type { AppealRecord, IncomingRecord, ProtocolRecord } from '../types';

export function protocolNextAction(r: ProtocolRecord): string {
  const st = r.executionStatusNormalized;
  if (st === 'Снят с контроля' || st === 'Постоянно') return 'Действий не требуется';
  if (st === 'Просрочено') return 'Уточнить исполнение и результат';
  if (st === 'На снятии с контроля') return 'Рассмотреть снятие с контроля';
  if (st === 'Рабочий контроль') return 'Продолжить контроль';
  if (r.deadlineType === 'TEXT') return 'Контроль по установленной периодичности';
  if (st === 'В работе' && r.daysDelta === 0) return 'Проверить исполнение сегодня';
  if (st === 'В работе' && r.daysDelta != null && r.daysDelta >= 1 && r.daysDelta <= 3) return 'Проверить готовность';
  if (st === 'В работе') return 'Контроль исполнения';
  return 'Проверить статус исполнения';
}

export function appealNextAction(r: AppealRecord): string {
  if (r.executionStatusNormalized === 'Завершено') return 'Действий не требуется';
  if (r.daysDelta != null && r.daysDelta < 0) return 'Подготовить/уточнить ответ';
  if (r.daysDelta === 0) return 'Проверить готовность ответа';
  if (r.daysDelta != null && r.daysDelta <= 3) return 'Контроль подготовки ответа';
  if (r.daysDelta != null && r.daysDelta <= 7) return 'Плановый контроль';
  return 'Контроль исполнения';
}

export function incomingNextAction(r: IncomingRecord): string {
  if (['Выполнено', 'Выполнен'].includes(r.executionStatusNormalized)) return 'Действий не требуется';
  if (r.daysDelta != null && r.daysDelta < 0) return 'Уточнить исполнение';
  if (r.daysDelta === 0) return 'Проверить исполнение сегодня';
  if (r.daysDelta != null && r.daysDelta <= 3) return 'Проверить готовность';
  if (r.daysDelta != null && r.daysDelta <= 7) return 'Плановый контроль';
  return 'Контроль исполнения';
}
