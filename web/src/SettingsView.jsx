import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cfg, normalizeSettings, parseNum, canonical, subsectorParams, defaultSettings, BOUND_KEYS, nbkrExtract, fmtPct, NBKR_SECTORS, NBKR_SECTOR_NAMES, NBKR_DEFAULT_MAP } from './engine.js';
import { xlsxSheets } from './xlsx.js';
import { Icon } from './ui.jsx';
import { num } from './format.js';
import { SubsectorProfile, boundsError } from './SubsectorView.jsx';

const HEAD = ['Лучшая точка (0,5)', 'Aaa | Aa', 'Aa | A', 'A | Baa', 'Baa | Ba', 'Ba | B', 'B | Caa', 'Caa | Ca', 'Худшая точка (20,5)'];
const LABELS = {
  rev: ['1.1 Выручка за год', 'млн сом'], nat: ['1.6 Натуральный объём', ''], margin: ['3.1 Маржа EBITDA (среднее за 3 года)', '%'], mpm: ['3.2 Максимальное падение маржи', '%'],
  de: ['4.1 Debt / EBITDA', 'x'], ic: ['4.2 EBITDA / проценты', 'x'], rcf: ['4.3 RCF / чистый долг', '%'], liq: ['4.4 Покрытие ликвидности', 'x'],
  overdue: ['6.1 Максимальная просрочка за 36 месяцев', 'дней'], payables: ['6.2 Просроченная кредиторская задолженность', '%'],
};
const ROW_ORDER = ['rev', 'nat', 'margin', 'mpm', 'de', 'ic', 'rcf', 'liq', 'overdue', 'payables'];
const shown = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v ?? '');
const dirOf = (k) => (k === 'nat' || k === 'margin' ? 'higher' : cfg.metrics[k].dir);

function expand(settings, c) {
  const p = subsectorParams(settings, c);
  const d = { weights: {}, bounds: {} };
  for (const sf of cfg.subfactors) d.weights[sf.code] = shown(p.weights[sf.code]);
  for (const k of BOUND_KEYS) d.bounds[k] = p.bounds[k].map(shown);
  if (p.margin) d.margin = p.margin.map(shown);
  if (p.nat) d.nat = p.nat.map(shown);
  d.market_rate = shown(p.market_rate);
  d._mr0 = d.market_rate;          // как было при открытии
  d._mrOwn = p.changed.market;      // своя ставка подсектора или общая
  d.nbkr_sector = p.nbkr_sector || '';
  return d;
}
function toRaw(d) {
  const r = { weights: {}, bounds: {} };
  for (const sf of cfg.subfactors) r.weights[sf.code] = parseNum(d.weights[sf.code]);
  for (const k of BOUND_KEYS) r.bounds[k] = d.bounds[k].map(parseNum);
  if (d.margin) r.margin = d.margin.map(parseNum);
  if (d.nat) r.nat = d.nat.map(parseNum);
  // ставку подсектора сохраняем, только если она своя или её изменили (иначе подсектор следует общей ставке)
  if (d._mrOwn || String(d.market_rate) !== String(d._mr0)) r.market_rate = parseNum(d.market_rate);
  if (d.nbkr_sector) r.nbkr_sector = d.nbkr_sector;
  return r;
}
function draftErrors(d) {
  const e = {};
  const ws = cfg.subfactors.map((sf) => parseNum(d.weights[sf.code]));
  if (ws.some((x) => x === null || x < 0)) e.weights = 'вес должен быть числом не меньше 0';
  else if (ws.reduce((a, x) => a + x, 0) <= 0) e.weights = 'сумма весов должна быть больше 0';
  for (const k of BOUND_KEYS) { const m = boundsError(d.bounds[k], dirOf(k)); if (m) e[k] = m; }
  if (d.margin) { const m = boundsError(d.margin, 'higher'); if (m) e.margin = m; }
  if (d.nat) { const m = boundsError(d.nat, 'higher'); if (m) e.nat = m; }
  const mr = parseNum(d.market_rate);
  if ((d._mrOwn || String(d.market_rate) !== String(d._mr0)) && (mr === null || mr < 0.1 || mr > 100)) e.market_rate = 'рыночная ставка — число от 0,1 до 100%';
  return e;
}

export default function SettingsView({ settings, mode, onApply, onReset, onExport, onImport, currentSub, ctx }) {
  const [code, setCode] = useState(currentSub && cfg.subsectors[currentSub] ? currentSub : cfg.subsector_order[0]);
  const [drafts, setDrafts] = useState({});
  const mk0 = () => ({ market_rate: shown(settings.market_rate), low_rate_share: shown(settings.low_rate_share), nbkr: settings.nbkr || null });
  const [market, setMarket] = useState(mk0);
  const [nbErr, setNbErr] = useState(null);
  const [nbBusy, setNbBusy] = useState(false);
  const loadBulletin = async (file) => {
    setNbErr(null); setNbBusy(true);
    try {
      const sheets = await xlsxSheets(await file.arrayBuffer(), ['Титул', 'IV.2.19', 'IV.2.22']);
      const nb = nbkrExtract(sheets, file.name);
      setMarket((m) => ({ ...m, nbkr: nb }));
    } catch (e) { setNbErr(String(e && e.message ? e.message : e)); }
    setNbBusy(false);
  };
  const fileRef = useRef(null);
  useEffect(() => { setDrafts({}); setMarket(mk0()); }, [settings]);

  const draftOf = (c) => drafts[c] || expand(settings, c);
  const d = draftOf(code);
  const setD = (fn) => setDrafts((all) => ({ ...all, [code]: fn(all[code] || expand(settings, code)) }));
  const meth = subsectorParams(defaultSettings(), code);
  const s = cfg.subsectors[code];

  // все правки → настройки
  const errsBySub = useMemo(() => Object.fromEntries(Object.keys(drafts).map((c) => [c, draftErrors(drafts[c])]).filter(([, e]) => Object.keys(e).length > 0)), [drafts]);
  const [norm, notes] = useMemo(() => {
    const raw = { subsectors: { ...settings.subsectors }, market_rate: parseNum(market.market_rate), low_rate_share: parseNum(market.low_rate_share), nbkr: market.nbkr };
    for (const c of Object.keys(drafts)) raw.subsectors[c] = toRaw(drafts[c]);
    return normalizeSettings(raw);
  }, [drafts, market, settings]);
  const marketBad = !(parseNum(market.market_rate) >= 0.1 && parseNum(market.market_rate) <= 100) || !(parseNum(market.low_rate_share) >= 1 && parseNum(market.low_rate_share) <= 100);
  const hasErr = Object.keys(errsBySub).length > 0 || marketBad;
  const dirty = canonical(norm) !== canonical(settings);
  const errs = errsBySub[code] || {};

  const wsum = cfg.subfactors.reduce((a, sf) => a + (parseNum(d.weights[sf.code]) ?? 0), 0);
  const setW = (k, v) => setD((x) => ({ ...x, weights: { ...x.weights, [k]: v } }));
  const setB = (k, i, v) => setD((x) => {
    if (k === 'margin' || k === 'nat') { const a = [...x[k]]; a[i] = v; return { ...x, [k]: a }; }
    const a = [...x.bounds[k]]; a[i] = v; return { ...x, bounds: { ...x.bounds, [k]: a } };
  });
  const rowVals = (k) => (k === 'margin' || k === 'nat' ? d[k] : d.bounds[k]);
  const methVals = (k) => (k === 'margin' || k === 'nat' ? meth[k] : meth.bounds[k]);
  const resetRow = (k) => setD((x) => (k === 'margin' || k === 'nat' ? { ...x, [k]: meth[k].map(shown) } : { ...x, bounds: { ...x.bounds, [k]: meth.bounds[k].map(shown) } }));
  const resetSub = () => setDrafts((all) => {
    const x = expand(defaultSettings(), code);
    const g = shown(parseNum(market.market_rate) ?? settings.market_rate);
    return { ...all, [code]: { ...x, market_rate: g, _mr0: g, _mrOwn: false } };
  });
  const mrOwn = d._mrOwn || String(d.market_rate) !== String(d._mr0);
  const nbOn = !!market.nbkr && !!(d.nbkr_sector || (code !== 'INT' && NBKR_DEFAULT_MAP[code]));
  const mrShown = mrOwn ? d.market_rate : nbOn ? '' : market.market_rate;
  const nbYears = market.nbkr ? Object.keys(market.nbkr.new.years).sort() : [];
  const nbLast = nbYears.length ? nbYears[nbYears.length - 1] : null;
  const secNow = d.nbkr_sector || (code !== 'INT' ? NBKR_DEFAULT_MAP[code] : '') || '';
  const nbRateNow = market.nbkr && nbLast && secNow && market.nbkr.new.years[nbLast][secNow] ? market.nbkr.new.years[nbLast][secNow][0] : null;
  const copyWeights = () => setDrafts((all) => {
    const next = { ...all };
    for (const c of cfg.subsector_order) { const x = next[c] || expand(settings, c); next[c] = { ...x, weights: { ...d.weights } }; }
    return next;
  });
  const subState = (c) => {
    const applied = !!settings.subsectors[c];
    const pending = canonical(norm.subsectors[c] || null) !== canonical(settings.subsectors[c] || null);
    return { applied, pending, changed: !!norm.subsectors[c] };
  };
  const rows = ROW_ORDER.filter((k) => (k === 'margin' || k === 'nat' ? !!d[k] : true));

  return (
    <div className="settings">
      <div className="callout">
        <b>Веса, пороги и рыночная ставка задаются для каждого подсектора.</b> Когда в профиле компании выбран подсектор, программа сама берёт его веса, пороги и рыночную ставку отсюда; для агрохолдинга пороги натурального объёма и маржи берутся из подсекторов его сегментов.
        По умолчанию действуют значения методологии: веса одинаковы для всех подсекторов, различия заданы порогами (натуральный объём, группа маржи, сезонность, сырьё, стресс). Изменения отмечаются в отчёте и сохраняются вместе с оценкой в архиве — сохранённые оценки пересчитываются по своим настройкам. Пороги метрических индикаторов (доли, баллы проверок) задаются методологией и здесь не меняются.
        <div className="small muted" style={{ marginTop: 6 }}>{mode === 'server' ? 'Настройки хранятся в файле на сервере.' : 'Настройки хранятся в этом браузере; перенести на другой компьютер — «Скачать / Загрузить настройки».'}</div>
      </div>
      <div className="toolbar">
        <button id="btn-apply-settings" className="btn green" onClick={() => onApply(norm)} disabled={!dirty || hasErr}><Icon name="check" size={16} />Применить</button>
        <button className="btn" onClick={() => { setDrafts({}); setMarket(mk0()); setNbErr(null); }} disabled={!dirty && !hasErr}>Отменить изменения</button>
        <button className="btn" onClick={onReset}><Icon name="reset" size={16} />Вернуть методологию для всех</button>
        <button className="btn" onClick={onExport}><Icon name="download" size={16} />Скачать настройки</button>
        <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="upload" size={16} />Загрузить настройки</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { onImport(e); e.target.value = ''; }} />
      </div>
      {hasErr && <div className="callout red small">Нельзя применить: исправьте значения, отмеченные красным{Object.keys(errsBySub).length ? ' — подсекторы: ' + Object.keys(errsBySub).map((c) => cfg.subsectors[c].name).join(', ') : ''}{marketBad ? '; рыночная ставка 0,1–100%, порог 1–100%' : ''}.</div>}
      {!hasErr && dirty && <div className="callout yellow small">Есть неприменённые изменения — нажмите «Применить».</div>}
      {!hasErr && dirty && notes.length > 0 && <div className="callout warn small">{notes.map((n, i) => <div key={i}>{n}</div>)}</div>}

      <div className="settings-grid">
        <div className="card settings-subs">
          <div className="card-h"><h3>Подсектор</h3></div>
          <div className="card-b">
            {cfg.subsector_order.map((c) => {
              const st = subState(c);
              return (
                <button key={c} className={'sub-btn' + (c === code ? ' active' : '')} onClick={() => setCode(c)} data-sub={c}>
                  <span>{cfg.subsectors[c].icon}</span><span style={{ flex: 1 }}>{cfg.subsectors[c].name}</span>
                  {st.pending ? <span className="chip yellow">не применено</span> : st.applied ? <span className="chip yellow">изменён</span> : null}
                  {c === currentSub && <span className="chip blue">текущая компания</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-main">
          <div className="card">
            <div className="card-h">
              <div><div className="eyebrow">Подсектор</div><h2 style={{ margin: 0 }}>{s.icon} {s.name}</h2></div>
              <div className="actions" style={{ marginLeft: 'auto' }}>
                <button className="btn sm" onClick={resetSub}><Icon name="reset" size={14} />Методология для подсектора</button>
              </div>
            </div>
            <div className="card-b">
              <SubsectorProfile code={code} settings={norm} ctx={ctx && ctx.main === code ? ctx : null} title="Правила, которые программа применяет к подсектору" />
            </div>
          </div>

          <div className="card" id="sub-market-rate">
            <div className="card-h"><h3>Рыночная ставка для подсектора: нормализация процентов (4.2–4.4)</h3></div>
            <div className="card-b">
              <p className="small muted" style={{ marginTop: 0 }}>Средневзвешенная ставка по кредитам в сомах для этого вида деятельности. Если компания платит меньше {shown(parseNum(market.low_rate_share) ?? settings.low_rate_share)}% ключевой ставки НБКР или не платит проценты при наличии долга, проценты для 4.2–4.4 и прогноза считаются по этой ставке. Если аналитик указал в профиле компании ставку для отрасли с источником, берётся она.{code === 'INT' ? ' Агрохолдинг без своей ставки: ставка = Σ доля сегмента × ставка его подсектора.' : ''}</p>
              <div className="fgrid">
                <label className="field"><span className="lbl">Своя рыночная ставка подсектора, %{mrOwn ? '' : nbOn ? ' — не задана: действует бюллетень НБКР' : ' — сейчас общая для всех подсекторов'}</span>
                  <span className="inp-wrap"><input id="f-sub-market-rate" className={'inp num' + (mrOwn && parseNum(d.market_rate) !== parseNum(market.market_rate) ? ' filled changed' : '') + (errs.market_rate ? ' err' : '')} value={mrShown ?? ''}
                    onChange={(e) => setD((x) => ({ ...x, market_rate: e.target.value }))} placeholder={nbOn ? 'из бюллетеня' : ''} aria-label="Рыночная ставка подсектора" /><span className="unit">%</span></span></label>
                <label className="field"><span className="lbl">Отрасль в бюллетене НБКР (табл. IV.2.19)</span>
                  <select id="f-sub-nbkr-sector" className={'inp' + (d.nbkr_sector && d.nbkr_sector !== (NBKR_DEFAULT_MAP[code] || '') ? ' filled changed' : '')} value={secNow}
                    onChange={(e) => setD((x) => ({ ...x, nbkr_sector: e.target.value }))}>
                    {code === 'INT' && <option value="">по долям сегментов (по умолчанию)</option>}
                    {NBKR_SECTORS.map(([k]) => <option key={k} value={k}>{NBKR_SECTOR_NAMES[k]}{k === NBKR_DEFAULT_MAP[code] ? ' (по умолчанию)' : ''}</option>)}
                  </select></label>
                <div className="small muted" style={{ alignSelf: 'end' }} id="sub-market-now">{mrOwn ? 'Своя ставка подсектора важнее бюллетеня НБКР. ' : nbOn ? `${market.nbkr.title}: ставка за отчётный год компании` + (nbRateNow !== null ? `, ${nbLast} г. — ${fmtPct(nbRateNow)}%. ` : '. ') : market.nbkr && code === 'INT' ? 'Из бюллетеня — по долям сегментов. ' : 'Бюллетень НБКР не загружен. '}Общая ставка: {shown(market.market_rate)}% (методология: 16%).{' '}
                  {mrOwn && <button type="button" className="linklike" onClick={() => setD((x) => ({ ...x, market_rate: shown(parseNum(market.market_rate) ?? settings.market_rate), _mr0: shown(parseNum(market.market_rate) ?? settings.market_rate), _mrOwn: false }))}>Убрать свою ставку</button>}</div>
              </div>
              {errs.market_rate && <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>✕ {errs.market_rate}</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Веса подфакторов, %</h3>
              <span className={'chip ' + (Math.abs(wsum - 100) < 1e-9 ? 'green' : 'yellow')} style={{ marginLeft: 'auto' }}>сумма {num(wsum, 1)}%{Math.abs(wsum - 100) < 1e-9 ? '' : ' — будут пересчитаны пропорционально до 100%'}</span>
              <button className="btn sm" onClick={copyWeights} title="Записать эти веса во все 13 подсекторов (нужно нажать «Применить»)"><Icon name="copy" size={14} />Эти веса — во все подсекторы</button>
            </div>
            <div className="card-b">
              {errs.weights && <div className="small" style={{ color: 'var(--danger)', marginBottom: 6 }}>✕ {errs.weights}</div>}
              <div className="wgrid">
                {cfg.subfactors.map((sf) => {
                  const v = parseNum(d.weights[sf.code]);
                  const ch = v !== meth.weights[sf.code];
                  return (
                    <label key={sf.code} className="wcell">
                      <span><span className="mono">{sf.code}</span> {sf.name} <span className="muted small">(метод. {meth.weights[sf.code]}%)</span></span>
                      <span className="inp-wrap"><input className={'inp num sm' + (ch ? ' filled changed' : '') + (v === null || v < 0 ? ' err' : '')} value={d.weights[sf.code] ?? ''}
                        onChange={(e) => setW(sf.code, e.target.value)} aria-label={'Вес ' + sf.code} /><span className="unit">%</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Пороги количественных показателей</h3></div>
            <div className="card-b">
              <p className="small muted" style={{ marginTop: 0 }}>Девять точек: крайняя лучшая (0,5 балла), семь границ категорий, крайняя худшая (20,5). Для «больше = лучше» точки убывают слева направо, для «меньше = лучше» — возрастают. Между точками балл считается плавно.{code === 'INT' ? ' Для агрохолдинга пороги 1.6 и 3.1 берутся из подсекторов его сегментов.' : ''}{code === 'FSH' ? ' Рыбное хозяйство: по методологии маржа — группа III, при рыбопереработке от 50% выручки — группа II; если пороги маржи изменены здесь, они действуют в обоих случаях.' : ''}</p>
              <div className="tbl-wrap"><table className="tbl bounds-tbl">
                <thead><tr><th>Показатель</th>{HEAD.map((h) => <th key={h} className="c small">{h}</th>)}<th /></tr></thead>
                <tbody>
                  {rows.map((k) => {
                    const vals = rowVals(k);
                    const mv = methVals(k);
                    const ch = vals.some((x, i) => parseNum(x) !== mv[i]);
                    const unit = k === 'nat' ? s.nat.unit : LABELS[k][1];
                    return (
                      <React.Fragment key={k}>
                        <tr className={errs[k] ? 'has-err' : ''}>
                          <td className="small"><b>{LABELS[k][0]}</b>{unit ? `, ${unit}` : ''}{k === 'nat' ? <div className="muted">{s.nat.label}</div> : null}<div className="muted">{dirOf(k) === 'higher' ? 'больше — лучше' : 'меньше — лучше'}</div>{ch ? <span className="chip yellow">изменено</span> : null}</td>
                          {vals.map((v, i) => (
                            <td key={i}><input className={'inp num sm' + (parseNum(v) !== mv[i] ? ' changed' : '') + (parseNum(v) === null ? ' err' : '')} value={v} title={'методология: ' + shown(mv[i])}
                              onChange={(e) => setB(k, i, e.target.value)} aria-label={LABELS[k][0] + ': ' + HEAD[i]} /></td>
                          ))}
                          <td><button className="btn sm ghost" disabled={!ch} onClick={() => resetRow(k)} title="Вернуть пороги методологии">↺</button></td>
                        </tr>
                        {errs[k] && <tr><td colSpan={11} className="small" style={{ color: 'var(--danger)' }}>✕ {errs[k]}</td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table></div>
              <p className="small muted">Значения методологии видны в подсказке при наведении на поле. Изменённые поля подсвечены.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Общие параметры: рыночная ставка по умолчанию и порог нормализации процентов (4.2–4.4)</h3></div>
            <div className="card-b fgrid">
              <label className="field"><span className="lbl">Рыночная ставка для подсекторов без своей ставки, % (методология: 16)</span><span className="inp-wrap"><input className={'inp num' + (parseNum(market.market_rate) !== 16 ? ' filled changed' : '')} value={market.market_rate} onChange={(e) => setMarket((m) => ({ ...m, market_rate: e.target.value }))} /><span className="unit">%</span></span></label>
              <label className="field"><span className="lbl">Порог нормализации: доля ключевой ставки НБКР, % (методология: 50)</span><span className="inp-wrap"><input className={'inp num' + (parseNum(market.low_rate_share) !== 50 ? ' filled changed' : '')} value={market.low_rate_share} onChange={(e) => setMarket((m) => ({ ...m, low_rate_share: e.target.value }))} /><span className="unit">%</span></span></label>
            </div>
          </div>

          <NbkrCard nb={market.nbkr} busy={nbBusy} err={nbErr} onFile={loadBulletin} onClear={() => { setMarket((m) => ({ ...m, nbkr: null })); setNbErr(null); }} />
        </div>
      </div>
    </div>
  );
}

// Бюллетень НБКР: загрузка файла и ставки по отраслям (табл. IV.2.19, справочно IV.2.22)
function NbkrCard({ nb, busy, err, onFile, onClear }) {
  const ref = React.useRef(null);
  const ys = nb ? Object.keys(nb.new.years).sort() : [];
  const ms = nb ? Object.keys(nb.new.months).sort() : [];
  const last3 = ys.slice(-3);
  const ly = ys.length ? ys[ys.length - 1] : null;
  const tot = nb && ly && nb.new.years[ly].total ? nb.new.years[ly].total[1] : null;
  const subsBy = (k) => cfg.subsector_order.filter((c) => NBKR_DEFAULT_MAP[c] === k).map((c) => cfg.subsectors[c].name.toLowerCase());
  return (
    <div className="card" id="nbkr-card">
      <div className="card-h"><h3>Бюллетень НБКР: рыночные ставки по отраслям</h3></div>
      <div className="card-b">
        <p className="small muted" style={{ marginTop: 0 }}>Скачайте свежий бюллетень с сайта НБКР (файл Excel) и загрузите его сюда. Программа возьмёт из таблицы IV.2.19 средневзвешенные ставки по <b>вновь выданным кредитам в сомах</b> по отраслям и для каждой компании подберёт ставку <b>за её отчётный период</b>: за год — годовую, для LTM и промежуточной отчётности — среднее помесячных ставок за нужные месяцы (так НБКР считает и годовую ставку: LTM на 31.12 равна годовой). Порядок: ставка аналитика с источником → своя ставка подсектора → бюллетень → общая ставка. После загрузки нажмите «Применить».</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={ref} type="file" id="nbkr-file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = ''; }} />
          <button type="button" className="btn" id="btn-nbkr-load" onClick={() => ref.current && ref.current.click()} disabled={busy}>{busy ? 'Читаю файл…' : nb ? 'Загрузить новый бюллетень' : 'Загрузить бюллетень НБКР (.xls, .xlsx)'}</button>
          {nb && <button type="button" className="btn" id="btn-nbkr-clear" onClick={onClear}>Убрать бюллетень</button>}
          {nb && <span className="small" id="nbkr-status"><b>{nb.title}</b>{nb.file ? ` (${nb.file})` : ''} · годовые ставки {ys[0]}–{ly} · помесячные до {ms.length ? ms[ms.length - 1].slice(5, 7) + '.' + ms[ms.length - 1].slice(0, 4) : '—'}</span>}
        </div>
        {err && <div className="callout warn small" id="nbkr-error" style={{ marginTop: 10 }}>✕ {err}</div>}
        {nb && (
          <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl" id="nbkr-table">
            <thead><tr><th>Отрасль (IV.2.19)</th>{last3.map((y) => <th key={y} className="num">Новые кредиты, {y}</th>)}{ly && <th className="num">Портфель на конец {ly} (IV.2.22), справочно</th>}<th>Подсекторы по умолчанию</th></tr></thead>
            <tbody>
              {NBKR_SECTORS.map(([k]) => {
                const e = ly ? nb.new.years[ly][k] : null;
                const thin = e && tot && k !== 'total' && e[1] / tot < 0.01;
                const pe = ly && nb.port.years[ly] ? nb.port.years[ly][k] : null;
                return (
                  <tr key={k}>
                    <td>{NBKR_SECTOR_NAMES[k]}{thin && <div className="small" style={{ color: 'var(--warn, #b7791f)' }}>⚠ мало выдач: {fmtPct(e[1] / tot * 100)}% всех кредитов — ставка неустойчива</div>}</td>
                    {last3.map((y) => <td key={y} className="num">{nb.new.years[y][k] ? num(nb.new.years[y][k][0], 2) + '%' : '—'}</td>)}
                    {ly && <td className="num muted">{pe ? num(pe[0], 2) + '%' : '—'}</td>}
                    <td className="small muted">{k === 'total' ? '' : subsBy(k).join(', ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        {nb && <p className="small muted">Агрохолдинг — по долям сегментов. Отрасль для подсектора меняется в его карточке выше («Отрасль в бюллетене НБКР»). Ставка портфеля показана только для сравнения: в нормализации не участвует.</p>}
      </div>
    </div>
  );
}
