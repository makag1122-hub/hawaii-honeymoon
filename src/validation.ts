import type { ImportPackage, TripData } from './types';

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,120}$/;
type Obj = Record<string, unknown>;
// The explicit variable type lets TypeScript treat a fail() call as a dead end,
// so checks like `if (!meta || ...) fail(...)` narrow the value that follows.
const fail: (path: string, reason: string) => never = (path, reason) => { throw new Error(`${path}: ${reason}`); };
function object(value: unknown, path: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, '형식을 확인해 주세요.');
  return value as Obj;
}
function text(value: unknown, path: string, max = 20000): asserts value is string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail(path, '올바른 글자가 아니거나 너무 깁니다.');
}
function optionalText(value: unknown, path: string) { if (value !== undefined) text(value, path); }
function id(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) fail(path, '항목 번호가 올바르지 않습니다.');
}
function integer(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, '0 이상의 정수여야 합니다.');
}
function choice(value: unknown, values: readonly string[], path: string) {
  if (typeof value !== 'string' || !values.includes(value)) fail(path, '선택 값이 올바르지 않습니다.');
}
function bool(value: unknown, path: string) { if (typeof value !== 'boolean') fail(path, '체크 값이 올바르지 않습니다.'); }
function date(value: unknown, path: string, allowEmpty = true) {
  text(value, path, 10);
  if (allowEmpty && value === '') return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(path, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(path, '존재하지 않는 날짜입니다.');
}
export function validateTimestamp(value: unknown, path: string): asserts value is string {
  text(value, path, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(path, '저장 시각이 올바르지 않습니다.');
  date(value.slice(0, 10), path, false);
}
function time(value: unknown, path: string) {
  if (value !== null && (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) fail(path, '시간은 HH:mm 또는 미정이어야 합니다.');
}
function url(value: unknown, path: string) {
  text(value, path, 5000);
  if (!value) return;
  try { if (!['https:', 'http:'].includes(new URL(value).protocol)) fail(path, 'http 또는 https 주소만 사용할 수 있습니다.'); }
  catch { fail(path, '웹 주소가 올바르지 않습니다.'); }
}
function array(value: unknown, path: string, maximum = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(path, '목록 형식이나 항목 수를 확인해 주세요.');
  return value;
}
function records(value: unknown, path: string): Obj[] {
  const ids = new Set<string>();
  return array(value, path).map((entry, index) => {
    const row = object(entry, `${path} ${index + 1}`);
    id(row.id, path);
    if (ids.has(row.id)) fail(path, '중복된 항목 번호가 있습니다.');
    ids.add(row.id);
    return row;
  });
}
function money(value: unknown, path: string) {
  const entry = object(value, path);
  choice(entry.currency, ['KRW', 'USD'], path);
  integer(entry.amount, path);
}
function sources(row: Obj, path: string) {
  optionalText(row.sourceNote, path);
  optionalText(row.sourceDate, path);
  if (row.needsReview !== undefined) bool(row.needsReview, path);
}

export function validateTrip(value: unknown): asserts value is TripData {
  const trip = object(value, '여행');
  if (trip.schemaVersion !== 1) fail('여행', '지원하지 않는 백업 버전입니다.');
  id(trip.id, '여행 번호');
  text(trip.title, '여행 이름', 2000);
  for (const person of array(trip.people, '여행자', 20)) text(person, '여행자', 1000);
  date(trip.startDate, '출발일'); date(trip.endDate, '도착일');
  if (trip.startDate && trip.endDate && String(trip.startDate) > String(trip.endDate)) fail('여행 날짜', '도착일이 출발일보다 빠릅니다.');
  validateTimestamp(trip.updatedAt, '최근 저장 시각');
  const settings = object(trip.settings, '설정');
  if (settings.targetBudgetKrw !== null) integer(settings.targetBudgetKrw, '목표 예산');
  if (settings.exchangeRate !== null && (typeof settings.exchangeRate !== 'number' || !Number.isFinite(settings.exchangeRate) || settings.exchangeRate <= 0 || settings.exchangeRate > 1000000)) fail('환율', '0보다 큰 유효한 숫자여야 합니다.');
  const docs = records(trip.documents, '문서');
  const docIds = new Set(docs.map(doc => doc.id));
  let totalSize = 0;
  for (const doc of docs) {
    text(doc.name, '문서 이름', 500);
    if (!doc.name || /[\u0000-\u001f]/.test(doc.name)) fail('문서 이름', '이름을 확인해 주세요.');
    integer(doc.size, '문서 크기');
    if ((doc.size as number) > MAX_DOCUMENT_BYTES || doc.size === 0) fail('문서 크기', 'PDF는 0바이트 초과, 50MB 이하여야 합니다.');
    totalSize += doc.size as number;
    if (doc.sha256 !== undefined && (typeof doc.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(doc.sha256))) fail('문서 확인 값', 'SHA-256 형식이 올바르지 않습니다.');
  }
  if (totalSize > MAX_EXPANDED_BYTES) fail('문서', '전체 문서 용량은 100MB 이하여야 합니다.');
  const reservations = records(trip.reservations, '예약');
  const reservationIds = new Set(reservations.map(row => row.id));
  for (const row of reservations) {
    text(row.title, '예약 이름', 2000); text(row.notes, '예약 메모');
    choice(row.status, ['unbooked', 'planned', 'confirmed', 'not-needed', 'walk-in'], '예약 상태');
    choice(row.priority, ['high', 'normal'], '예약 우선순위');
    choice(row.deadlineTimeZone, ['Asia/Seoul', 'Pacific/Honolulu'], '예약 시간대');
    date(row.date, '예약일'); date(row.deadline, '예약 마감일'); url(row.url, '예약 주소'); sources(row, '예약 출처');
    const refs = array(row.documentIds, '예약 문서', 1000);
    if (new Set(refs).size !== refs.length) fail('예약 문서', '중복 연결이 있습니다.');
    for (const ref of refs) { id(ref, '문서 번호'); if (!docIds.has(ref)) fail('예약 문서', '연결된 문서가 없습니다.'); }
  }
  function reservationRef(row: Obj) {
    if (row.reservationId !== undefined) { id(row.reservationId, '예약 번호'); if (!reservationIds.has(row.reservationId)) fail('예약 연결', '연결된 예약이 없습니다.'); }
  }
  for (const row of records(trip.itinerary, '일정')) {
    date(row.date, '일정 날짜', false); time(row.startTime, '시작 시간'); time(row.endTime, '종료 시간');
    choice(row.timeZone, ['Asia/Seoul', 'Pacific/Honolulu'], '일정 시간대'); integer(row.order, '일정 순서');
    for (const key of ['region', 'title', 'place', 'transport', 'notes']) text(row[key], `일정 ${key}`);
    if (row.referenceUrl !== undefined) url(row.referenceUrl, '일정 참고 주소');
    sources(row, '일정 출처'); reservationRef(row);
  }
  for (const row of records(trip.budgets, '예산')) {
    for (const key of ['category', 'title', 'basis', 'notes']) text(row[key], `예산 ${key}`);
    if (row.plannedAmount !== null) money(row.plannedAmount, '예상 금액');
    if (row.referenceAmount !== undefined) money(row.referenceAmount, '참고 금액');
    choice(row.paymentStatus, ['unknown', 'unpaid', 'partial', 'paid'], '결제 상태');
    for (const payment of records(row.payments, '결제')) {
      money(payment.money, '결제 금액'); date(payment.date, '결제일'); text(payment.note, '결제 메모');
      if (payment.krwCharged !== undefined) integer(payment.krwCharged, '원화 청구액');
    }
    sources(row, '예산 출처'); reservationRef(row);
  }
  for (const row of records(trip.packing, '준비물')) {
    for (const key of ['category', 'title', 'quantity', 'owner', 'bag', 'notes']) text(row[key], `준비물 ${key}`);
    bool(row.done, '준비물 체크');
  }
}

export async function sha256(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : Uint8Array.from(data).buffer;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function validatePackage(value: ImportPackage): Promise<void> {
  validateTrip(value.trip); validateTimestamp(value.exportedAt, '백업 시각');
  const documents = array(value.documents, '백업 문서', 10000);
  const ids = new Set<string>();
  if (documents.length !== value.trip.documents.length) fail('백업', '문서 수가 맞지 않습니다.');
  for (const raw of documents) {
    const document = object(raw, '백업 문서');
    id(document.id, '백업 문서 번호');
    if (ids.has(document.id)) fail('백업', '중복된 PDF가 있습니다.');
    ids.add(document.id);
    const meta = value.trip.documents.find(item => item.id === document.id);
    if (!meta || !(document.data instanceof Blob) || document.data.size !== meta.size || document.name !== meta.name) fail('백업', 'PDF와 문서 정보가 맞지 않습니다.');
    const blob = document.data as Blob;
    const prefix = new TextDecoder().decode(await blob.slice(0, 1024).arrayBuffer());
    if (!prefix.includes('%PDF-')) fail('백업', 'PDF 형식이 아닌 문서가 있습니다.');
    if (meta.sha256 && (await sha256(blob)) !== meta.sha256.toLowerCase()) fail('백업', 'PDF 확인 값이 다릅니다. 파일이 손상되었을 수 있습니다.');
  }
}
