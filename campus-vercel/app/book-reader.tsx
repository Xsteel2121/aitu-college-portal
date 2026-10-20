"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type Book = { id: string; title: string; grade: number; language: string; part: string; url: string; pdf: string | null; download: string | null };

export default function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1), [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1), [width, setWidth] = useState(0);
  const [progress, setProgress] = useState(0), [rendering, setRendering] = useState(true);
  const [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false), [height, setHeight] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null), paperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const ownsNativeFullscreen = useRef(false);
  const availableHeight = expanded ? height : 0;

  async function closeFullscreen() {
    const viewer = viewerRef.current, dom = viewer?.ownerDocument;
    if (viewer && dom?.fullscreenElement === viewer) {
      try { await dom.exitFullscreen(); } catch { return; }
    }
    setExpanded(false);
  }

  function openFullscreen() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setExpanded(true);
    // Keep the viewport-sized reader when native fullscreen is unavailable.
    if (window.matchMedia("(min-width: 701px)").matches && viewer.ownerDocument.fullscreenEnabled && viewer.requestFullscreen) {
      void viewer.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const dom = viewer.ownerDocument;
    function changed() {
      if (dom.fullscreenElement === viewer) { ownsNativeFullscreen.current = true; setExpanded(true); }
      else if (ownsNativeFullscreen.current) { ownsNativeFullscreen.current = false; setExpanded(false); }
    }
    dom.addEventListener("fullscreenchange", changed);
    return () => {
      dom.removeEventListener("fullscreenchange", changed);
      if (dom.fullscreenElement === viewer) void dom.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!expanded || !viewer) return;
    const dom = viewer.ownerDocument;
    const previousFocus = dom.activeElement instanceof HTMLElement ? dom.activeElement : null;
    const previousOverflow = dom.body.style.overflow;
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    // Hide the surrounding site from keyboard and assistive navigation.
    let node: HTMLElement = viewer;
    while (node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
        }
      }
      if (node.parentElement === dom.body) break;
      node = node.parentElement;
    }
    dom.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dom.fullscreenElement === viewer) void dom.exitFullscreen().then(() => setExpanded(false)).catch(() => {});
        else { event.preventDefault(); setExpanded(false); }
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(viewer!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]"))
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && dom.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && dom.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    dom.addEventListener("keydown", keydown);
    return () => {
      dom.removeEventListener("keydown", keydown);
      dom.body.style.overflow = previousOverflow;
      siblings.forEach(({ element, inert }) => { element.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [expanded]);

  useEffect(() => {
    const element = paperRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { setWidth(element.clientWidth); setHeight(element.clientHeight); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loading: PDFDocumentLoadingTask | undefined;
    setDocument(null); setError(""); setProgress(0); setRendering(true); setPage(1);
    async function load() {
      if (!book.pdf) throw new Error("PDF unavailable");
      const pdfjs = await import("pdfjs-dist");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
      loading = pdfjs.getDocument({ url: book.pdf, withCredentials: false,
        disableAutoFetch: true, disableStream: true, cMapUrl: "/pdf/cmaps/", cMapPacked: true,
        standardFontDataUrl: "/pdf/standard_fonts/", wasmUrl: "/pdf/wasm/" });
      loading.onProgress = ({ loaded, total }: { loaded: number; total: number }) => { if (active && total) setProgress(Math.min(99, Math.round(loaded / total * 100))); };
      const pdf = await loading.promise;
      if (active) { setDocument(pdf); setProgress(100); }
    }
    void load().catch(() => { if (active) { setError("Не удалось загрузить PDF. Попробуйте ещё раз или откройте книгу на сайте источника."); setRendering(false); } });
    return () => { active = false; if (loading) void loading.destroy().catch(() => {}); };
  }, [book.pdf, retry]);

  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => {
    if (!document || !width) return;
    let active = true;
    let task: RenderTask | undefined;
    setRendering(true);
    async function render() {
      const pdfPage = await document!.getPage(page);
      const canvas = canvasRef.current;
      if (!active || !canvas) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const widthScale = Math.max(160, width - 32) / original.width;
      const fitScale = availableHeight > 32 ? Math.min(widthScale, (availableHeight - 32) / original.height) : widthScale;
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * resolution);
      canvas.height = Math.ceil(viewport.height * resolution);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas, viewport, transform: resolution === 1 ? undefined : [resolution, 0, 0, resolution, 0, 0] });
      await task.promise;
      if (active) setRendering(false);
    }
    void render().catch(error => { if (active && error?.name !== "RenderingCancelledException") { setError("Эту страницу не удалось отобразить. Попробуйте открыть книгу снова."); setRendering(false); } });
    return () => { active = false; task?.cancel(); };
  }, [document, page, zoom, width, availableHeight]);

  function jump(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(pageInput);
    if (document && Number.isInteger(value) && value >= 1 && value <= document.numPages) setPage(value);
  }

  return <section className="book-reader" aria-label="Чтение учебника">
    <button className="reader-back" onClick={onBack}><ArrowLeft size={18}/>Все книги</button>
    <div className="reader-heading"><span className="eyebrow">{book.grade} КЛАСС · {book.language}</span><h1>{book.title}</h1>{book.part && <p>{book.part}</p>}
      <div className="reader-links">{book.pdf && <a href={book.download || book.pdf} target="_blank" rel="noopener noreferrer"><Download size={15}/>Скачать PDF</a>}<a href={book.url} target="_blank" rel="noopener noreferrer">Источник: okulyk.kz<ExternalLink size={14}/></a></div>
    </div>
    <div ref={viewerRef} className={`reader-viewer${expanded ? " expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? `Полноэкранное чтение: ${book.title}` : undefined}>
    <div className="reader-fullscreen-head" hidden={!expanded}><div><span>AITU College</span><h2>{book.title}</h2></div><button ref={closeRef} className="reader-fullscreen-close" onClick={() => void closeFullscreen()}><Minimize2 size={18}/>Свернуть</button></div>
    <div className="reader-toolbar">
      <div className="reader-pager"><button className="reader-icon" aria-label="Предыдущая страница" disabled={!document || page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft/></button>
        <form onSubmit={jump}><label htmlFor="pdf-page">Страница</label><input id="pdf-page" type="number" inputMode="numeric" min={1} max={document?.numPages || 1} value={pageInput} disabled={!document} onChange={event => setPageInput(event.target.value)} aria-label="Номер страницы"/><span>из {document?.numPages || "…"}</span><button type="submit" className="reader-jump" disabled={!document}>Перейти</button></form>
        <button className="reader-icon" aria-label="Следующая страница" disabled={!document || page >= document.numPages} onClick={() => setPage(value => value + 1)}><ChevronRight/></button>
      </div>
      <div className="reader-zoom"><button className="reader-icon" aria-label="Уменьшить страницу" disabled={!document || zoom <= .75} onClick={() => setZoom(value => Math.max(.75, value - .25))}><ZoomOut/></button><span>{Math.round(zoom * 100)}%</span><button className="reader-icon" aria-label="Увеличить страницу" disabled={!document || zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}><ZoomIn/></button><button className="reader-fit" onClick={() => setZoom(1)}>{expanded ? "На экран" : "По ширине"}</button></div>
      {!expanded && <button className="reader-expand-button" onClick={openFullscreen} aria-haspopup="dialog"><Maximize2 size={17}/>На весь экран</button>}
    </div>
    {error && <div className="reader-error" role="alert"><p>{error}</p><button className="today-button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
    <div className="reader-paper" ref={paperRef} aria-busy={!error && (!document || rendering)}>
      {!error && (!document || rendering) && <p className="reader-loading" role="status">{document ? "Открываем страницу…" : `Загружаем книгу${progress ? ` · ${progress}%` : "…"}`}</p>}
      <canvas ref={canvasRef} className={rendering || !document ? "pdf-canvas pending" : "pdf-canvas"} role="img" aria-label={`Страница ${page} учебника ${book.title}`}/>
    </div>
    </div>
    <p className="books-footer">Файл учебника загружается с okulyk.kz. При увеличении страницу можно прокручивать в стороны.</p>
  </section>;
}
