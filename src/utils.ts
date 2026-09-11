import type { BudgetItem, ItineraryItem, Money, TripData } from './types';

export function money(value: Money | null | undefined): string {
  if (!value) return '미입력';
  return value.currency === 'KRW'
    ? `${value.amount.toLocaleString('ko-KR')}원`
    : `$${(value.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function sumMoney(values: (Money | null | undefined)[]) {
  return values.reduce((acc, value) => {
    if (value) acc[value.currency] += value.amount;
    return acc;
  }, { KRW: 0, USD: 0 });
}
export function sumLabel(totals: { KRW: number; USD: number }, empty = '아직 없어요') {
  return [totals.KRW ? money({ currency: 'KRW', amount: totals.KRW }) : '',
    totals.USD ? money({ currency: 'USD', amount: totals.USD }) : ''].filter(Boolean).join(' + ') || empty;
}
export function estimatedKrw(budgets: BudgetItem[], rate: number | null): number | null {
  let sum = 0;
  for (const payment of budgets.flatMap(b => b.payments)) {
    if (payment.money.currency === 'KRW') sum += payment.money.amount;
    else if (payment.krwCharged !== undefined) sum += payment.krwCharged;
    else if (rate) sum += Math.round(payment.money.amount / 100 * rate);
    else return null;
  }
  return sum;
}
export function today(zone = 'Pacific/Honolulu') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function dateLabel(date: string, long = false) {
  if (!date) return '날짜 미정';
  const value = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('ko-KR', long
    ? { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }
    : { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(value);
}
export function dayDifference(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}
export function tripDates(trip: TripData) {
  const dates = new Set(trip.itinerary.map(e => e.date));
  if (trip.startDate && trip.endDate) {
    const count = Math.min(366, dayDifference(trip.endDate, trip.startDate));
    for (let n = 0; n <= count; n++) dates.add(new Date(Date.parse(`${trip.startDate}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10));
  }
  return [...dates].sort();
}
export function eventInstant(event: ItineraryItem) {
  if (!event.startTime) return null;
  return Date.parse(`${event.date}T${event.startTime}:00${event.timeZone === 'Asia/Seoul' ? '+09:00' : '-10:00'}`);
}
export function sortedEvents(items: ItineraryItem[]) {
  const known = items.filter(e => e.startTime).sort((a, b) => eventInstant(a)! - eventInstant(b)! || a.order - b.order);
  const unknown = items.filter(e => !e.startTime).sort((a, b) => a.order - b.order);
  // Keep unscheduled preparation notes adjacent to their original anchors.
  for (const item of unknown) {
    const next = known.findIndex(e => e.order > item.order);
    known.splice(next < 0 ? known.length : next, 0, item);
  }
  return known;
}
export function timeLabel(event: ItineraryItem) {
  return event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ''}` : '시간 미정';
}
export function safeUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
export function mapUrl(place: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
export function uid() { return crypto.randomUUID(); }
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '휴대폰 저장 공간이 부족해요. 기존 여행은 유지됩니다. 공간을 확보한 뒤 다시 해주세요.';
  return error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.';
}
