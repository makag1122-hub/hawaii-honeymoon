import { strFromU8, strToU8, unzipSync, zip, type Zippable } from 'fflate';
import type { ImportPackage, StoredDocument } from './types';
import { loadSnapshot } from './storage';
import { MAX_EXPANDED_BYTES, MAX_ZIP_BYTES, sha256, validatePackage, validateTimestamp, validateTrip } from './validation';

const badZip = (): never => { throw new Error('여행 백업 ZIP 구조가 올바르지 않습니다.'); };
interface Entry { name: string; originalSize: number; crc: number }
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Read sizes and names before giving the archive to the decompressor. ZIP64 is unnecessary here. */
function inspectZip(bytes: Uint8Array): Entry[] {
  if (bytes.byteLength < 22) return badZip();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 65557); position--) {
    if (view.getUint32(position, true) === 0x06054b50 && position + 22 + view.getUint16(position + 20, true) === bytes.length) { end = position; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) return badZip();
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (!count || count > 1001 || count !== view.getUint16(end + 8, true) || start + size !== end) return badZip();
  const entries: Entry[] = [];
  const names = new Set<string>();
  let offset = start;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return badZip();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if ((flags & 1) || ![0, 8].includes(method) || view.getUint16(offset + 34, true) !== 0 || compressed === 0xffffffff || expanded === 0xffffffff || localOffset === 0xffffffff) return badZip();
    if (((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000) return badZip();
    if (offset + 46 + nameLength + extraLength + commentLength > end || !nameLength || nameLength > 160) return badZip();
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!/^(trip\.json|documents\/[A-Za-z0-9_-]{1,120}\.pdf)$/.test(name) || names.has(name)) return badZip();
    names.add(name);
    total += expanded;
    if (total > MAX_EXPANDED_BYTES || (name === 'trip.json' && expanded > 8 * 1024 * 1024)) throw new Error('백업 압축 해제 용량은 100MB, 여행 정보는 8MB 이하여야 합니다.');
    if (localOffset + 30 > start || view.getUint32(localOffset, true) !== 0x04034b50) return badZip();
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressed > start || view.getUint16(localOffset + 8, true) !== method || view.getUint16(localOffset + 6, true) !== flags) return badZip();
    if (strFromU8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== name) return badZip();
    if (!(flags & 8) && (view.getUint32(localOffset + 18, true) !== compressed || view.getUint32(localOffset + 22, true) !== expanded)) return badZip();
    entries.push({ name, originalSize: expanded, crc: view.getUint32(offset + 16, true) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end || !names.has('trip.json')) return badZip();
  return entries;
}

export async function parsePackage(file: Blob): Promise<ImportPackage> {
  if (!file.size || file.size > MAX_ZIP_BYTES) throw new Error('백업 ZIP은 50MB 이하여야 합니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = inspectZip(bytes);
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('백업 ZIP을 읽을 수 없습니다. 파일을 다시 확인해 주세요.'); }
  for (const entry of entries) if (!files[entry.name] || files[entry.name].length !== entry.originalSize || crc32(files[entry.name]) !== entry.crc) badZip();
  let wrapper: Record<string, unknown>;
  try { wrapper = JSON.parse(strFromU8(files['trip.json'])) as Record<string, unknown>; } catch { throw new Error('여행 정보 JSON이 손상되었습니다.'); }
  if (!wrapper || typeof wrapper !== 'object' || wrapper.schemaVersion !== 1) throw new Error('지원하지 않는 여행 백업 버전입니다.');
  validateTrip(wrapper.trip); validateTimestamp(wrapper.exportedAt, '백업 시각');
  if (entries.length !== wrapper.trip.documents.length + 1) throw new Error('백업의 PDF 목록과 문서 정보가 맞지 않습니다.');
  const documents: StoredDocument[] = wrapper.trip.documents.map(meta => {
    const data = files[`documents/${meta.id}.pdf`];
    if (!data || data.length !== meta.size) throw new Error('백업에 필요한 PDF가 없거나 크기가 다릅니다.');
    return { id: meta.id, name: meta.name, data: new Blob([Uint8Array.from(data)], { type: 'application/pdf' }) };
  });
  const pkg = { trip: wrapper.trip, documents, exportedAt: wrapper.exportedAt };
  await validatePackage(pkg);
  return pkg;
}

export async function exportPackage(): Promise<Blob> {
  const snapshot = await loadSnapshot();
  const trip = structuredClone(snapshot.trip);
  const files: Zippable = {};
  for (const document of snapshot.documents) {
    const bytes = new Uint8Array(await document.data.arrayBuffer());
    const meta = trip.documents.find(item => item.id === document.id)!;
    meta.sha256 = await sha256(bytes);
    files[`documents/${document.id}.pdf`] = [bytes, { level: 0 }];
  }
  files['trip.json'] = strToU8(JSON.stringify({ schemaVersion: 1, exportedAt: snapshot.exportedAt, trip }, null, 2));
  const archive = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
  if (archive.byteLength > MAX_ZIP_BYTES) throw new Error('백업이 50MB를 넘습니다. 불필요한 PDF를 정리한 후 다시 저장해 주세요.');
  return new Blob([Uint8Array.from(archive)], { type: 'application/zip' });
}
