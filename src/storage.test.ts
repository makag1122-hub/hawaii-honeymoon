import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { deleteDB } from 'idb';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createBlankTrip, type ImportPackage, type StoredDocument } from './types';
import { closeStorage, getDocument, loadTrip, prepareDocument, replacePackage, saveTrip, STORAGE_DB_NAME } from './storage';

const pdf = () => new Blob(['%PDF-1.4\n% Synthetic test only\n%%EOF'], { type: 'application/pdf' });
function fixture(): ImportPackage {
  const trip = createBlankTrip();
  const document: StoredDocument = { id: 'doc-test', name: '테스트.pdf', data: pdf() };
  trip.documents = [{ id: document.id, name: document.name, size: document.data.size }];
  return { trip, documents: [document], exportedAt: new Date().toISOString() };
}
beforeEach(async () => { await closeStorage(); await deleteDB(STORAGE_DB_NAME); });
afterEach(async () => { vi.restoreAllMocks(); await closeStorage(); });

describe('local trip storage', () => {
  it('keeps edits and original PDFs after reopening the database', async () => {
    const pkg = fixture();
    await replacePackage(pkg);
    const edited = { ...pkg.trip, title: '수정한 여행' };
    await saveTrip(edited);
    await closeStorage();
    expect((await loadTrip())?.title).toBe(edited.title);
    expect(await (await getDocument('doc-test'))?.data.text()).toBe(await pkg.documents[0].data.text());
  });
  it('saves a new PDF and its metadata together, and removes deleted attachments', async () => {
    const pkg = fixture();
    await saveTrip(pkg.trip, pkg.documents);
    expect(await getDocument('doc-test')).toBeDefined();
    await saveTrip({ ...pkg.trip, documents: [] });
    expect(await getDocument('doc-test')).toBeUndefined();
  });
  it('preserves the existing trip when an edit refers to a missing PDF', async () => {
    const initial = createBlankTrip(); await saveTrip(initial);
    const broken = fixture().trip;
    await expect(saveTrip(broken)).rejects.toThrow('PDF');
    expect(await loadTrip()).toEqual(initial);
  });
  it('rolls back both stores when a replacement write fails after clearing', async () => {
    const initial = fixture(); await replacePackage(initial);
    const replacement = { trip: createBlankTrip(), documents: [], exportedAt: new Date().toISOString() };
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Synthetic storage failure', 'QuotaExceededError'); });
    await expect(replacePackage(replacement)).rejects.toThrow('Synthetic storage failure');
    vi.restoreAllMocks();
    expect(await loadTrip()).toEqual(initial.trip);
    expect(await (await getDocument('doc-test'))?.data.text()).toBe(await initial.documents[0].data.text());
  });
  it('prepares attachments without a standalone write and rejects non-PDF data', async () => {
    const prepared = await prepareDocument(new File([pdf()], '준비.pdf', { type: 'application/pdf' }));
    expect(prepared.name).toBe('준비.pdf');
    expect(await getDocument(prepared.id)).toBeUndefined();
    await expect(prepareDocument(new File(['plain text'], 'fake.pdf'))).rejects.toThrow('PDF');
  });
});
