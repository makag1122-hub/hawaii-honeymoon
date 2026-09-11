import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookMarked, CalendarDays, CircleAlert, CircleCheck, Clock, CloudDownload, Download, ExternalLink,
  FileText, Heart, Info, Luggage, MapPin, Pencil, Plane, Plus, RefreshCw, Settings, Sparkles,
  Trash2, Upload, Wallet, WifiOff,
} from 'lucide-react';
import type { BudgetItem, ItineraryItem, PackingItem, Reservation, ReservationStatus, StoredDocument, TripData } from './types';
import { createBlankTrip, reservationLabels } from './types';
import { getDocument, loadTrip, replacePackage, saveTrip } from './storage';
import { exportPackage, parsePackage } from './backup';
import { subscribePwa, updateApp } from './pwa';
import type { PwaState } from './pwa';
import {
  dateLabel, dayDifference, downloadBlob, estimatedKrw, friendlyError, mapUrl, money, safeUrl,
  sortedEvents, sumLabel, sumMoney, timeLabel, today, tripDates, uid,
} from './utils';
import { Flower, IslandArtwork } from './components/Artwork';
import { Sheet } from './components/Sheet';
import { BudgetEditor, EventEditor, PackingEditor, ReservationEditor, SettingsEditor } from './components/Editors';
import { PdfViewer } from './components/PdfViewer';

const tabs = [
  { key: 'today', label: '오늘', Icon: Heart },
  { key: 'plan', label: '일정', Icon: CalendarDays },
  { key: 'money', label: '예산', Icon: Wallet },
  { key: 'book', label: '예약', Icon: BookMarked },
  { key: 'pack', label: '준비물', Icon: Luggage },
] as const;
type TabKey = (typeof tabs)[number]['key'];
type Editing =
  | { kind: 'event'; item: ItineraryItem } | { kind: 'budget'; item: BudgetItem }
  | { kind: 'reservation'; item: Reservation } | { kind: 'packing'; item: PackingItem }
  | { kind: 'settings' } | { kind: 'storage' } | null;

const statusTone: Record<ReservationStatus, string> = {
  unbooked: 'warn', planned: 'wait', confirmed: 'good', 'not-needed': 'mute', 'walk-in': 'wait',
};
const statusOrder: ReservationStatus[] = ['unbooked', 'planned', 'walk-in', 'confirmed', 'not-needed'];
const paymentLabels: Record<BudgetItem['paymentStatus'], string> = {
  unknown: '확인 필요', unpaid: '결제 전', partial: '일부 결제', paid: '결제완료',
};

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item) || '기타';
    const bucket = groups.get(name);
    if (bucket) bucket.push(item); else groups.set(name, [item]);
  }
  return [...groups.entries()];
}
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(entry => entry.id === item.id) ? list.map(entry => entry.id === item.id ? item : entry) : [...list, item];
}
function blankEvent(date: string, order: number): ItineraryItem {
  return { id: uid(), date, startTime: null, endTime: null, timeZone: 'Pacific/Honolulu', order, region: '', title: '', place: '', transport: '', notes: '' };
}
function blankBudget(): BudgetItem {
  return { id: uid(), category: '기타', title: '', basis: '', plannedAmount: null, payments: [], paymentStatus: 'unpaid', notes: '' };
}
function blankReservation(): Reservation {
  return { id: uid(), title: '', status: 'unbooked', date: '', deadline: '', deadlineTimeZone: 'Pacific/Honolulu', priority: 'normal', notes: '', url: '', documentIds: [] };
}
function blankPacking(): PackingItem {
  return { id: uid(), category: '기타', title: '', quantity: '', owner: '', bag: '', done: false, notes: '' };
}

function Chip({ tone = 'mute', children }: { tone?: string; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
function Empty({ text, hint }: { text: string; hint?: string }) {
  return <div className="empty"><Sparkles size={26} aria-hidden="true" /><p>{text}</p>{hint && <span>{hint}</span>}</div>;
}
function CardNotes({ notes, source }: { notes?: string; source?: string }) {
  return <>
    {notes && <p className="card-notes">{notes}</p>}
    {source && <details className="source-note"><summary>원래 자료와 변경 근거</summary><p>{source}</p></details>}
  </>;
}
function Review({ on }: { on?: boolean }) {
  return on ? <Chip tone="warn"><CircleAlert size={13} aria-hidden="true" /> 다시 확인</Chip> : null;
}
function LinkOut({ href, children }: { href?: string; children: ReactNode }) {
  return href ? <a className="card-link" href={href} target="_blank" rel="noreferrer noopener">{children}<ExternalLink size={14} aria-hidden="true" /></a> : null;
}

export default function App() {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [flash, setFlash] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<TabKey>('today');
  const [day, setDay] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [viewing, setViewing] = useState<StoredDocument | null>(null);
  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });

  useEffect(() => {
    void (async () => {
      try { setTrip(await loadTrip()); }
      catch (error) { setFatal(friendlyError(error)); }
      finally { setReady(true); }
    })();
  }, []);
  useEffect(() => subscribePwa(setPwa), []);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const dates = useMemo(() => (trip ? tripDates(trip) : []), [trip]);
  useEffect(() => {
    setDay(current => {
      if (!dates.length) return '';
      if (dates.includes(current)) return current;
      return dates.find(date => date >= today()) ?? dates[dates.length - 1];
    });
  }, [dates]);

  async function commit(next: TripData, documents: StoredDocument[] = []) {
    const saved = { ...next, updatedAt: new Date().toISOString() };
    await saveTrip(saved, documents);
    setTrip(saved);
  }
  async function edit(change: (current: TripData) => TripData, documents: StoredDocument[] = []) {
    if (!trip) throw new Error('먼저 여행을 만들거나 불러와 주세요.');
    await commit(change(trip), documents);
  }
  /** List edits run outside a form, so their errors need the shared message bar. */
  async function quickEdit(change: (current: TripData) => TripData) {
    try { await edit(change); } catch (error) { setFlash({ tone: 'bad', text: friendlyError(error) }); }
  }
  async function remove(label: string, change: (current: TripData) => TripData) {
    if (!window.confirm(`${label}\n\n이 항목을 지울까요? 되돌릴 수 없어요.`)) return;
    await quickEdit(change);
  }

  async function openDocument(id: string) {
    try {
      const stored = await getDocument(id);
      if (!stored) throw new Error('이 휴대폰에 저장된 PDF가 없어요. 백업 ZIP을 다시 불러와 주세요.');
      setViewing(stored);
    } catch (error) { setFlash({ tone: 'bad', text: friendlyError(error) }); }
  }
  async function importZip(file: File) {
    setBusy('여행 자료를 읽고 있어요…');
    try {
      const pkg = await parsePackage(file);
      const counts = `일정 ${pkg.trip.itinerary.length}개 · 예산 ${pkg.trip.budgets.length}개 · 예약 ${pkg.trip.reservations.length}개 · 준비물 ${pkg.trip.packing.length}개 · 서류 ${pkg.trip.documents.length}개`;
      const question = trip
        ? `${counts}\n\n이 휴대폰의 지금 여행 자료를 모두 교체할까요? 지금 자료는 되돌릴 수 없어요. 먼저 백업을 저장해 두는 편이 안전해요.`
        : `${counts}\n\n이 자료로 여행수첩을 시작할까요?`;
      if (!window.confirm(question)) return;
      await replacePackage(pkg);
      setTrip(await loadTrip());
      setEditing(null); setTab('today');
      setFlash({ tone: 'good', text: `여행을 불러왔어요. ${counts}` });
    } catch (error) { setFlash({ tone: 'bad', text: friendlyError(error) }); }
    finally { setBusy(''); }
  }
  async function exportZip() {
    setBusy('백업을 만들고 있어요…');
    try {
      const blob = await exportPackage();
      const name = `hawaii-trip-${today('Asia/Seoul')}.zip`;
      const file = new File([blob], name, { type: 'application/zip' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '우리 여행 백업' });
        setFlash({ tone: 'good', text: '백업 ZIP을 공유했어요.' });
      } else {
        downloadBlob(blob, name);
        setFlash({ tone: 'good', text: `${name} 파일을 저장했어요. PC에도 옮겨두면 안심이에요.` });
      }
    } catch (error) {
      // Closing the Android share sheet is a normal cancellation, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFlash({ tone: 'bad', text: friendlyError(error) });
    } finally { setBusy(''); }
  }
  async function startBlank() {
    try { await commit(createBlankTrip()); setEditing({ kind: 'settings' }); }
    catch (error) { setFlash({ tone: 'bad', text: friendlyError(error) }); }
  }

  const countdown = useMemo(() => {
    if (!trip?.startDate) return null;
    const now = today('Asia/Seoul');
    const toStart = dayDifference(trip.startDate, now);
    if (toStart > 0) return { tone: 'wait', text: `출발까지 ${toStart}일` };
    if (trip.endDate && dayDifference(now, trip.endDate) > 0) return { tone: 'mute', text: `다녀온 지 ${dayDifference(now, trip.endDate)}일` };
    return { tone: 'good', text: `여행 ${dayDifference(now, trip.startDate) + 1}일째` };
  }, [trip]);

  const totals = useMemo(() => {
    if (!trip) return null;
    const paid = sumMoney(trip.budgets.flatMap(item => item.payments.map(payment => payment.money)));
    const planned = sumMoney(trip.budgets.map(item => item.plannedAmount));
    return {
      paid, planned,
      unknown: trip.budgets.filter(item => !item.plannedAmount && !item.payments.length).length,
      estimate: estimatedKrw(trip.budgets, trip.settings.exchangeRate),
    };
  }, [trip]);

  if (!ready) return <div className="boot"><Flower className="boot-flower" /><p>여행수첩을 펼치고 있어요…</p></div>;
  if (fatal) return <div className="boot"><p role="alert">{fatal}</p><button className="button primary" onClick={() => location.reload()}>다시 열기</button></div>;

  const events = trip ? sortedEvents(trip.itinerary.filter(event => event.date === day)) : [];
  const reservations = trip ? [...trip.reservations].sort((a, b) =>
    statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
    || (a.deadline || '9999').localeCompare(b.deadline || '9999')
    || (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1)) : [];
  const packed = trip ? trip.packing.filter(item => item.done).length : 0;
  const upcoming = reservations.filter(item => ['unbooked', 'planned'].includes(item.status)).slice(0, 4);
  const todayEvents = trip ? sortedEvents(trip.itinerary.filter(event => event.date === today())) : [];
  const nextEvents = trip && !todayEvents.length
    ? sortedEvents(trip.itinerary.filter(event => event.date === trip.itinerary.map(e => e.date).filter(date => date >= today()).sort()[0]))
    : [];

  function addButton(label: string, onClick: () => void) {
    return <button className="fab" onClick={onClick} aria-label={label}><Plus size={24} aria-hidden="true" /></button>;
  }

  function eventCard(event: ItineraryItem, compact = false) {
    const reservation = trip?.reservations.find(item => item.id === event.reservationId);
    return <article className="card event" key={event.id}>
      <div className="card-head">
        <div className="card-time"><Clock size={15} aria-hidden="true" /> {timeLabel(event)}
          {event.timeZone === 'Asia/Seoul' && <Chip tone="mute">한국시간</Chip>}
        </div>
        <div className="card-tools">
          <Review on={event.needsReview} />
          <button className="icon-button" aria-label={`${event.title} 수정`} onClick={() => setEditing({ kind: 'event', item: event })}><Pencil size={17} /></button>
          {!compact && <button className="icon-button danger" aria-label={`${event.title} 삭제`} onClick={() => void remove(event.title, current => ({ ...current, itinerary: current.itinerary.filter(item => item.id !== event.id) }))}><Trash2 size={17} /></button>}
        </div>
      </div>
      <h3>{event.title}</h3>
      <div className="card-meta">
        {event.region && <span>{event.region}</span>}
        {event.transport && <span>{event.transport}</span>}
        {reservation && <Chip tone={statusTone[reservation.status]}>{reservation.title}</Chip>}
      </div>
      {event.place && <a className="card-link" href={mapUrl(event.place)} target="_blank" rel="noreferrer noopener"><MapPin size={14} aria-hidden="true" />{event.place}</a>}
      <LinkOut href={safeUrl(event.referenceUrl || '')}>참고 링크 열기</LinkOut>
      <CardNotes notes={event.notes} source={event.sourceNote} />
    </article>;
  }

  function reservationCard(item: Reservation) {
    return <article className="card" key={item.id}>
      <div className="card-head">
        <div className="card-time">
          <Chip tone={statusTone[item.status]}>{reservationLabels[item.status]}</Chip>
          {item.priority === 'high' && <Chip tone="warn">먼저 예약</Chip>}
        </div>
        <div className="card-tools">
          <Review on={item.needsReview} />
          <button className="icon-button" aria-label={`${item.title} 수정`} onClick={() => setEditing({ kind: 'reservation', item })}><Pencil size={17} /></button>
          <button className="icon-button danger" aria-label={`${item.title} 삭제`} onClick={() => void remove(item.title, current => ({
            ...current,
            reservations: current.reservations.filter(row => row.id !== item.id),
            itinerary: current.itinerary.map(row => row.reservationId === item.id ? { ...row, reservationId: undefined } : row),
            budgets: current.budgets.map(row => row.reservationId === item.id ? { ...row, reservationId: undefined } : row),
          }))}><Trash2 size={17} /></button>
        </div>
      </div>
      <h3>{item.title}</h3>
      <div className="card-meta">
        {item.date && <span>이용 {dateLabel(item.date)}</span>}
        {item.deadline && <span>확인 {dateLabel(item.deadline)} · {item.deadlineTimeZone === 'Asia/Seoul' ? '한국시간' : '하와이시간'}</span>}
      </div>
      <LinkOut href={safeUrl(item.url)}>예약 사이트 열기</LinkOut>
      {item.documentIds.map(id => {
        const meta = trip?.documents.find(document => document.id === id);
        return <button className="doc-button" key={id} onClick={() => void openDocument(id)}><FileText size={16} aria-hidden="true" />{meta?.name || '예약 서류'}</button>;
      })}
      <CardNotes notes={item.notes} source={item.sourceNote} />
    </article>;
  }

  return <div className="app">
    <header className={`cover ${trip && tab !== 'today' ? 'compact' : ''}`}>
      <div className="cover-top">
        <span className="eyebrow">우리 둘의 여행수첩</span>
        <div className="cover-actions">
          <button className="icon-button" aria-label="보관함과 백업" onClick={() => setEditing({ kind: 'storage' })}><CloudDownload size={21} /></button>
          <button className="icon-button" aria-label="여행 설정" disabled={!trip} onClick={() => setEditing({ kind: 'settings' })}><Settings size={21} /></button>
        </div>
      </div>
      <h1>{trip?.title || '우리 둘의 알로하'}</h1>
      <p className="cover-people">{trip?.people.filter(Boolean).join('  ♥  ') || '두 사람의 이름을 적어보세요'}</p>
      {trip?.startDate && <p className="cover-dates"><Plane size={15} aria-hidden="true" /> {dateLabel(trip.startDate, true)} – {dateLabel(trip.endDate, true)}</p>}
      {countdown && <Chip tone={countdown.tone}>{countdown.text}</Chip>}
      <IslandArtwork />
      <Flower className="cover-flower" />
    </header>

    {pwa.needRefresh && <div className="banner"><RefreshCw size={18} aria-hidden="true" /><p>새 버전이 준비됐어요. 저장한 여행 자료는 그대로 남아요.</p><button className="button small" onClick={() => void updateApp()}>업데이트</button></div>}
    {flash && <p className={`flash ${flash.tone}`} role="status">{flash.text}</p>}
    {busy && <p className="flash busy" role="status">{busy}</p>}

    <main className="page">
      {!trip ? <section className="welcome">
        <Empty text="아직 여행수첩이 비어 있어요." hint="개인 여행 ZIP을 불러오거나, 빈 수첩으로 새로 시작할 수 있어요." />
        <label className={`button primary full ${busy ? 'disabled' : ''}`}><Upload size={19} aria-hidden="true" /> 여행 ZIP 불러오기
          <input type="file" accept=".zip,application/zip" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importZip(file); }} />
        </label>
        <button className="button full" onClick={() => void startBlank()}>빈 수첩으로 시작하기</button>
        <p className="hint">불러온 자료는 이 브라우저 안에만 저장하고 어디로도 보내지 않아요.</p>
      </section> : tab === 'today' ? <section>
        <div className="summary-row">
          <div className="summary"><span>확정 결제</span><strong>{sumLabel(totals!.paid, '아직 없어요')}</strong></div>
          <div className="summary"><span>준비물</span><strong>{trip.packing.length ? `${packed} / ${trip.packing.length}` : '아직 없어요'}</strong></div>
        </div>
        <h2 className="section-title"><CalendarDays size={18} aria-hidden="true" /> {todayEvents.length ? '오늘의 일정' : '다음 일정'}</h2>
        {(todayEvents.length ? todayEvents : nextEvents).length
          ? <>{!todayEvents.length && nextEvents[0] && <p className="hint">{dateLabel(nextEvents[0].date, true)}</p>}{(todayEvents.length ? todayEvents : nextEvents).map(event => eventCard(event, true))}</>
          : <Empty text="적어둔 일정이 아직 없어요." hint="일정 탭에서 첫 번째 하루를 채워보세요." />}
        <h2 className="section-title"><BookMarked size={18} aria-hidden="true" /> 챙길 예약</h2>
        {upcoming.length ? upcoming.map(reservationCard) : <Empty text="예약은 모두 정리됐어요." hint="예약 탭에서 전체 목록을 볼 수 있어요." />}
      </section> : tab === 'plan' ? <section>
        <div className="day-strip">{dates.map(date => <button key={date} className={`day-chip ${date === day ? 'on' : ''}`} onClick={() => setDay(date)}>{dateLabel(date)}</button>)}</div>
        {events.length ? events.map(event => eventCard(event)) : <Empty text="이 날은 아직 비어 있어요." hint="아래 + 버튼으로 일정을 더해보세요." />}
        {addButton('일정 추가', () => setEditing({ kind: 'event', item: blankEvent(day || today(), Math.max(0, ...trip.itinerary.map(event => event.order)) + 10) }))}
      </section> : tab === 'money' ? <section>
        <div className="summary-row">
          <div className="summary"><span>확정 결제</span><strong>{sumLabel(totals!.paid, '아직 없어요')}</strong></div>
          <div className="summary"><span>계획 금액</span><strong>{sumLabel(totals!.planned, '아직 없어요')}</strong></div>
        </div>
        {totals!.estimate !== null && <p className="notice">지출 환산 합계 약 {money({ currency: 'KRW', amount: totals!.estimate })}
          {trip.settings.targetBudgetKrw ? ` · 목표 ${money({ currency: 'KRW', amount: trip.settings.targetBudgetKrw })}의 ${Math.round(totals!.estimate / trip.settings.targetBudgetKrw * 100)}%` : ''}</p>}
        {totals!.estimate === null && <p className="hint">달러 지출을 원화로 합치려면 설정에서 참고 환율을 적어주세요.</p>}
        {totals!.unknown > 0 && <p className="hint"><Info size={15} aria-hidden="true" /> 금액이 비어 있는 항목 {totals!.unknown}개는 합계에 들어가지 않아요. 0원이 아니라 미정이에요.</p>}
        {trip.budgets.length ? groupBy(trip.budgets, item => item.category).map(([category, items]) => <div className="group" key={category}>
          <h2 className="section-title">{category}<span className="group-sum">{sumLabel(sumMoney(items.map(item => item.plannedAmount)), '미정')}</span></h2>
          {items.map(item => <article className="card" key={item.id}>
            <div className="card-head">
              <div className="card-time"><Chip tone={item.paymentStatus === 'paid' ? 'good' : item.paymentStatus === 'unknown' ? 'warn' : 'wait'}>{paymentLabels[item.paymentStatus]}</Chip></div>
              <div className="card-tools">
                <button className="icon-button" aria-label={`${item.title} 수정`} onClick={() => setEditing({ kind: 'budget', item })}><Pencil size={17} /></button>
                <button className="icon-button danger" aria-label={`${item.title} 삭제`} onClick={() => void remove(item.title, current => ({ ...current, budgets: current.budgets.filter(row => row.id !== item.id) }))}><Trash2 size={17} /></button>
              </div>
            </div>
            <h3>{item.title}</h3>
            <div className="amount-row">
              <span>계획 <strong>{money(item.plannedAmount)}</strong></span>
              <span>지출 <strong>{sumLabel(sumMoney(item.payments.map(payment => payment.money)), '없음')}</strong></span>
            </div>
            <div className="card-meta">{item.basis && <span>{item.basis}</span>}{item.referenceAmount && <Chip tone="mute">참고 {money(item.referenceAmount)} · 합산 제외</Chip>}</div>
            <CardNotes notes={item.notes} source={item.sourceNote} />
          </article>)}
        </div>) : <Empty text="예산 항목이 아직 없어요." hint="예상 금액과 실제 지출을 따로 적을 수 있어요." />}
        {addButton('예산 추가', () => setEditing({ kind: 'budget', item: blankBudget() }))}
      </section> : tab === 'book' ? <section>
        {reservations.length ? reservations.map(reservationCard) : <Empty text="예약이 아직 없어요." hint="확인서 PDF도 함께 보관할 수 있어요." />}
        {trip.documents.length > 0 && <div className="group">
          <h2 className="section-title"><FileText size={18} aria-hidden="true" /> 보관한 서류 {trip.documents.length}개</h2>
          {trip.documents.map(document => <div className="doc-row" key={document.id}>
            <button className="doc-button" onClick={() => void openDocument(document.id)}><FileText size={16} aria-hidden="true" />{document.name}</button>
            <button className="icon-button danger" aria-label={`${document.name} 삭제`} onClick={() => void remove(document.name, current => ({
              ...current,
              documents: current.documents.filter(row => row.id !== document.id),
              reservations: current.reservations.map(row => ({ ...row, documentIds: row.documentIds.filter(id => id !== document.id) })),
            }))}><Trash2 size={17} /></button>
          </div>)}
        </div>}
        {addButton('예약 추가', () => setEditing({ kind: 'reservation', item: blankReservation() }))}
      </section> : <section>
        <div className="progress" role="img" aria-label={`준비물 ${trip.packing.length ? Math.round(packed / trip.packing.length * 100) : 0}퍼센트 완료`}>
          <div className="progress-bar"><span style={{ width: `${trip.packing.length ? packed / trip.packing.length * 100 : 0}%` }} /></div>
          <p>{trip.packing.length ? `${packed} / ${trip.packing.length}개 준비 완료` : '준비물을 적어보세요'}</p>
        </div>
        {groupBy(trip.packing, item => item.category).map(([category, items]) => <div className="group" key={category}>
          <h2 className="section-title">{category}<span className="group-sum">{items.filter(item => item.done).length} / {items.length}</span></h2>
          {items.map(item => <div className={`pack-row ${item.done ? 'done' : ''}`} key={item.id}>
            <label className="pack-check">
              <input type="checkbox" checked={item.done} onChange={() => void quickEdit(current => ({ ...current, packing: current.packing.map(row => row.id === item.id ? { ...row, done: !row.done } : row) }))} />
              <span className="pack-mark" aria-hidden="true"><CircleCheck size={18} /></span>
              <span className="pack-text"><strong>{item.title}</strong>
                <small>{[item.quantity, item.owner, item.bag].filter(Boolean).join(' · ')}</small>
                {item.notes && <small className="pack-note">{item.notes}</small>}
              </span>
            </label>
            <button className="icon-button" aria-label={`${item.title} 수정`} onClick={() => setEditing({ kind: 'packing', item })}><Pencil size={17} /></button>
            <button className="icon-button danger" aria-label={`${item.title} 삭제`} onClick={() => void remove(item.title, current => ({ ...current, packing: current.packing.filter(row => row.id !== item.id) }))}><Trash2 size={17} /></button>
          </div>)}
        </div>)}
        {!trip.packing.length && <Empty text="준비물이 아직 없어요." hint="작은 것까지 적어두면 마음이 가벼워요." />}
        {addButton('준비물 추가', () => setEditing({ kind: 'packing', item: blankPacking() }))}
      </section>}
    </main>

    {trip && <nav className="tabbar" aria-label="여행수첩 메뉴">
      {tabs.map(({ key, label, Icon }) => <button key={key} className={`tab ${tab === key ? 'on' : ''}`} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
        <Icon size={21} aria-hidden="true" /><span>{label}</span>
      </button>)}
    </nav>}

    {editing?.kind === 'event' && <EventEditor item={editing.item} trip={trip!} onClose={() => setEditing(null)}
      onSave={async item => { await edit(current => ({ ...current, itinerary: upsert(current.itinerary, item) })); setEditing(null); }} />}
    {editing?.kind === 'budget' && <BudgetEditor item={editing.item} onClose={() => setEditing(null)}
      onSave={async item => { await edit(current => ({ ...current, budgets: upsert(current.budgets, item) })); setEditing(null); }} />}
    {editing?.kind === 'reservation' && <ReservationEditor item={editing.item} trip={trip!} onClose={() => setEditing(null)}
      onSave={async (item, documents) => {
        await edit(current => ({
          ...current,
          documents: [...current.documents, ...documents.filter(document => !current.documents.some(meta => meta.id === document.id)).map(document => ({ id: document.id, name: document.name, size: document.data.size }))],
          reservations: upsert(current.reservations, item),
        }), documents);
        setEditing(null);
      }} />}
    {editing?.kind === 'packing' && <PackingEditor item={editing.item} onClose={() => setEditing(null)}
      onSave={async item => { await edit(current => ({ ...current, packing: upsert(current.packing, item) })); setEditing(null); }} />}
    {editing?.kind === 'settings' && trip && <SettingsEditor trip={trip} onClose={() => setEditing(null)}
      onSave={async data => { await edit(current => ({ ...current, ...data })); setEditing(null); }} />}

    {editing?.kind === 'storage' && <Sheet title="보관함" subtitle="백업을 만들고, 다른 휴대폰으로 옮겨요." onClose={() => setEditing(null)}>
      <div className="form-body">
        <div className={`offline-state ${pwa.offlineReady ? 'good' : 'wait'}`}>
          {pwa.offlineReady ? <CircleCheck size={20} aria-hidden="true" /> : <WifiOff size={20} aria-hidden="true" />}
          <div><strong>{pwa.offlineReady ? '오프라인 준비 완료' : '오프라인 준비 중'}</strong>
            <p>{pwa.error || (pwa.offlineReady ? '비행기 모드에서도 일정과 PDF를 볼 수 있어요.' : '인터넷에 연결한 채로 잠시 기다린 뒤 앱을 다시 열어주세요.')}</p></div>
        </div>
        {pwa.needRefresh && <button className="button full" onClick={() => void updateApp()}><RefreshCw size={18} aria-hidden="true" /> 새 버전으로 업데이트</button>}
        <button className="button primary full" disabled={!trip || !!busy} onClick={() => void exportZip()}><Download size={19} aria-hidden="true" /> 백업 ZIP 내보내기</button>
        <label className={`button full ${busy ? 'disabled' : ''}`}><Upload size={19} aria-hidden="true" /> 여행 ZIP 불러오기
          <input type="file" accept=".zip,application/zip" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importZip(file); }} />
        </label>
        {busy && <p className="hint" role="status">{busy}</p>}
        <p className="notice"><Info size={15} aria-hidden="true" /> 불러오기는 이 휴대폰의 여행 자료 전체를 선택한 백업으로 바꿔요. 두 휴대폰의 수정 내용을 자동으로 합치지는 않아요.</p>
        <p className="hint">여행 자료는 이 브라우저 안에만 저장돼요. 브라우저 데이터 삭제나 저장공간 정리로 사라질 수 있으니, 수정한 날에는 백업을 남겨주세요.</p>
        {trip && <p className="hint">마지막 저장 {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(trip.updatedAt))}</p>}
      </div>
    </Sheet>}

    {viewing && <PdfViewer document={viewing} onClose={() => setViewing(null)} />}
  </div>;
}
