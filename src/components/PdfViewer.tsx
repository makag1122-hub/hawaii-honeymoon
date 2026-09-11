import { useEffect, useRef, useState } from 'react';
import { Download, Minus, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { StoredDocument } from '../types';

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({ document: storedDocument, onClose }: { document: StoredDocument; onClose: () => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(320);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []);
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); window.document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [onClose]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(240, element.clientWidth - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let task: PDFDocumentLoadingTask | undefined;
    setPdf(null); setError(''); setLoading(true); setPageNumber(1); setZoom(1);
    void (async () => {
      try {
        const data = new Uint8Array(await storedDocument.data.arrayBuffer());
        if (disposed) return;
        const base = `${import.meta.env.BASE_URL}pdf-assets/`;
        task = getDocument({ data, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/` });
        task.onPassword = () => { if (!disposed) { setError('암호가 필요한 PDF입니다. 원본을 저장해 PDF 앱에서 열어 주세요.'); setLoading(false); } };
        const loaded = await task.promise;
        // pdfjs 6 drops PDFDocumentProxy.destroy; the cleanup below already
        // destroys the loading task, which tears down this document with it.
        if (disposed) return;
        setPdf(loaded);
      } catch {
        if (!disposed) { setError('PDF를 표시하지 못했어요. 원본 저장을 눌러 다른 PDF 앱에서 열 수 있습니다.'); setLoading(false); }
      }
    })();
    return () => { disposed = true; if (task) void task.destroy().catch(() => undefined); };
  }, [storedDocument]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let disposed = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setLoading(true); setError('');
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (disposed || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / original.width * zoom });
        const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        render = page.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
        if (!disposed) setLoading(false);
        page.cleanup();
      } catch (reason) {
        if (!disposed && !(reason instanceof Error && reason.name === 'RenderingCancelledException')) { setError('이 페이지를 표시하지 못했어요. 원본 파일을 저장해 확인해 주세요.'); setLoading(false); }
      }
    })();
    return () => { disposed = true; render?.cancel(); };
  }, [pdf, pageNumber, zoom, width]);

  function download() {
    const url = URL.createObjectURL(storedDocument.data);
    const anchor = window.document.createElement('a');
    anchor.href = url; anchor.download = storedDocument.name;
    window.document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <div className="pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-title" ref={dialogRef}>
    <header className="pdf-header">
      <div><span className="eyebrow">우리 여행 서류</span><h2 id="pdf-title">{storedDocument.name}</h2></div>
      <div className="pdf-actions">
        <button type="button" onClick={download} aria-label="PDF 원본 저장" title="원본 저장"><Download size={20} /><span>원본 저장</span></button>
        <button type="button" onClick={onClose} aria-label="PDF 닫기" ref={closeRef}><X size={22} /></button>
      </div>
    </header>
    <div className="pdf-toolbar">
      <button type="button" aria-label="이전 페이지" disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}><ChevronLeft size={20} /></button>
      <span className="pdf-page-label" aria-live="polite">{pdf ? `${pageNumber} / ${pdf.numPages}` : 'PDF'}</span>
      <button type="button" aria-label="다음 페이지" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber(value => value + 1)}><ChevronRight size={20} /></button>
      <button type="button" aria-label="축소" disabled={!pdf || zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}><Minus size={18} /></button>
      <button type="button" disabled={!pdf} onClick={() => setZoom(1)} aria-label="화면 너비에 맞추기">{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label="확대" disabled={!pdf || zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><Plus size={18} /></button>
    </div>
    <div className="pdf-stage" ref={stageRef} aria-busy={loading}>
      {loading && <p className="pdf-message" role="status">문서를 펼치고 있어요…</p>}
      {error && <p className="pdf-error" role="alert">{error}</p>}
      <canvas className="pdf-canvas" ref={canvasRef} aria-label={`${storedDocument.name}, ${pageNumber}페이지`} style={{ visibility: error || !pdf ? 'hidden' : 'visible' }} />
    </div>
  </div>;
}

export default PdfViewer;
