export type Zone = 'Asia/Seoul' | 'Pacific/Honolulu';
export type Currency = 'KRW' | 'USD';
/** Money is stored in minor units: KRW won, USD cents. */
export interface Money { currency: Currency; amount: number }
export type ReservationStatus = 'unbooked' | 'planned' | 'confirmed' | 'not-needed' | 'walk-in';
export interface ItineraryItem {
  id: string; date: string; startTime: string | null; endTime: string | null;
  timeZone: Zone; order: number; region: string; title: string; place: string;
  transport: string; notes: string; reservationId?: string; referenceUrl?: string;
  needsReview?: boolean; sourceNote?: string; sourceDate?: string;
}
export interface Payment { id: string; money: Money; date: string; note: string; krwCharged?: number }
export interface BudgetItem {
  id: string; category: string; title: string; basis: string; plannedAmount: Money | null;
  payments: Payment[]; paymentStatus: 'unknown' | 'unpaid' | 'partial' | 'paid';
  referenceAmount?: Money; notes: string; sourceNote?: string; reservationId?: string;
}
export interface Reservation {
  id: string; title: string; status: ReservationStatus; date: string;
  deadline: string; deadlineTimeZone: Zone; priority: 'high' | 'normal';
  notes: string; url: string; documentIds: string[]; sourceNote?: string;
  sourceDate?: string; needsReview?: boolean;
}
export interface PackingItem {
  id: string; category: string; title: string; quantity: string; owner: string;
  bag: string; done: boolean; notes: string;
}
export interface DocumentMeta { id: string; name: string; size: number; sha256?: string }
export interface TripData {
  schemaVersion: 1; id: string; title: string; people: string[];
  startDate: string; endDate: string; updatedAt: string;
  itinerary: ItineraryItem[]; budgets: BudgetItem[]; reservations: Reservation[];
  packing: PackingItem[]; documents: DocumentMeta[];
  settings: { targetBudgetKrw: number | null; exchangeRate: number | null };
}
export interface StoredDocument { id: string; name: string; data: Blob }
export interface ImportPackage { trip: TripData; documents: StoredDocument[]; exportedAt: string }

export const reservationLabels: Record<ReservationStatus, string> = {
  unbooked: '미예약', planned: '예약예정', confirmed: '예약완료',
  'not-needed': '예약 불필요', 'walk-in': '현장대기',
};
export function createBlankTrip(): TripData {
  return {
    schemaVersion: 1, id: crypto.randomUUID(), title: '우리 둘의 알로하', people: ['', ''],
    startDate: '', endDate: '', updatedAt: new Date().toISOString(), itinerary: [], budgets: [],
    reservations: [], packing: [], documents: [], settings: { targetBudgetKrw: null, exchangeRate: null },
  };
}
