import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ImportPackage, StoredDocument, TripData } from './types';
import { MAX_DOCUMENT_BYTES, sha256, validatePackage, validateTrip } from './validation';

export const STORAGE_DB_NAME = 'aloha-honeymoon-local-v1';
interface TravelDatabase extends DBSchema {
  trip: { key: string; value: TripData };
  documents: { key: string; value: StoredDocument };
}
let connection: Promise<IDBPDatabase<TravelDatabase>> | undefined;
function database() {
  connection ??= openDB<TravelDatabase>(STORAGE_DB_NAME, 1, {
    upgrade(db) { db.createObjectStore('trip'); db.createObjectStore('documents', { keyPath: 'id' }); },
    blocking() { void closeStorage(); },
    terminated() { connection = undefined; },
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}
export async function closeStorage(): Promise<void> {
  const pending = connection; connection = undefined;
  (await pending)?.close();
}
export async function loadTrip(): Promise<TripData | null> {
  const trip = await (await database()).get('trip', 'current');
  if (trip) validateTrip(trip);
  return trip ?? null;
}
export async function getDocument(id: string): Promise<StoredDocument | undefined> {
  return (await database()).get('documents', id);
}

/** Prepare a PDF without changing storage; pass it with the edited trip to saveTrip. */
export async function prepareDocument(file: File): Promise<StoredDocument> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new Error('PDF는 0바이트 초과, 50MB 이하여야 합니다.');
  const prefix = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!prefix.includes('%PDF-')) throw new Error('PDF 파일을 선택해 주세요.');
  return { id: crypto.randomUUID(), name: file.name, data: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }) };
}

/** The trip, inserted documents and removed documents commit together. */
export async function saveTrip(trip: TripData, documents: StoredDocument[] = []): Promise<void> {
  validateTrip(trip);
  if (new Set(documents.map(document => document.id)).size !== documents.length) throw new Error('중복된 PDF가 있습니다.');
  for (const document of documents) {
    const meta = trip.documents.find(item => item.id === document.id);
    if (!meta || !(document.data instanceof Blob) || meta.name !== document.name || meta.size !== document.data.size) throw new Error('문서 정보와 PDF가 맞지 않습니다.');
    const prefix = new TextDecoder().decode(await document.data.slice(0, 1024).arrayBuffer());
    if (!prefix.includes('%PDF-')) throw new Error('PDF 형식의 파일만 저장할 수 있습니다.');
    if (meta.sha256 && (await sha256(document.data)) !== meta.sha256.toLowerCase()) throw new Error('PDF 확인 값이 다릅니다.');
  }
  const db = await database();
  const tx = db.transaction(['trip', 'documents'], 'readwrite');
  try {
    const documentStore = tx.objectStore('documents');
    const previous = await documentStore.getAll();
    const available = new Map(previous.map(document => [document.id, document]));
    for (const document of documents) available.set(document.id, document);
    for (const meta of trip.documents) {
      const document = available.get(meta.id);
      if (!document || document.name !== meta.name || document.data.size !== meta.size) throw new Error('저장할 PDF가 없습니다. 다시 첨부해 주세요.');
    }
    const keep = new Set(trip.documents.map(meta => meta.id));
    const writes = [tx.objectStore('trip').put(trip, 'current')];
    await Promise.all([
      ...writes,
      ...documents.map(document => documentStore.put(document)),
      ...previous.filter(document => !keep.has(document.id)).map(document => documentStore.delete(document.id)),
    ]);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* A failed transaction is already aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function replacePackage(pkg: ImportPackage): Promise<void> {
  await validatePackage(pkg);
  const db = await database();
  const tx = db.transaction(['trip', 'documents'], 'readwrite');
  try {
    const store = tx.objectStore('documents');
    await Promise.all([store.clear(), tx.objectStore('trip').clear()]);
    await Promise.all([tx.objectStore('trip').put(pkg.trip, 'current'), ...pkg.documents.map(document => store.put(document))]);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* A failed transaction is already aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** A single readonly transaction prevents mixing documents and trip revisions. */
export async function loadSnapshot(): Promise<ImportPackage> {
  const db = await database();
  const tx = db.transaction(['trip', 'documents'], 'readonly');
  const [trip, documents] = await Promise.all([tx.objectStore('trip').get('current'), tx.objectStore('documents').getAll()]);
  await tx.done;
  if (!trip) throw new Error('먼저 여행을 만들거나 불러와 주세요.');
  const pkg = { trip, documents, exportedAt: new Date().toISOString() };
  await validatePackage(pkg);
  return pkg;
}
