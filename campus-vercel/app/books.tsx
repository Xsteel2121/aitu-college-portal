"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import catalog from "../lib/books.json";
const BookReader = dynamic(() => import("./book-reader"), { ssr: false, loading: () => <p role="status">Открываем книгу…</p> });

export default function BooksView() {
  const [grade, setGrade] = useState<10 | 11>(10);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof catalog.books)[number] | null>(null);
  const classBooks = catalog.books.filter(book => book.grade === grade);
  const subjects = [...new Set(classBooks.map(book => book.subject))].sort((a, b) => a.localeCompare(b, "ru"));
  const languages = [...new Set(classBooks.map(book => book.language))].sort((a, b) => a.localeCompare(b, "ru"));
  const search = query.trim().toLocaleLowerCase("ru");
  const books = classBooks.filter(book => (!subject || book.subject === subject)
    && (!language || book.language === language)
    && (!search || `${book.title} ${book.authors} ${book.part} ${book.subject} ${book.language} ${book.year ?? ""}`.toLocaleLowerCase("ru").includes(search)));
  const filtered = Boolean(subject || language || query);

  function reset() { setSubject(""); setLanguage(""); setQuery(""); }
  function chooseGrade(value: 10 | 11) { setGrade(value); reset(); }
  function openBook(book: (typeof catalog.books)[number]) { setSelected(book); window.scrollTo({ top: 0 }); }

  if (selected) return <BookReader book={selected} onBack={() => { setSelected(null); window.scrollTo({ top: 0 }); }}/>

  return <section className="books-view">
    <div className="page-heading books-heading"><div><span className="eyebrow">БИБЛИОТЕКА</span><h1>Книги</h1><p>Учебники 10-го и 11-го классов</p></div>
      <a className="books-source" href={catalog.source} target="_blank" rel="noopener noreferrer">okulyk.kz <ExternalLink size={14}/><span className="sr-only"> — в новой вкладке</span></a>
    </div>
    <div className="books-controls">
      <div className="books-grades" aria-label="Класс">{([10, 11] as const).map(value => <button key={value} className={grade === value ? "active" : ""} aria-pressed={grade === value} onClick={() => chooseGrade(value)}>{value} класс</button>)}</div>
      <label className="books-search"><span className="sr-only">Поиск книги по названию или автору</span><Search size={19}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Название или автор"/></label>
      <div className="books-filters">
        <label>Предмет<select value={subject} onChange={event => setSubject(event.target.value)}><option value="">Все предметы</option>{subjects.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Язык<select value={language} onChange={event => setLanguage(event.target.value)}><option value="">Все языки</option>{languages.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
    </div>
    <div className="books-result-line"><p role="status">Найдено: <strong>{books.length}</strong> <span>из {classBooks.length}</span></p>{filtered && <button className="books-reset" onClick={reset}><X size={14}/>Сбросить</button>}</div>
    {books.length ? <div className="books-grid">{books.map(book => { const content = <>
      <div className="book-cover"><BookOpen size={36} aria-hidden="true"/><img src={book.cover} alt="" loading="lazy" decoding="async" width={120} height={170} referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }}/></div>
      <div className="book-detail"><span className="book-subject">{book.subject}</span><span className="book-title">{book.title}</span><span className="book-metadata">{book.language}{book.year ? ` · ${book.year}` : ""}{book.part ? ` · ${book.part}` : ""}</span><span className="book-open">{book.pdf ? <>Читать здесь <BookOpen size={14}/></> : <>На сайте источника <ExternalLink size={14}/><span className="sr-only"> — в новой вкладке</span></>}</span>{!book.pdf && <span className="book-no-pdf">Источник не опубликовал PDF</span>}</div>
    </>; return book.pdf ? <button className="library-book" key={book.id} onClick={() => openBook(book)}>{content}</button> : <a className="library-book" key={book.id} href={book.url} target="_blank" rel="noopener noreferrer">{content}</a>; })}</div> : <div className="empty-state"><Search size={36}/><h2>Книга не найдена</h2><p>Попробуйте другое название или снимите фильтры.</p><button className="today-button" onClick={reset}>Сбросить фильтры</button></div>}
    <p className="books-footer">PDF читаются внутри AITU College. Файлы и обложки — из каталога okulyk.kz; варианты изданий сохранены как у источника.</p>
  </section>;
}
