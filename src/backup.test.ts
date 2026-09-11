import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlankTrip, type ImportPackage } from './types';
import { closeStorage, loadTrip, replacePackage, STORAGE_DB_NAME } from './storage';
import { exportPackage, parsePackage } from './backup';
import { MAX_EXPANDED_BYTES, sha256, validateTrip } from './validation';

const pdfBytes = strToU8('%PDF-1.4\n% Synthetic test document\n%%EOF');
function fixture(): ImportPackage {
  const trip = createBlankTrip();
  const data = new Blob([pdfBytes], { type: 'application/pdf' });
  trip.documents = [{ id: 'test-pdf', name: '같은 이름.pdf', size: data.size }];
  trip.budgets = [{ id: 'budget-test', title: '시험 예산', category: '기타', basis: '2명', plannedAmount: { currency: 'USD', amount: 12345 }, payments: [{ id: 'pay-test', money: { currency: 'KRW', amount: 5000 }, date: '', note: '구매일 미상' }], paymentStatus: 'partial', notes: '' }];
  return { trip, documents: [{ id: 'test-pdf', name: '같은 이름.pdf', data }], exportedAt: '2026-09-11T00:00:00.000Z' };
}
function archive(pkg = fixture(), extras: Record<string, Uint8Array> = {}): Blob {
  const files = { 'trip.json': strToU8(JSON.stringify({ schemaVersion: 1, exportedAt: pkg.exportedAt, trip: pkg.trip })), 'documents/test-pdf.pdf': pdfBytes, ...extras };
  return new Blob([zipSync(files)]);
}
beforeEach(async () => { await closeStorage(); await deleteDB(STORAGE_DB_NAME); });
afterEach(async () => { await closeStorage(); });

describe('portable private backup', () => {
  it('round-trips amounts, unknown dates, Korean filenames and exact PDF bytes', async () => {
    const initial = await parsePackage(archive()); await replacePackage(initial);
    const exported = await exportPackage(); const restored = await parsePackage(exported);
    expect(restored.trip.budgets).toEqual(initial.trip.budgets);
    expect(restored.trip.documents[0].name).toBe('같은 이름.pdf');
    expect(restored.trip.documents[0].sha256).toBe(await sha256(initial.documents[0].data));
    expect(await sha256(restored.documents[0].data)).toBe(await sha256(initial.documents[0].data));
    await replacePackage(restored);
    expect((await loadTrip())?.id).toBe(initial.trip.id);
  });
  it('rejects archives with undeclared files or unsafe paths', async () => {
    await expect(parsePackage(archive(fixture(), { '../private.txt': strToU8('no') }))).rejects.toThrow();
    await expect(parsePackage(archive(fixture(), { 'documents/extra.pdf': pdfBytes }))).rejects.toThrow('문서');
  });
  it('checks expanded-size headers before decompressing', async () => {
    const bytes = new Uint8Array(await archive().arrayBuffer());
    const view = new DataView(bytes.buffer);
    let central = -1;
    for (let index = 0; index < bytes.length - 4; index++) if (view.getUint32(index, true) === 0x02014b50) { central = index; break; }
    expect(central).toBeGreaterThan(0);
    view.setUint32(central + 24, MAX_EXPANDED_BYTES + 1, true);
    await expect(parsePackage(new Blob([bytes]))).rejects.toThrow('용량');
  });
  it('rejects altered PDF hashes without touching existing saved data', async () => {
    const original = createBlankTrip(); await replacePackage({ trip: original, documents: [], exportedAt: new Date().toISOString() });
    const broken = fixture(); broken.trip.documents[0].sha256 = '0'.repeat(64);
    await expect(parsePackage(archive(broken))).rejects.toThrow('확인 값');
    expect(await loadTrip()).toEqual(original);
  });
  it('rejects unsupported versions, invalid money, dates and dangling reservation links', () => {
    expect(() => validateTrip({ ...createBlankTrip(), schemaVersion: 2 })).toThrow('버전');
    const badMoney = fixture().trip; badMoney.budgets[0].plannedAmount!.amount = .1;
    expect(() => validateTrip(badMoney)).toThrow('정수');
    expect(() => validateTrip({ ...createBlankTrip(), startDate: '2027-02-30' })).toThrow('날짜');
    const badLink = fixture().trip; badLink.budgets[0].reservationId = 'missing';
    expect(() => validateTrip(badLink)).toThrow('예약');
  });
});
