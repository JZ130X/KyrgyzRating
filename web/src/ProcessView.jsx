// Раздел «Комитет и мониторинг»: проверка вторым аналитиком, протокол комитета с голосованием,
// рейтинговые действия по компаниям и сроки пересмотра действующих оценок.
import React, { useEffect, useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cfg, rawStr, canonical } from './engine.js';
import { Icon, Modal, DocsContext, DocChips, AttachButton } from './ui.jsx';
import { num, isN, ratingTone, download } from './format.js';
import { shortDate } from './archive.js';
import { LOGO_URL, BRAND_RU, BRAND_EN } from './brand.js';
import { committeeCheck, withdrawalCheck, processVerify, monitoring, reviewDue, todayIso, todayRu, deviationText, isoRu, WORK_STATUSES } from './process.js';
import { putFile, presentIds, openDoc } from './docstore.js';

const C = cfg.committee;
const STATUS = Object.fromEntries(cfg.archive_statuses.map((s) => [s.value, s.label]));
const OUT = cfg.outlooks;
const LS_MEMBERS = 'kyrgyz-rating-committee-members';
const nowIso = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));
const subLabel = (e) => (e.subsector === 'INT' ? 'Агрохолдинг' : e.subsector_name || '—');
const stTone = { draft: 'none', check: 'mid', committee: 'ok', approved: 'good', returned: 'weak', rejected: 'bad', withdrawn: 'bad', archived: 'none' };
const revTone = { overdue: 'bad', soon: 'mid', ok: 'good' };
const actTone = { assigned: 'ok', affirmed: 'good', upgraded: 'good', downgraded: 'bad', outlook: 'mid', review: 'weak', withdrawn: 'none' };

function loadMembers() {
  try { const a = JSON.parse(localStorage.getItem(LS_MEMBERS) || '[]'); return Array.isArray(a) ? a.filter((m) => m && typeof m.name === 'string') : []; } catch (e) { return []; }
}
function StatusTag({ s }) { return <span className={'tag t-' + (stTone[s] || 'none')} style={{ fontFamily: 'var(--font)' }}>{STATUS[s] || s}</span>; }
const dot = (x) => String(x || '').replace(/[.\s]+$/, '') + '.';
const pl = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const daysText = (d) => (d < 0 ? `просрочен на ${-d} ${pl(-d, 'день', 'дня', 'дней')}` : d === 0 ? 'сегодня' : `через ${d} ${pl(d, 'день', 'дня', 'дней')}`);

export default function ProcessView({ entries, onCommit, onOpen, onReport, onReeval, focusId, setFocusId, setToast }) {
  const [view, setView] = useState(focusId ? 'review' : 'monitor');
  useEffect(() => { if (focusId) setView('review'); }, [focusId]);
  const today = todayIso();
  const mon = useMemo(() => monitoring(entries, today), [entries, today]);
  const queue = entries.filter((e) => WORK_STATUSES.includes(e.status) || e.status === 'returned');
  const nCheck = entries.filter((e) => e.status === 'check').length;
  const nCom = entries.filter((e) => e.status === 'committee').length;
  const c = mon.counts;
  return (
    <div className="process">
      <div className="callout small">
        Здесь оценка проходит путь до решения: <b>проверка вторым аналитиком</b> → <b>заседание комитета</b> с кворумом и голосованием → <b>протокол</b>. После решения программа ведёт
        {' '}<b>рейтинговые действия</b> по каждой компании и напоминает о <b>сроках пересмотра</b>: через {C.review_months} месяцев после решения, а при прогнозе «На пересмотре» — не позднее {C.watch_review_days} дней.
      </div>
      <div className="proc-tiles">
        <Tile n={c.active} l="Действующих оценок" />
        <Tile n={c.overdue} l="Пересмотр просрочен" tone={c.overdue ? 'bad' : ''} />
        <Tile n={c.soon} l={`Пересмотр в ближайшие ${C.soon_days} дней`} tone={c.soon ? 'mid' : ''} />
        <Tile n={nCheck} l="На проверке у второго аналитика" />
        <Tile n={nCom} l="Ждут заседания комитета" />
        <Tile n={c.withdrawn} l="Отозвано" />
      </div>
      <div className="proc-tabs seg">
        <button className={view === 'monitor' ? 'on' : ''} onClick={() => setView('monitor')}>Мониторинг</button>
        <button className={view === 'review' ? 'on' : ''} onClick={() => setView('review')}>Рассмотрение оценок{queue.length ? ` · ${queue.length}` : ''}</button>
        <button className={view === 'actions' ? 'on' : ''} onClick={() => setView('actions')}>Рейтинговые действия{mon.actions.length ? ` · ${mon.actions.length}` : ''}</button>
      </div>
      {view === 'monitor' && <Monitor mon={mon} entries={entries} onReeval={onReeval} onProtocol={(id) => { setFocusId(id); setView('review'); }} />}
      {view === 'review' && <Review entries={entries} focusId={focusId} setFocusId={setFocusId} onCommit={onCommit} onOpen={onOpen} onReport={onReport} setToast={setToast} mon={mon} />}
      {view === 'actions' && <Actions mon={mon} onProtocol={(id) => { setFocusId(id); setView('review'); }} />}
    </div>
  );
}

function Tile({ n, l, tone }) {
  return <div className={'proc-tile' + (tone ? ' t-' + tone : '')}><b>{n}</b><span>{l}</span></div>;
}

// ── Мониторинг
function Monitor({ mon, entries, onReeval, onProtocol }) {
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  if (!mon.active.length && !mon.withdrawn.length) {
    return <div className="empty">Действующих оценок пока нет. Оценка становится действующей после решения комитета во вкладке «Рассмотрение оценок».</div>;
  }
  return (
    <>
      {mon.active.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl proc-tbl">
            <thead><tr><th>Компания</th><th>Оценка</th><th>Прогноз</th><th>Решение комитета</th><th>Пересмотр до</th><th>Состояние</th><th>Действия</th></tr></thead>
            <tbody>
              {mon.active.map((a) => (
                <tr key={a.key} className={a.review_state === 'overdue' ? 'row-bad' : a.review_state === 'soon' ? 'row-mid' : ''}>
                  <td><b>{a.company || 'без названия'}</b>{a.inn ? <div className="small muted">ИНН {a.inn}</div> : null}{a.report_year ? <div className="small muted">отчётность за {a.report_year}</div> : null}</td>
                  <td><span className={'tag t-' + ratingTone(a.index)}>{a.national}</span><div className="small muted">{a.internal}</div></td>
                  <td className="small">{a.outlook_label}</td>
                  <td className="small">{a.date}<div className="muted">протокол № {a.protocol}{isN(a.deviation) && a.deviation !== 0 ? ` · отклонение от программы: ${deviationText(a.deviation)}` : ''}</div></td>
                  <td className="small nowrap"><b>{a.next_review}</b><div className="muted">{a.review_basis}</div></td>
                  <td><span className={'tag t-' + revTone[a.review_state]} style={{ fontFamily: 'var(--font)' }}>{a.review_label}</span><div className="small muted">{daysText(a.days_left)}</div>
                    {a.in_work > 0 && <div className="small"><span className="chip blue">новая оценка в работе: {a.in_work}</span></div>}</td>
                  <td className="nowrap">
                    <button className="btn sm" onClick={() => byId[a.entry_id] && onReeval(byId[a.entry_id])} title="Начать пересмотр: новая оценка на основе данных действующей">Пересмотр</button>
                    <button className="btn sm" onClick={() => onProtocol(a.entry_id)} title="Протокол и отзыв оценки">Протокол</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mon.withdrawn.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h"><h3>Отозванные оценки</h3></div>
          <div className="card-b">
            <table className="tbl small"><thead><tr><th>Компания</th><th>Дата отзыва</th><th>Последняя оценка</th><th>Причина</th></tr></thead>
              <tbody>{mon.withdrawn.map((w) => <tr key={w.key}><td>{w.company}</td><td>{w.date}</td><td>{w.prev_national || '—'}</td><td>{w.reason}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Рейтинговые действия
function Actions({ mon, onProtocol }) {
  const list = [...mon.actions].reverse();
  const csv = () => {
    const head = ['Дата', 'Компания', 'ИНН', 'Действие', 'Было', 'Стало', 'Прогноз', 'Протокол', 'Отклонение от программы', 'Причина'];
    const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [head.join(';'), ...list.map((a) => [a.date, a.company, a.inn, a.action_label, a.prev_national, a.national, a.outlook, a.protocol, deviationText(a.deviation), a.reason].map(cell).join(';'))];
    download(`reitingovye_deistviya_${todayIso()}.csv`, '﻿' + rows.join('\r\n') + '\r\n', 'text/csv');
  };
  if (!list.length) return <div className="empty">Рейтинговых действий пока нет: они появляются после решений комитета.</div>;
  return (
    <>
      <div className="toolbar"><span className="small muted">Действие определяется сравнением с предыдущим решением по той же компании (по ИНН, без ИНН — по названию). Меньший номер ступени шкалы — более высокая оценка.</span>
        <button className="btn sm" onClick={csv} style={{ marginLeft: 'auto' }}><Icon name="download" size={14} />Excel (CSV)</button></div>
      <div className="tbl-wrap">
        <table className="tbl proc-tbl">
          <thead><tr><th>Дата</th><th>Компания</th><th>Действие</th><th>Оценка</th><th>Прогноз</th><th>Протокол</th><th>Отклонение от программы</th><th /></tr></thead>
          <tbody>
            {list.map((a, i) => (
              <tr key={i}>
                <td className="nowrap small">{a.date}</td>
                <td><b>{a.company}</b>{a.inn ? <div className="small muted">ИНН {a.inn}</div> : null}</td>
                <td><span className={'tag t-' + actTone[a.action]} style={{ fontFamily: 'var(--font)' }}>{a.action_label}</span></td>
                <td className="nowrap">{a.prev_national && a.prev_national !== a.national ? <span className="muted">{a.prev_national} → </span> : null}<b>{a.national || (a.action === 'withdrawn' ? 'отозвана' : '—')}</b></td>
                <td className="small">{a.outlook || (a.reason ? 'причина: ' + a.reason : '—')}</td>
                <td className="small">{a.protocol ? '№ ' + a.protocol : '—'}</td>
                <td className="small">{deviationText(a.deviation) || '—'}</td>
                <td><button className="btn sm" onClick={() => onProtocol(a.entry_id)}>Протокол</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Рассмотрение: список оценок и протокол выбранной
function Review({ entries, focusId, setFocusId, onCommit, onOpen, onReport, setToast, mon }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const s = q.trim().toLowerCase();
  const list = entries.filter((e) => (all || WORK_STATUSES.includes(e.status) || e.status === 'returned' || e.id === focusId)
    && (!s || [e.company, e.inn, e.analyst, e.final_national].some((x) => (x || '').toLowerCase().includes(s))));
  const cur = entries.find((e) => e.id === focusId) || null;
  return (
    <div className="proc-review">
      <div className="proc-list">
        <div className="search"><Icon name="search" size={16} /><input placeholder="Компания, ИНН, аналитик" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="small proc-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> показать все оценки архива, включая решённые</label>
        {list.length === 0 && <div className="small muted" style={{ padding: 8 }}>{entries.length ? 'Оценок в работе нет. Сохраните оценку в архив или включите «показать все».' : 'Архив пуст: сначала сохраните оценку («Сохранить результат» вверху).'}</div>}
        {list.map((e) => (
          <button key={e.id} className={'proc-item' + (e.id === focusId ? ' on' : '')} onClick={() => setFocusId(e.id)}>
            <div className="proc-item-h"><b>{e.company || 'без названия'}</b>{e.final_national ? <span className={'tag t-' + ratingTone(e.final_index)}>{e.final_national}</span> : null}</div>
            <div className="small muted">{e.analyst || 'аналитик не указан'} · {e.eval_date || shortDate(e.saved_at)}</div>
            <StatusTag s={e.status} />
          </button>
        ))}
      </div>
      <div className="proc-main">
        {cur ? <Protocol key={cur.id + (cur.updated_at || '')} entry={cur} onCommit={onCommit} onOpen={onOpen} onReport={onReport} setToast={setToast} mon={mon} />
          : <div className="empty">Выберите оценку слева. Порядок: 1) второй аналитик проверяет расчёт и источники; 2) комитет голосует и принимает решение; 3) программа формирует протокол.</div>}
      </div>
    </div>
  );
}

function ErrList({ errors, warnings, okText }) {
  if (!errors.length && !(warnings || []).length) return okText ? <div className="proc-ok"><Icon name="check" size={15} />{okText}</div> : null;
  return (
    <div className="proc-errs">
      {errors.map((x, i) => <div key={'e' + i} className="err"><Icon name="warn" size={14} />{x}</div>)}
      {(warnings || []).map((x, i) => <div key={'w' + i} className="wrn"><Icon name="spark" size={14} />{x}</div>)}
    </div>
  );
}

function Protocol({ entry, onCommit, onOpen, onReport, setToast, mon }) {
  const p0 = entry.process && typeof entry.process === 'object' ? entry.process : {};
  const final = p0.decision && typeof p0.decision === 'object' ? p0.decision : null;
  const [chk, setChk] = useState(() => ({ by: '', date: todayRu(), result: 'ok', comment: '', ...(p0.check || {}) }));
  const [com, setCom] = useState(() => ({ number: '', date: todayRu(), members: loadMembers().map((m) => ({ name: m.name, role: m.role || 'member', vote: '', conflict: false })), decision: '', rationale: '', ...(p0.committee || {}) }));
  const [confirm, setConfirm] = useState(false);
  const draft = { ...p0, check: chk, committee: com };
  const r = committeeCheck(entry, draft);
  const checkSaved = !!p0.check_at;
  const checkDirty = canonical(p0.check || null) !== canonical(chk);
  const rated = entry.calc_status === 'rated';
  const [vOk, vErr] = processVerify(entry);
  const log = Array.isArray(p0.log) ? p0.log : [];
  const save = (proc, status, msg, logText) => onCommit([{ ...entry, process: { ...proc, log: [...log, { at: nowIso(), text: logText }] }, status, updated_at: nowIso() }], msg);
  const saveCheck = () => {
    const ok = chk.result === 'ok';
    save({ ...p0, check: chk, check_at: nowIso() }, ok ? 'committee' : 'returned',
      <span><b>Проверка записана:</b> {ok ? 'замечаний нет — оценка передана на заседание комитета.' : 'есть замечания — оценка возвращена аналитику на доработку.'}</span>,
      `Проверка вторым аналитиком (${rawStr(chk.by)}, ${rawStr(chk.date)}): ${ok ? 'замечаний нет' : 'есть замечания — ' + rawStr(chk.comment)}`);
  };
  const saveDraft = () => save({ ...p0, check: p0.check || chk, committee: com }, entry.status === 'check' || entry.status === 'draft' ? 'committee' : entry.status,
    <span><b>Черновик протокола сохранён.</b></span>, 'Черновик протокола сохранён');
  const finalize = () => {
    try { localStorage.setItem(LS_MEMBERS, JSON.stringify(com.members.map((m) => ({ name: m.name, role: m.role })))); } catch (e) { /* */ }
    const d = r.decision;
    save({ ...p0, check: chk, committee: com, decision: d, finalized_at: nowIso() }, d.status,
      <span><b>Решение зафиксировано:</b> {d.decision_label}{d.final_national ? ` — ${d.final_national}, прогноз «${d.outlook_label}»` : ''}. Протокол № {d.protocol}.</span>,
      `Решение комитета, протокол № ${d.protocol} от ${d.date}: ${d.decision_label}${d.final_national ? ` — ${d.final_national}, ${d.outlook_label}` : ''}`);
  };
  const setM = (i, k, v) => setCom((c) => ({ ...c, members: c.members.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  const isCurrent = final && final.status === 'approved' && mon.active.some((a) => a.entry_id === entry.id);
  return (
    <div className="proc-protocol">
      <div className="card">
        <div className="card-h"><Icon name="briefcase" /><h3>{entry.company || 'без названия'}</h3><span style={{ marginLeft: 'auto' }}><StatusTag s={entry.status} /></span></div>
        <div className="card-b proc-sum">
          <div><span>ИНН</span><b>{entry.inn || '—'}</b></div>
          <div><span>Подсектор</span><b>{subLabel(entry)}</b></div>
          <div><span>Подготовил (докладчик)</span><b>{entry.analyst || '—'}</b></div>
          <div><span>Дата оценки</span><b>{entry.eval_date || '—'}</b></div>
          <div><span>Оценка программы</span><b>{rated ? `${entry.final_national} (${entry.final_internal}), прогноз «${entry.outlook_label}»` : entry.message || '—'}</b></div>
          <div><span>Балл скоркарда</span><b>{isN(entry.agg) ? num(entry.agg, 2) : '—'}</b></div>
          <div className="proc-sum-btns">
            <button className="btn sm" onClick={() => onOpen(entry)}>Открыть данные</button>
            <button className="btn sm" onClick={() => onReport(entry)}>Отчёт для комитета</button>
            <button className="btn sm" onClick={() => printProtocol(entry)}><Icon name="printer" size={14} />{final ? 'Протокол' : 'Проект протокола'}</button>
          </div>
        </div>
      </div>
      {vOk === false && <div className="capnote bad">Протокол не проходит перепроверку: {vErr.join(' ')}</div>}
      {final ? <FinalView entry={entry} final={final} log={log} isCurrent={isCurrent} onCommit={onCommit} setToast={setToast} mon={mon} /> : (
        <>
          <div className="card">
            <div className="card-h"><span className="step-n">1</span><h3>Проверка вторым аналитиком</h3>{checkSaved && !checkDirty && <span className="chip green" style={{ marginLeft: 'auto' }}>записана</span>}</div>
            <div className="card-b">
              <div className="small muted" style={{ marginBottom: 8 }}>Другой аналитик сверяет введённые значения с документами-источниками и проверяет, что расчёт выполнен по действующим правилам. Он не может быть тем, кто готовил оценку.</div>
              <div className="fgrid">
                <label className="field"><span className="lbl">Проверяющий (ФИО)</span><input id="chk-by" className="inp" value={chk.by} onChange={(e) => setChk({ ...chk, by: e.target.value })} placeholder="Фамилия И. О." /></label>
                <label className="field"><span className="lbl">Дата проверки</span><input id="chk-date" className="inp" value={chk.date} onChange={(e) => setChk({ ...chk, date: e.target.value })} placeholder="ДД.ММ.ГГГГ" /></label>
                <label className="field"><span className="lbl">Результат</span><select id="chk-result" className="inp" value={chk.result} onChange={(e) => setChk({ ...chk, result: e.target.value })}>{C.check_results.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
                <label className="field span-all"><span className="lbl">Комментарий{chk.result === 'remarks' ? ' — какие замечания (обязательно)' : ''}</span><textarea id="chk-comment" className="inp" rows={2} value={chk.comment} onChange={(e) => setChk({ ...chk, comment: e.target.value })} /></label>
              </div>
              <ErrList errors={r.errors_check} okText={r.check_ok ? 'Проверка заполнена верно.' : chk.result === 'remarks' && !r.errors_check.length ? 'Замечания описаны: оценка вернётся аналитику на доработку.' : null} />
              <button id="btn-save-check" className="btn green" disabled={r.errors_check.length > 0 || (checkSaved && !checkDirty)} onClick={saveCheck}><Icon name="check" size={15} />Записать проверку</button>
            </div>
          </div>
          <div className={'card' + (r.check_ok && checkSaved && !checkDirty ? '' : ' dim')}>
            <div className="card-h"><span className="step-n">2</span><h3>Заседание рейтингового комитета</h3></div>
            <div className="card-b">
              {!(r.check_ok && checkSaved && !checkDirty) ? <div className="small muted">Доступно после записанной проверки без замечаний.</div> : (
                <>
                  <div className="fgrid">
                    <label className="field"><span className="lbl">Номер протокола</span><input id="com-number" className="inp" value={com.number} onChange={(e) => setCom({ ...com, number: e.target.value })} placeholder="например, КР-12/2026" /></label>
                    <label className="field"><span className="lbl">Дата заседания</span><input id="com-date" className="inp" value={com.date} onChange={(e) => setCom({ ...com, date: e.target.value })} placeholder="ДД.ММ.ГГГГ" /></label>
                  </div>
                  <div className="group-t" style={{ marginTop: 10 }}>Состав и голосование</div>
                  <div className="small muted" style={{ marginBottom: 6 }}>Кворум — не меньше {C.quorum} голосующих. Член комитета с конфликтом интересов не голосует. Аналитик, подготовивший оценку, только докладывает. Решение принято, если «за» больше половины голосующих.</div>
                  <div className="tbl-wrap">
                    <table className="tbl te proc-members">
                      <thead><tr><th>№</th><th>ФИО</th><th>Роль</th><th className="c">Конфликт интересов</th><th>Голос</th><th /></tr></thead>
                      <tbody>
                        {com.members.length === 0 && <tr><td colSpan={6} className="small muted">Добавьте членов комитета.</td></tr>}
                        {com.members.map((m, i) => (
                          <tr key={i}>
                            <td className="muted">{i + 1}</td>
                            <td><input className="inp" aria-label={`Член комитета ${i + 1}: ФИО`} value={m.name || ''} onChange={(e) => setM(i, 'name', e.target.value)} placeholder="Фамилия И. О." /></td>
                            <td><select className="inp" aria-label={`Член комитета ${i + 1}: роль`} value={m.role || 'member'} onChange={(e) => setM(i, 'role', e.target.value)}>{C.roles.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                            <td className="c"><input type="checkbox" aria-label={`Член комитета ${i + 1}: конфликт интересов`} checked={m.conflict === true} onChange={(e) => setM(i, 'conflict', e.target.checked)} /></td>
                            <td><select className="inp" aria-label={`Член комитета ${i + 1}: голос`} value={m.vote || ''} disabled={m.conflict === true} onChange={(e) => setM(i, 'vote', e.target.value)}><option value="">— голос —</option>{C.votes.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                            <td><button className="icon-btn" title="Удалить" onClick={() => setCom({ ...com, members: com.members.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button id="btn-add-member" className="btn sm" onClick={() => setCom({ ...com, members: [...com.members, { name: '', role: com.members.length ? 'member' : 'chair', vote: '', conflict: false }] })}><Icon name="plus" size={14} />Добавить члена комитета</button>
                    <span className="small"><b>За {r.votes.for}</b> · против {r.votes.against} · воздержались {r.votes.abstain} · голосуют {r.voting}{r.conflicts ? ` · конфликт интересов: ${r.conflicts}` : ''}</span>
                  </div>
                  <div className="group-t" style={{ marginTop: 12 }}>Решение</div>
                  <div className="proc-decisions">
                    {C.decisions.map((d) => {
                      const off = d.status === 'approved' && !rated;
                      return <label key={d.value} className={'proc-dec' + (com.decision === d.value ? ' on' : '') + (off ? ' off' : '')}>
                        <input type="radio" name="decision" value={d.value} checked={com.decision === d.value} disabled={off} onChange={() => setCom({ ...com, decision: d.value, ...(d.value === 'approve_dev' && !Number.isInteger(com.rating_index) ? { rating_index: entry.final_index, outlook: entry.outlook_code } : {}) })} />
                        {d.label}{d.value === 'approve' && rated ? <b> — {entry.final_national}, «{entry.outlook_label}»</b> : null}</label>;
                    })}
                  </div>
                  {com.decision === 'approve_dev' && (
                    <div className="fgrid" style={{ marginTop: 8 }}>
                      <label className="field"><span className="lbl">Оценка комитета</span>
                        <select id="com-rating" className="inp" value={Number.isInteger(com.rating_index) ? com.rating_index : ''} onChange={(e) => setCom({ ...com, rating_index: e.target.value === '' ? null : parseInt(e.target.value, 10) })}>
                          <option value="">— выберите —</option>
                          {cfg.rating_scale.map((x, i) => <option key={i} value={i}>{x.national} ({x.internal}){i === entry.final_index ? ' — программа' : ''}</option>)}
                        </select></label>
                      <label className="field"><span className="lbl">Прогноз комитета</span>
                        <select id="com-outlook" className="inp" value={com.outlook || ''} onChange={(e) => setCom({ ...com, outlook: e.target.value })}>
                          <option value="">— выберите —</option>
                          {Object.entries(OUT).map(([k, v]) => <option key={k} value={k}>{v.label}{k === entry.outlook_code ? ' — программа' : ''}</option>)}
                        </select></label>
                    </div>
                  )}
                  {com.decision && <label className="field" style={{ marginTop: 8 }}><span className="lbl">{com.decision === 'approve_dev' ? `Обоснование отклонения от программы (не короче ${C.min_rationale} знаков)` : com.decision === 'approve' ? 'Комментарий (необязательно)' : `Причина решения (не короче ${C.min_reason} знаков)`}</span>
                    <textarea id="com-rationale" className="inp" rows={3} value={com.rationale || ''} onChange={(e) => setCom({ ...com, rationale: e.target.value })} /></label>}
                  <ErrList errors={r.errors_committee} warnings={r.warnings} okText={r.decision ? 'Протокол заполнен верно — решение можно зафиксировать.' : null} />
                  {r.decision && r.decision.final_national && <div className="proc-preview">Итог: <b>{r.decision.final_national}</b> ({r.decision.final_internal}), прогноз «{r.decision.outlook_label}»{r.decision.deviation ? ` · отклонение от программы: ${deviationText(r.decision.deviation)}` : ' · совпадает с программой.'} Следующий пересмотр — до {isoRu(reviewDue({ outlook_code: r.decision.outlook_code, date_iso: r.decision.date_iso }))}.</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <button id="btn-finalize" className="btn green" disabled={!r.decision} onClick={() => setConfirm(true)}><Icon name="gavel" size={15} />Зафиксировать решение</button>
                    <button className="btn" onClick={saveDraft}><Icon name="save" size={15} />Сохранить черновик протокола</button>
                  </div>
                </>
              )}
            </div>
          </div>
          {log.length > 0 && <LogCard log={log} />}
        </>
      )}
      {confirm && r.decision && (
        <Modal title="Зафиксировать решение комитета?" onClose={() => setConfirm(false)}
          actions={<><button className="btn" onClick={() => setConfirm(false)}>Отмена</button><button id="btn-finalize-confirm" className="btn green" onClick={() => { setConfirm(false); finalize(); }}>Зафиксировать</button></>}>
          <div style={{ fontSize: 13.5 }}>
            <p><b>{r.decision.decision_label}</b>{r.decision.final_national ? <> — <b>{r.decision.final_national}</b>, прогноз «{r.decision.outlook_label}»</> : null}. Протокол № {r.decision.protocol} от {r.decision.date}; «за» {r.decision.votes_for} из {r.decision.voting}.</p>
            <p className="small muted">После фиксации протокол не редактируется. Изменить оценку можно только новой оценкой (пересмотром) или отзывом.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LogCard({ log }) {
  return (
    <div className="card">
      <div className="card-h"><Icon name="history" /><h3>Журнал</h3></div>
      <div className="card-b small proc-log">{log.map((l, i) => <div key={i}><span className="muted nowrap">{shortDate(l.at)}</span> {l.text}</div>)}</div>
    </div>
  );
}

function FinalView({ entry, final, log, isCurrent, onCommit, setToast, mon }) {
  const p0 = entry.process;
  const [w, setW] = useState({ date: todayRu(), reason: '', by: '' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [present, setPresent] = useState(null);
  const files = Array.isArray(p0.files) ? p0.files : [];
  const filesKey = files.map((m) => m.id).join(',');
  useEffect(() => { let alive = true; presentIds(files.map((m) => m.id)).then((s) => alive && setPresent(s)); return () => { alive = false; }; }, [filesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wErr = withdrawalCheck(entry, { ...p0, withdrawal: w });
  const withdrawn = p0.withdrawal && typeof p0.withdrawal === 'object' ? p0.withdrawal : null;
  const due = final.status === 'approved' ? isoRu(reviewDue({ outlook_code: final.outlook_code, date_iso: final.date_iso })) : null;
  const act = mon.active.find((a) => a.entry_id === entry.id);
  const doWithdraw = () => onCommit([{ ...entry, process: { ...p0, withdrawal: { ...w, at: new Date().toISOString() }, log: [...log, { at: new Date().toISOString(), text: `Оценка отозвана ${w.date} (${rawStr(w.by)}): ${rawStr(w.reason)}` }] }, status: 'withdrawn', updated_at: new Date().toISOString() }],
    <span><b>Оценка отозвана:</b> {entry.company}.</span>);
  const docsApi = {
    docs: { _protocol: files }, present, busy,
    attach: async (k, list) => {
      setBusy(k);
      const metas = [];
      for (const f of list) { try { metas.push(await putFile(f)); } catch (e) { setToast(<span><b>Файл не прикреплён:</b> {String(e.message || e)}</span>); } }
      setBusy(null);
      if (!metas.length) return;
      const next = [...files, ...metas.filter((m) => !files.some((x) => x.id === m.id))];
      onCommit([{ ...entry, process: { ...p0, files: next, log: [...log, { at: new Date().toISOString(), text: 'К протоколу прикреплено: ' + metas.map((m) => m.name).join(', ') }] }, updated_at: new Date().toISOString() }], <span><b>Прикреплено к протоколу:</b> {metas.map((m) => m.name).join(', ')}</span>);
    },
    remove: (k, id) => onCommit([{ ...entry, process: { ...p0, files: files.filter((m) => m.id !== id), log: [...log, { at: new Date().toISOString(), text: 'От протокола откреплён файл ' + ((files.find((m) => m.id === id) || {}).name || '') }] }, updated_at: new Date().toISOString() }], null),
    open: (m) => openDoc(m).catch((e) => setToast(<span><b>Ошибка:</b> {String(e.message || e)}</span>)),
  };
  return (
    <>
      <div className={'card proc-final t-' + (final.status === 'approved' && !withdrawn ? ratingTone(final.final_index) : 'none')}>
        <div className="card-h"><Icon name="gavel" /><h3>Решение комитета — протокол № {final.protocol} от {final.date}</h3></div>
        <div className="card-b">
          <div className="proc-sum">
            <div><span>Решение</span><b>{final.decision_label}</b></div>
            {final.final_national && <div><span>Оценка комитета</span><b>{final.final_national} ({final.final_internal}), прогноз «{final.outlook_label}»</b></div>}
            {final.model_national && <div><span>Оценка программы</span><b>{final.model_national}, прогноз «{OUT[final.model_outlook] ? OUT[final.model_outlook].label : '—'}»</b></div>}
            {final.final_national && <div><span>Отклонение от программы</span><b>{deviationText(final.deviation)}</b></div>}
            <div><span>Голосование</span><b>за {final.votes_for} · против {final.votes_against} · воздержались {final.votes_abstain} (голосуют {final.voting}{final.conflicts ? `, конфликт интересов: ${final.conflicts}` : ''})</b></div>
            <div><span>Председатель / проверяющий</span><b>{final.chair} / {final.check_by} ({final.check_date})</b></div>
            {due && !withdrawn && <div><span>Следующий пересмотр</span><b>до {due}{act ? ` (${daysText(act.days_left)})` : ''}</b></div>}
          </div>
          {final.rationale && <div className="small" style={{ marginTop: 8 }}><b>{final.decision === 'approve_dev' ? 'Обоснование отклонения' : final.decision === 'approve' ? 'Комментарий' : 'Причина'}:</b> {final.rationale}</div>}
          {withdrawn && <div className="capnote bad" style={{ marginTop: 10 }}>Оценка отозвана {withdrawn.date}: {withdrawn.reason} ({withdrawn.by}).</div>}
          <div className="group-t" style={{ marginTop: 12 }}>Подписанный протокол и материалы заседания</div>
          <DocsContext.Provider value={docsApi}>
            <div className="docs-panel"><div className="docs-panel-h"><AttachButton k="_protocol" label="протокол" className="btn sm">Прикрепить скан протокола</AttachButton><span className="small muted">PDF или фото подписанного протокола, материалы заседания</span></div>
              {files.length ? <DocChips k="_protocol" list={files} /> : <div className="small muted">Файлов пока нет.</div>}</div>
          </DocsContext.Provider>
          {final.status === 'approved' && !withdrawn && (
            <div style={{ marginTop: 12 }}>
              {!open ? <button className="btn danger sm" disabled={!isCurrent} title={isCurrent ? 'Отозвать действующую оценку' : 'Отозвать можно только действующую оценку компании (последнее решение)'} onClick={() => setOpen(true)}>Отозвать оценку</button> : (
                <div className="proc-withdraw">
                  <div className="group-t">Отзыв оценки</div>
                  <div className="fgrid">
                    <label className="field"><span className="lbl">Дата отзыва</span><input id="wd-date" className="inp" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} /></label>
                    <label className="field"><span className="lbl">Кто оформил (ФИО)</span><input id="wd-by" className="inp" value={w.by} onChange={(e) => setW({ ...w, by: e.target.value })} /></label>
                    <label className="field span-all"><span className="lbl">Причина отзыва</span><textarea id="wd-reason" className="inp" rows={2} value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })} placeholder="например: компания прекратила сотрудничество; недостаточно информации для мониторинга" /></label>
                  </div>
                  <ErrList errors={wErr} />
                  <div style={{ display: 'flex', gap: 8 }}><button id="btn-withdraw" className="btn danger" disabled={wErr.length > 0} onClick={doWithdraw}>Отозвать</button><button className="btn" onClick={() => setOpen(false)}>Отмена</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {log.length > 0 && <LogCard log={log} />}
    </>
  );
}

// ── Протокол для печати
export function ProtocolDoc({ entry }) {
  const p = entry.process && typeof entry.process === 'object' ? entry.process : {};
  const d = p.decision && typeof p.decision === 'object' ? p.decision : null;
  const chk = p.check || {};
  const com = p.committee || {};
  const r = committeeCheck(entry, p);
  const members = Array.isArray(com.members) ? com.members : [];
  const role = Object.fromEntries(C.roles.map((x) => [x.value, x.label]));
  const vote = Object.fromEntries(C.votes.map((x) => [x.value, x.label]));
  const chkRes = Object.fromEntries(C.check_results.map((x) => [x.value, x.label]));
  const due = d && d.status === 'approved' ? isoRu(reviewDue({ outlook_code: d.outlook_code, date_iso: d.date_iso })) : null;
  return (
    <div className="report protocol">
      <div className="rep-head"><img src={LOGO_URL} alt="" /><div><b>{BRAND_EN}</b> · {BRAND_RU}<div className="small muted">{d ? 'Протокол сформирован программой при фиксации решения' : 'ПРОЕКТ — решение не зафиксировано'}</div></div></div>
      <div className="rep-marking">{cfg.marking}</div>
      <h1>Протокол № {rawStr(com.number) || '—'} заседания рейтингового комитета</h1>
      <div className="rep-meta"><span>Дата заседания: {rawStr(com.date) || '—'}</span><span>Председатель: {d ? d.chair : (members.find((m) => m.role === 'chair') || {}).name || '—'}</span></div>
      <h2>1. Объект оценки</h2>
      <table className="tbl"><tbody>
        <tr><td>Компания</td><td><b>{entry.company || '—'}</b>{entry.inn ? ` · ИНН ${entry.inn}` : ''}</td></tr>
        <tr><td>Подсектор</td><td>{subLabel(entry)}</td></tr>
        <tr><td>Последний полный финансовый год</td><td>{entry.report_year || '—'}</td></tr>
        <tr><td>Аналитик (докладчик)</td><td>{entry.analyst || '—'}, дата оценки {entry.eval_date || '—'}</td></tr>
        <tr><td>Результат программы</td><td>{entry.calc_status === 'rated' ? <>балл {num(entry.agg, 2)} → {entry.base_national}; итоговая <b>{entry.final_national}</b> ({entry.final_internal}), прогноз «{entry.outlook_label}»</> : entry.message}</td></tr>
        <tr><td>Код расчёта</td><td className="mono small">{(entry.result_hash || '').slice(0, 16)}</td></tr>
      </tbody></table>
      <h2>2. Проверка вторым аналитиком</h2>
      <p className="small">{rawStr(chk.by) || '—'}, {rawStr(chk.date) || '—'}: {rawStr(chk.comment) ? `${chkRes[chk.result] || '—'}. ${dot(rawStr(chk.comment))}` : dot(chkRes[chk.result] || '—')}</p>
      <h2>3. Состав комитета и голосование</h2>
      <table className="tbl"><thead><tr><th>№</th><th>ФИО</th><th>Роль</th><th>Конфликт интересов</th><th>Голос</th></tr></thead>
        <tbody>{members.map((m, i) => <tr key={i}><td>{i + 1}</td><td>{m.name}</td><td>{role[m.role] || role.member}</td><td>{m.conflict === true ? 'заявлен — не голосует' : 'нет'}</td><td>{m.conflict === true ? '—' : vote[m.vote] || '—'}</td></tr>)}</tbody></table>
      <p className="small">Голосуют {r.voting} (кворум — не меньше {C.quorum}); «за» {r.votes.for}, «против» {r.votes.against}, «воздержались» {r.votes.abstain}. Решение принимается, если «за» больше половины голосующих.</p>
      <h2>4. Решение</h2>
      {d ? (
        <>
          <p><b>{d.decision_label}</b>{d.final_national ? <>: <b>{d.final_national}</b> ({d.final_internal}), прогноз «{d.outlook_label}».</> : '.'}</p>
          {d.final_national && <p className="small">Отклонение от оценки программы: {dot(deviationText(d.deviation))}{d.deviation ? ' Отклонение обосновано комитетом (см. ниже).' : ''}</p>}
          {d.rationale && <p className="small">{d.decision === 'approve_dev' ? 'Обоснование' : d.decision === 'approve' ? 'Комментарий' : 'Причина'}: {dot(d.rationale)}</p>}
          {due && <p className="small">Следующий пересмотр — не позднее {due}{d.outlook_code === 'REVIEW' ? ` (прогноз «На пересмотре»: ${C.watch_review_days} дней)` : ` (${C.review_months} месяцев после решения)`}.</p>}
          {p.withdrawal && <p className="small"><b>Оценка отозвана {p.withdrawal.date}</b>: {String(p.withdrawal.reason || '').replace(/[.\s]+$/, '')} ({p.withdrawal.by}).</p>}
        </>
      ) : <><p className="small">Решение не зафиксировано.</p><ul className="small">{[...r.errors_check, ...r.errors_committee].map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      <div className="sign-row"><div>Председатель комитета<span /></div><div>Секретарь комитета<span /></div></div>
      <div className="rep-foot small muted">{cfg.marking}.</div>
    </div>
  );
}

export function protocolHtml(entry) {
  const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const body = renderToStaticMarkup(<ProtocolDoc entry={entry} />);
  return `<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>Протокол — ${(entry.company || '').replace(/</g, '')}</title><style>${css}</style><style>body{background:#eef2f8;padding:24px}.report{margin:0 auto}@media print{body{padding:0;background:#fff}}</style></head><body>${body}</body></html>`;
}
function printProtocol(entry) {
  const name = (entry.company || 'company').replace(/[^\wа-яёөүң\-]+/gi, '_');
  const num0 = rawStr((entry.process && entry.process.committee && entry.process.committee.number) || '').replace(/[^\wа-яёөүң\-]+/gi, '_');
  download(`protokol_${num0 || 'proekt'}_${name}.html`, protocolHtml(entry), 'text/html');
}
