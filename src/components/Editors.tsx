import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, FilePlus2, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import type { BudgetItem, Currency, ItineraryItem, PackingItem, Payment, Reservation, StoredDocument, TripData, Zone } from '../types';
import { reservationLabels } from '../types';
import { friendlyError, money, today, uid } from '../utils';
import { prepareDocument } from '../storage';
import { Sheet } from './Sheet';

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}
function TextInput({ value, onChange, required = false, placeholder = '' }: { value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  return <input value={value} onChange={e => onChange(e.target.value)} required={required} maxLength={500} placeholder={placeholder}/>;
}
function Notes({ value, onChange, label = '메모' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <Field label={label}><textarea rows={3} value={value} maxLength={12000} onChange={e => onChange(e.target.value)} placeholder="기억해 둘 내용을 적어보세요"/></Field>;
}
function Source({ value }: { value?: string }) {
  return value ? <details className="source-note"><summary>원래 자료와 변경 근거</summary><p>{value}</p></details> : null;
}
function Footer({ pending, error }: { pending: boolean; error: string }) {
  return <footer className="form-footer">{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary full" disabled={pending} type="submit">{pending ? <LoaderCircle className="spin" size={19}/> : <Check size={19}/>} {pending ? '저장하고 있어요' : '저장하기'}</button></footer>;
}
function useSubmit(save: () => Promise<void>) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return; setPending(true); setError('');
    try { await save(); } catch (err) { setError(friendlyError(err)); } finally { setPending(false); }
  }
  return { submit, pending, error };
}

export function EventEditor({ item, trip, onSave, onClose }: {
  item: ItineraryItem; trip: TripData; onSave: (item: ItineraryItem) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const set = <K extends keyof ItineraryItem>(key: K, value: ItineraryItem[K]) => setDraft(d => ({ ...d, [key]: value }));
  const form = useSubmit(() => onSave({ ...draft, title: draft.title.trim() }));
  return <Sheet title={item.title ? '여행 노트 수정' : '새로운 일정'} subtitle="조금 바뀌어도 괜찮아요. 우리 속도로 여행해요." onClose={onClose}>
    <form onSubmit={form.submit}><div className="form-body">
      <Field label="어떤 일정인가요?"><TextInput value={draft.title} onChange={v => set('title', v)} required placeholder="예: 바다를 보며 아침 먹기"/></Field>
      <div className="field-row"><Field label="날짜"><input type="date" value={draft.date} required onChange={e => set('date', e.target.value)}/></Field><Field label="시간 기준"><select value={draft.timeZone} onChange={e => set('timeZone', e.target.value as Zone)}><option value="Pacific/Honolulu">하와이 시간</option><option value="Asia/Seoul">한국 시간</option></select></Field></div>
      <div className="field-row"><Field label="시작 시간 · 비우면 미정"><input type="time" value={draft.startTime || ''} onChange={e => set('startTime', e.target.value || null)}/></Field><Field label="종료 시간"><input type="time" value={draft.endTime || ''} onChange={e => set('endTime', e.target.value || null)}/></Field></div>
      <Field label="섬 / 지역"><TextInput value={draft.region} onChange={v => set('region', v)} placeholder="예: 마우이 키헤이"/></Field>
      <Field label="장소"><TextInput value={draft.place} onChange={v => set('place', v)} placeholder="지도에서 찾을 장소 이름이나 주소"/></Field>
      <Field label="이동수단"><TextInput value={draft.transport} onChange={v => set('transport', v)} placeholder="도보, 렌터카, 셔틀…"/></Field>
      <Field label="연결된 예약"><select value={draft.reservationId || ''} onChange={e => set('reservationId', e.target.value || undefined)}><option value="">연결 안 함</option>{trip.reservations.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
      <Field label="참고 링크"><input type="url" value={draft.referenceUrl || ''} onChange={e => set('referenceUrl', e.target.value || undefined)} placeholder="https://"/></Field>
      <Notes value={draft.notes} onChange={v => set('notes', v)}/>
      <label className="check-field"><input type="checkbox" checked={!!draft.needsReview} onChange={e => set('needsReview', e.target.checked)}/> 다시 확인할 일정이에요</label>
      <Source value={draft.sourceNote}/>
    </div><Footer {...form}/></form>
  </Sheet>;
}

export function BudgetEditor({ item, onSave, onClose }: {
  item: BudgetItem; onSave: (item: BudgetItem) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [planCurrency, setPlanCurrency] = useState<Currency>(item.plannedAmount?.currency || 'KRW');
  const [planValue, setPlanValue] = useState(item.plannedAmount ? String(item.plannedAmount.amount / (item.plannedAmount.currency === 'USD' ? 100 : 1)) : '');
  const set = <K extends keyof BudgetItem>(key: K, value: BudgetItem[K]) => setDraft(d => ({ ...d, [key]: value }));
  const updatePayment = (id: string, update: Partial<Payment>) => setDraft(d => ({ ...d, payments: d.payments.map(p => p.id === id ? { ...p, ...update } : p) }));
  const form = useSubmit(() => onSave({ ...draft, title: draft.title.trim(), plannedAmount: planValue === '' ? null : { currency: planCurrency, amount: Math.round(Number(planValue) * (planCurrency === 'USD' ? 100 : 1)) } }));
  return <Sheet title={item.title ? '예산과 지출 수정' : '새로운 예산 항목'} subtitle="예상한 돈과 실제 쓴 돈을 따로 기록해요." onClose={onClose}>
    <form onSubmit={form.submit}><div className="form-body">
      <Field label="항목 이름"><TextInput value={draft.title} onChange={v => set('title', v)} required placeholder="예: 바다 앞 저녁식사"/></Field>
      <div className="field-row"><Field label="분류"><TextInput value={draft.category} onChange={v => set('category', v)} required/></Field><Field label="수량 / 기준"><TextInput value={draft.basis} onChange={v => set('basis', v)} placeholder="예: 2인"/></Field></div>
      <div className="field-row currency-row"><Field label="예상 금액 · 비우면 미입력"><input type="number" inputMode="decimal" min="0" step={planCurrency === 'USD' ? '.01' : '1'} value={planValue} onChange={e => setPlanValue(e.target.value)} placeholder="아직 정하지 않았어요"/></Field><Field label="통화"><select value={planCurrency} onChange={e => setPlanCurrency(e.target.value as Currency)}><option value="KRW">원 KRW</option><option value="USD">달러 USD</option></select></Field></div>
      <Field label="결제 상태"><select value={draft.paymentStatus} onChange={e => set('paymentStatus', e.target.value as BudgetItem['paymentStatus'])}><option value="unpaid">아직 결제 전</option><option value="partial">일부 결제</option><option value="paid">결제완료</option><option value="unknown">결제 확인 필요</option></select></Field>
      <div className="form-section-head"><h3>실제 지출</h3><button type="button" className="text-button" onClick={() => set('payments', [...draft.payments, { id: uid(), money: { currency: 'KRW', amount: 0 }, date: today(), note: '' }])}><Plus size={17}/> 지출 추가</button></div>
      {!draft.payments.length && <p className="hint">결제한 금액을 추가하면 실제 지출에 반영돼요.</p>}
      {draft.payments.map((payment, index) => <div className="payment-edit" key={payment.id}><div className="form-section-head"><span>지출 {index + 1}</span><button type="button" className="icon-button danger" aria-label={`지출 ${index + 1} 삭제`} onClick={() => set('payments', draft.payments.filter(p => p.id !== payment.id))}><Trash2 size={18}/></button></div>
        <div className="field-row currency-row"><Field label="결제 금액"><input aria-label={`지출 ${index + 1} 결제 금액`} type="number" min="0" inputMode="decimal" required step={payment.money.currency === 'USD' ? '.01' : '1'} value={payment.money.amount / (payment.money.currency === 'USD' ? 100 : 1)} onChange={e => updatePayment(payment.id, { money: { ...payment.money, amount: Math.round(Number(e.target.value) * (payment.money.currency === 'USD' ? 100 : 1)) } })}/></Field><Field label="결제 통화"><select value={payment.money.currency} onChange={e => updatePayment(payment.id, { money: { currency: e.target.value as Currency, amount: 0 }, krwCharged: undefined })}><option value="KRW">원 KRW</option><option value="USD">달러 USD</option></select></Field></div>
        {payment.money.currency === 'USD' && <Field label="카드에 청구된 원화 · 선택"><input type="number" min="0" step="1" inputMode="numeric" value={payment.krwCharged ?? ''} onChange={e => updatePayment(payment.id, { krwCharged: e.target.value === '' ? undefined : Number(e.target.value) })}/></Field>}
        <Field label="결제 날짜 · 선택"><input type="date" value={payment.date} onChange={e => updatePayment(payment.id, { date: e.target.value })}/></Field>
        <Field label="지출 메모"><TextInput value={payment.note} onChange={v => updatePayment(payment.id, { note: v })}/></Field>
      </div>)}
      {draft.referenceAmount && <p className="notice">원문 참고 금액 {money(draft.referenceAmount)} · 실제 지출에 더하지 않아요.</p>}
      <Notes value={draft.notes} onChange={v => set('notes', v)}/><Source value={draft.sourceNote}/>
    </div><Footer {...form}/></form>
  </Sheet>;
}

export function ReservationEditor({ item, trip, onSave, onClose }: {
  item: Reservation; trip: TripData; onSave: (item: Reservation, docs: StoredDocument[]) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(item), [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState('');
  const set = <K extends keyof Reservation>(key: K, value: Reservation[K]) => setDraft(d => ({ ...d, [key]: value }));
  const form = useSubmit(() => onSave({ ...draft, title: draft.title.trim() }, documents.filter(d => draft.documentIds.includes(d.id))));
  async function addFiles(files: FileList | null) {
    if (!files?.length) return; setUploading(true); setUploadError('');
    try {
      const added: StoredDocument[] = [];
      for (const file of files) added.push(await prepareDocument(file));
      setDocuments(current => [...current, ...added]); setDraft(d => ({ ...d, documentIds: [...d.documentIds, ...added.map(doc => doc.id)] }));
    } catch (error) { setUploadError(friendlyError(error)); } finally { setUploading(false); }
  }
  return <Sheet title={item.title ? '예약 노트 수정' : '새로운 예약'} subtitle="예약 확인서도 이 휴대폰에 함께 보관해요." onClose={onClose}>
    <form onSubmit={form.submit}><div className="form-body">
      <Field label="예약 이름"><TextInput value={draft.title} onChange={v => set('title', v)} required/></Field>
      <div className="field-row"><Field label="예약 상태"><select value={draft.status} onChange={e => set('status', e.target.value as Reservation['status'])}>{Object.entries(reservationLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="우선순위"><select value={draft.priority} onChange={e => set('priority', e.target.value as Reservation['priority'])}><option value="normal">차근차근</option><option value="high">먼저 예약해요</option></select></Field></div>
      <div className="field-row"><Field label="이용 날짜"><input type="date" value={draft.date} onChange={e => set('date', e.target.value)}/></Field><Field label="예약 / 확인할 날짜"><input type="date" value={draft.deadline} onChange={e => set('deadline', e.target.value)}/></Field></div>
      <Field label="확인 날짜의 시간 기준"><select value={draft.deadlineTimeZone} onChange={e => set('deadlineTimeZone', e.target.value as Zone)}><option value="Pacific/Honolulu">하와이 시간</option><option value="Asia/Seoul">한국 시간</option></select></Field>
      <Field label="예약 사이트"><input type="url" value={draft.url} onChange={e => set('url', e.target.value)} placeholder="https://"/></Field>
      <Notes value={draft.notes} onChange={v => set('notes', v)} label="확인할 내용 / 메모"/>
      <label className="check-field"><input type="checkbox" checked={!!draft.needsReview} onChange={e => set('needsReview', e.target.checked)}/> 다시 확인할 내용이 있어요</label>
      <div className="form-section-head"><h3>예약 서류</h3><label className={`text-button upload-label ${uploading ? 'disabled' : ''}`}><FilePlus2 size={18}/>{uploading ? '읽는 중' : 'PDF 추가'}<input type="file" accept="application/pdf,.pdf" multiple disabled={uploading} onChange={e => { void addFiles(e.target.files); e.target.value = ''; }}/></label></div>
      {draft.documentIds.map(id => <div className="attachment-edit" key={id}><span>{trip.documents.find(d => d.id === id)?.name || documents.find(d => d.id === id)?.name || '예약 서류'}</span><button type="button" className="icon-button" aria-label="서류 연결 해제" onClick={() => set('documentIds', draft.documentIds.filter(doc => doc !== id))}><X size={17}/></button></div>)}
      {!draft.documentIds.length && <p className="hint">PDF를 첨부하면 인터넷 없이도 볼 수 있어요.</p>}
      {uploadError && <p className="form-error" role="alert">{uploadError}</p>}<Source value={draft.sourceNote}/>
    </div><Footer pending={form.pending || uploading} error={form.error}/></form>
  </Sheet>;
}

export function PackingEditor({ item, onSave, onClose }: { item: PackingItem; onSave: (item: PackingItem) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(item);
  const set = <K extends keyof PackingItem>(key: K, value: PackingItem[K]) => setDraft(d => ({ ...d, [key]: value }));
  const form = useSubmit(() => onSave({ ...draft, title: draft.title.trim() }));
  return <Sheet title={item.title ? '준비물 수정' : '준비물 추가'} subtitle="작은 것까지 챙겨서, 가벼운 마음으로 떠나요." onClose={onClose}>
    <form onSubmit={form.submit}><div className="form-body">
      <Field label="준비물 이름"><TextInput value={draft.title} onChange={v => set('title', v)} required/></Field>
      <div className="field-row"><Field label="분류"><TextInput value={draft.category} onChange={v => set('category', v)} required/></Field><Field label="수량"><TextInput value={draft.quantity} onChange={v => set('quantity', v)}/></Field></div>
      <div className="field-row"><Field label="챙길 사람"><TextInput value={draft.owner} onChange={v => set('owner', v)} placeholder="공동 / 각자 / 이름"/></Field><Field label="가방 위치"><TextInput value={draft.bag} onChange={v => set('bag', v)} placeholder="예: 기내용"/></Field></div>
      <Notes value={draft.notes} onChange={v => set('notes', v)}/>
      <label className="check-field"><input type="checkbox" checked={draft.done} onChange={e => set('done', e.target.checked)}/> 준비 완료!</label>
    </div><Footer {...form}/></form>
  </Sheet>;
}

export function SettingsEditor({ trip, onSave, onClose }: { trip: TripData; onSave: (data: Pick<TripData, 'title' | 'people' | 'startDate' | 'endDate' | 'settings'>) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(trip.title), [people, setPeople] = useState([trip.people[0] || '', trip.people[1] || '']);
  const [startDate, setStart] = useState(trip.startDate), [endDate, setEnd] = useState(trip.endDate);
  const [budget, setBudget] = useState(String(trip.settings.targetBudgetKrw ?? '')), [rate, setRate] = useState(String(trip.settings.exchangeRate ?? ''));
  const form = useSubmit(async () => {
    if ((startDate && !endDate) || (!startDate && endDate)) throw new Error('출발일과 한국 도착일을 함께 입력해 주세요.');
    if (startDate && endDate < startDate) throw new Error('도착일은 출발일보다 빠를 수 없어요.');
    await onSave({ title: title.trim(), people, startDate, endDate, settings: { targetBudgetKrw: budget === '' ? null : Number(budget), exchangeRate: rate === '' ? null : Number(rate) } });
  });
  return <Sheet title="우리 여행 설정" subtitle="이 다이어리를 두 분의 것으로 꾸며보세요." onClose={onClose}>
    <form onSubmit={form.submit}><div className="form-body">
      <Field label="표지 제목"><TextInput value={title} onChange={setTitle} required/></Field>
      <div className="field-row"><Field label="첫 번째 이름"><TextInput value={people[0]} onChange={v => setPeople([v, people[1]])}/></Field><Field label="두 번째 이름"><TextInput value={people[1]} onChange={v => setPeople([people[0], v])}/></Field></div>
      <div className="field-row"><Field label="한국 출발일"><input type="date" value={startDate} onChange={e => setStart(e.target.value)}/></Field><Field label="한국 도착일"><input type="date" min={startDate || undefined} value={endDate} onChange={e => setEnd(e.target.value)}/></Field></div>
      <Field label="전체 목표 예산 · 원"><input type="number" inputMode="numeric" min="0" step="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="비워두어도 괜찮아요"/></Field>
      <Field label="참고 환율 · 1달러당 원"><input type="number" inputMode="decimal" min=".01" step=".01" value={rate} onChange={e => setRate(e.target.value)} placeholder="직접 입력하는 참고 환율"/></Field>
      <p className="hint">실시간 환율이 아니에요. 달러 지출에 카드 청구 원화가 있으면 그 금액을 먼저 사용해요.</p>
    </div><Footer {...form}/></form>
  </Sheet>;
}
