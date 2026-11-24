import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { parseNum } from './engine.js';
import { catTone, isN } from './format.js';
import { fmtSize } from './docstore.js';
import { periodText } from './period.js';

const P = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  chev: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  printer: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  play: 'M7 4l12 8-12 8z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  factory: 'M3 20V10l5 3V10l5 3V6h3l1 4h3v10zM7 17h2M12 17h2M17 17h1',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  scale: 'M12 4v16M6 20h12M5 8h14M5 8l-2 6a3 3 0 0 0 4 0zM19 8l-2 6a3 3 0 0 0 4 0z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  history: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5M12 8v4l3 2',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  school: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  building: 'M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  clip: 'M20.5 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  gavel: 'M14 5l5 5M11 8l5 5M13 6l-6 6 3 3 6-6M8.5 13.5 3 19l2 2 5.5-5.5M14 21h7',
};
export function Icon({ name, size = 18, stroke = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Tag({ cat, children }) {
  return <span className={'tag t-' + catTone(cat)}>{children ?? cat ?? '—'}</span>;
}

export function Toggle({ value, onChange, label, id }) {
  return (
    <div id={id} className={'toggle' + (value ? ' on' : '')} role="switch" aria-checked={!!value} tabIndex={0}
      onClick={() => onChange(!value)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!value); } }}>
      <span className="sw" />
      {label && <span className="t">{label}</span>}
    </div>
  );
}

function HintBox({ def, extra, title }) {
  if (!def.hint && !def.doc && !extra) return null;
  return (
    <div className="hint" role="tooltip">
      {title && <div className="hint-title">{title}</div>}
      {def.hint && <div>{def.hint}</div>}
      {def.doc && <div className="row">Где взять: <span>{def.doc}</span></div>}
      {extra}
    </div>
  );
}

const fmtCache = {};
const isMoney = (def) => !!def.money || def.unit === 'сом';
function fmtInput(v, money) {
  if (!isN(v)) return v ?? '';
  const k = money ? 'm' : Math.abs(v) >= 10000 ? 'g' : 'n';
  if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: money ? 2 : 4, useGrouping: k !== 'n' });
  return fmtCache[k].format(v).replace('-', '−');
}

// Документы-основания: прикрепление файлов к полям «Источник» (контекст задаёт App)
export const DocsContext = createContext(null);
// Отчётный период формы (periodInfo): по нему поля показывают конкретный год или даты
export const PeriodContext = createContext(null);
export function PeriodChip({ code }) {
  const P = useContext(PeriodContext);
  const t = periodText(code, P);
  if (!t) return null;
  return <span className="per" title="Год или даты взяты из блока «Отчётный период» в профиле компании">{t}</span>;
}

export function DocChips({ k, list }) {
  const docs = useContext(DocsContext);
  if (!docs || !list || !list.length) return null;
  return (
    <div className="doc-chips">
      {list.map((m) => {
        const miss = docs.present && !docs.present.has(m.id);
        return (
          <span key={m.id} className={'doc-chip' + (miss ? ' miss' : '')} title={miss ? 'Файл не найден в хранилище документов этого компьютера' : `${m.name} · ${fmtSize(m.size || 0)} · добавлен ${m.added || ''}`}>
            <button type="button" className="doc-open" onClick={() => docs.open(m)}><Icon name={miss ? 'warn' : 'doc'} size={13} /><span className="nm">{m.name}</span></button>
            <span className="sz">{fmtSize(m.size || 0)}</span>
            {!docs.readOnly && <button type="button" className="doc-x" onClick={() => docs.remove(k, m.id)} aria-label={'Открепить ' + m.name} title="Открепить документ">×</button>}
          </span>
        );
      })}
    </div>
  );
}

export function AttachButton({ k, label, children, className = 'clip-btn', title }) {
  const docs = useContext(DocsContext);
  const ref = useRef(null);
  if (!docs || docs.readOnly) return null;
  const busy = docs.busy === k;
  return (
    <>
      <button type="button" className={className + (busy ? ' busy' : '')} title={title || 'Прикрепить документ: PDF, скан, Excel, Word'} aria-label={'Прикрепить документ: ' + label}
        onClick={() => ref.current && ref.current.click()} disabled={busy}><Icon name="clip" size={15} />{children}</button>
      <input ref={ref} type="file" multiple style={{ display: 'none' }} data-doc-key={k} onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) docs.attach(k, f); }} />
    </>
  );
}

const dropProps = (docs, k) => (docs && !docs.readOnly ? {
  onDragOver: (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); e.currentTarget.classList.add('drop'); } },
  onDragLeave: (e) => e.currentTarget.classList.remove('drop'),
  onDrop: (e) => { e.currentTarget.classList.remove('drop'); const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (f.length) { e.preventDefault(); docs.attach(k, f); } },
} : {});

export function DocsPanel({ k, hint }) {
  const docs = useContext(DocsContext);
  if (!docs) return null;
  const list = (docs.docs && docs.docs[k]) || [];
  return (
    <div className="docs-panel" {...dropProps(docs, k)}>
      <div className="docs-panel-h">
        <AttachButton k={k} label="документы компании" className="btn sm">Прикрепить файлы</AttachButton>
        <span className="small muted">{hint || 'или перетащите файлы сюда'}{docs.busy === k ? ' · загрузка…' : ''}</span>
      </div>
      {list.length ? <DocChips k={k} list={list} /> : <div className="small muted">Файлов пока нет.</div>}
    </div>
  );
}

export function Field({ def, value, onChange, extra, highlight, className = '', bare, inputId, noUnit, placeholder, warn }) {
  const docs = useContext(DocsContext);
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const [text, setText] = useState('');
  const showHint = focus || hover;
  const isNumT = def.type === 'num';
  const money = isMoney(def);
  const id = inputId || 'f_' + def.key;
  const unit = noUnit ? '' : def.unit;
  const filled = value !== null && value !== undefined && value !== '' && value !== false;
  const invalid = isNumT && typeof value === 'string' && value.trim() !== '' && parseNum(value) === null;

  let control;
  if (isNumT) {
    const shown = focus ? text : fmtInput(value, money);
    control = (
      <div className="inp-wrap">
        <input id={id} className={'inp num' + (filled ? ' filled' : '') + (invalid ? ' err' : '')}
          style={unit ? { paddingRight: 16 + unit.length * 6.6 } : undefined} aria-label={bare ? def.label : undefined}
          inputMode="decimal" autoComplete="off" placeholder={placeholder ?? (def.placeholder || 'введите число')} value={shown}
          onFocus={() => { setFocus(true); setText(fmtInput(value, money)); }}
          onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
          onBlur={() => { setFocus(false); const x = parseNum(text); if (x !== null) onChange(x); else if (text.trim() === '') onChange(null); }} />
        {unit && <span className="unit">{unit}</span>}
      </div>
    );
  } else if (def.type === 'text' || def.type === 'source' || def.type === 'date') {
    const ph = placeholder ?? (def.placeholder || (def.type === 'source' ? 'документ: название, №, дата' : def.type === 'date' ? 'ДД.ММ.ГГГГ' : ''));
    const badDate = def.type === 'date' && typeof value === 'string' && value.trim() !== '' && !/^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*$/.test(value);
    control = <input id={id} className={'inp' + (filled ? ' filled' : '') + (badDate || warn ? ' err' : '') + (def.type === 'source' ? ' src-inp' : '')} placeholder={ph} value={value ?? ''}
      aria-label={bare ? def.label : undefined} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(e) => onChange(e.target.value)} />;
    if (def.type === 'source' && docs) {
      const list = (docs.docs && docs.docs[def.key]) || [];
      control = (
        <div className="src-wrap" {...dropProps(docs, def.key)}>
          <div className={'src-row' + (docs.readOnly ? '' : ' has-clip')}>{control}<AttachButton k={def.key} label={def.label} />{list.length > 0 && <span className="src-count" title="прикреплено документов">{list.length}</span>}</div>
          <DocChips k={def.key} list={list} />
        </div>
      );
    }
  } else if (def.type === 'select') {
    const opts = def.options || [];
    const cur = value === null || value === undefined ? '' : String(value);
    const has = opts.some((o) => String(o.value) === cur);
    control = (
      <select id={id} className={'inp' + (filled ? ' filled' : '')} value={has ? cur : ''} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        aria-label={bare ? def.label : undefined} onChange={(e) => onChange(e.target.value)}>
        {!has && cur === '' && !opts.some((o) => o.value === '') && <option value="">— выберите —</option>}
        {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    );
  } else if (def.type === 'bool') {
    return (
      <div className={'field field-bool ' + className + (highlight ? ' hl-search' : '')} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
          <Toggle id={id} value={!!value} onChange={onChange} label={def.per ? <>{def.label} <PeriodChip code={def.per} /></> : def.label} />
        </div>
        {showHint && <HintBox def={def} extra={extra} />}
      </div>
    );
  }
  if (bare) {
    return (
      <div className={'field bare ' + className + (highlight ? ' hl-search' : '')} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {control}
        {showHint && <HintBox def={def} extra={extra} title={def.label} />}
      </div>
    );
  }
  return (
    <div className={'field ' + className + (highlight ? ' hl-search' : '')} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <label htmlFor={id} className="lbl">
        {def.label}
        {def.per && <PeriodChip code={def.per} />}
        {(def.hint || def.doc) && <span className="info" aria-hidden="true">i</span>}
      </label>
      {control}
      {showHint && <HintBox def={def} extra={extra} />}
    </div>
  );
}

export function useTooltip() {
  const [tip, setTip] = useState(null);
  const node = tip ? (
    <div className="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 320), top: tip.y + 14 }}>{tip.content}</div>
  ) : null;
  return [node, (e, content) => setTip({ x: e.clientX, y: e.clientY, content }), () => setTip(null)];
}

export function useOutside(ref, fn) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) fn(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, fn]);
}

export function Menu({ label, children, icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div className="menu" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)}>{icon && <Icon name={icon} size={16} />}{label}</button>
      {open && <div className="menu-pop" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, actions, wide }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal card' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-h"><h3>{title}</h3><button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Закрыть">✕</button></div>
        <div className="card-b">{children}</div>
        {actions && <div className="modal-f">{actions}</div>}
      </div>
    </div>
  );
}
