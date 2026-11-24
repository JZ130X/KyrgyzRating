import React, { useContext, useMemo, useState } from 'react';
import { cfg, fieldVisible, parseNum, gardenPhase, isNum, fmtPct, MARKET_SRC } from './engine.js';
import { Field, Icon, Tag, Toggle, DocsPanel, PeriodContext, PeriodChip } from './ui.jsx';
import { periodChecks } from './engine.js';
import { periodText, groupPeriod } from './period.js';
import { isoRu } from './process.js';
import { num, isN, catTone, ratingTone } from './format.js';
import { SF, IND, FIELDS, subName, fmtVal, mlnSom, indValue, sfValue, indicatorGroups, POINT_LABELS, DEBT_MODE, TAX_SRC, RESTR_TYPE, adjText, blockStats, STATUS_TEXT, ratingMeaning } from './labels.js';
import { BlockBars } from './charts.jsx';
import { SubsectorProfile } from './SubsectorView.jsx';

const sfOfGroup = (g) => { const m = /^(\d\.\d)/.exec(g || ''); return m ? m[1] : null; };
const groupsOf = (card) => {
  const out = [];
  for (const f of cfg.fields) if (f.card === card && !out.includes(f.group)) out.push(f.group);
  if (card === 'profile' && out.includes('Подсектор') && out.includes('Выручка по видам деятельности')) {
    // доли выручки агрохолдинга — сразу под выбором подсектора
    out.splice(out.indexOf('Выручка по видам деятельности'), 1);
    out.splice(out.indexOf('Подсектор') + 1, 0, 'Выручка по видам деятельности');
  }
  return out;
};
const matches = (f, q) => q && (f.label.toLowerCase().includes(q) || (f.hint || '').toLowerCase().includes(q) || (f.doc || '').toLowerCase().includes(q));

function FieldList({ fields, form, set, search, wide }) {
  return (
    <div className={'fgrid' + (wide ? ' wide' : '')}>
      {fields.map((f) => {
        const indOk = f.type === 'source' && f.ind ? null : null;
        return <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => set(f.key, v)} highlight={matches(f, search)} warn={indOk}
          className={f.type === 'bool' ? 'span-all' : f.type === 'source' ? 'src-field' : ''} />;
      })}
    </div>
  );
}

// «Один источник для всех»: копирует первый заполненный источник (и его документы) в пустые поля группы
function SourceFill({ keys, form, setMany }) {
  const firstKey = keys.find((k) => typeof form[k] === 'string' && form[k].trim() !== '');
  const first = firstKey ? form[firstKey] : null;
  const empty = keys.filter((k) => !(typeof form[k] === 'string' && form[k].trim() !== ''));
  if (keys.length < 2 || !first || empty.length === 0) return null;
  const apply = () => {
    const upd = Object.fromEntries(empty.map((k) => [k, first]));
    const docs = form.docs && typeof form.docs === 'object' ? form.docs : {};
    const src = Array.isArray(docs[firstKey]) ? docs[firstKey] : [];
    if (src.length) {
      const d = { ...docs };
      for (const k of empty) if (!(Array.isArray(d[k]) && d[k].length)) d[k] = src.map((m) => ({ ...m }));
      upd.docs = d;
    }
    setMany(upd);
  };
  return (
    <button className="btn sm" onClick={apply} title="Подставить первый указанный источник и его документы во все пустые поля «Источник» этого подфактора">
      <Icon name="copy" size={14} />Один источник для всех ({empty.length})
    </button>
  );
}

export function IndicatorTable({ inds, compact }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl ind-tbl">
        <thead><tr><th>Индикатор</th><th className="r">Вес</th><th className="r">Значение</th><th>Категория</th><th className="r">Балл</th>{!compact && <th>Примечание</th>}</tr></thead>
        <tbody>
          {inds.map((i) => (
            <tr key={i.code} className={i.na ? 'muted' : ''}>
              <td><span className="mono small">{i.code}</span> {i.name}</td>
              <td className="r">{i.w}%</td>
              <td className="r nowrap">{indValue(i)}</td>
              <td>{i.na ? '—' : i.missing ? <span className="tag t-none">нет данных</span> : <Tag cat={i.cat} />}</td>
              <td className="r">{i.na ? '—' : num(i.score, 0)}</td>
              {!compact && <td className="small">{i.note || (i.na ? '' : !i.src && !i.missing ? '' : i.missing && !i.src ? 'нет источника' : i.missing ? 'нет значения' : '')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CapList({ caps }) {
  const act = (caps || []).filter((c) => !c.inactive);
  if (!act.length) return null;
  return (
    <div className="caplist">
      {act.map((c, i) => <div key={i} className="capnote"><Icon name="warn" size={14} /> {c.text}</div>)}
    </div>
  );
}

function SfBox({ code, result, children, extra, tools }) {
  const s = result.sf[code];
  const d = SF[code];
  const isMetric = d.type === 'metric';
  return (
    <section className="sfbox" id={'sf-' + code}>
      <div className="sfbox-h">
        <span className="sf-code">{code}</span>
        <div className="sf-title"><b>{d.name}</b><span className="muted small"> · вес {num(s.weight, 0)}% · {d.type === 'quant' ? 'количественный' : d.type === 'decision' ? 'таблица решений' : 'метрический'}</span></div>
        <div className="sf-score">
          {s.all_default && <span className="tag t-none" title="Нет данных — балл по умолчанию">нет данных</span>}
          <span className={'score-pill t-' + catTone(s.cat_score)}>{num(s.score, 2)} · {s.cat_score}</span>
        </div>
      </div>
      {tools && <div className="sfbox-tools">{tools}</div>}
      <div className="sfbox-b">
        {children}
        {extra}
        {isMetric && indicatorGroups(s).map(([lbl, inds], k) => (
          <div key={k} className="ind-group">{lbl && <div className="group-t">{lbl}</div>}<IndicatorTable inds={inds} /></div>
        ))}
        <CapList caps={s.caps} />
      </div>
    </section>
  );
}

// ── Таблица «по годам»
function YearTable({ form, set, ctx, result }) {
  const ry = parseNum(form.report_year);
  const rows = cfg.year_rows.filter((r) => !r.when || r.when.every((t) => (t === 'garden' ? ctx.garden : true)));
  const colLabel = (y) => {
    const base = isN(ry) ? String(ry - y) : cfg.year_labels[y];
    if (y === 0 && ctx.fy_type === 'interim') return base + ' (промежут.)';
    if (y === 0 && ctx.fy_type === 'ltm') return 'LTM';
    return base;
  };
  const series = result.series || [];
  return (
    <div className="tbl-wrap yt-wrap">
      <table className="tbl yt">
        <thead>
          <tr><th>Показатель, сом</th>{[0, 1, 2, 3, 4].map((y) => <th key={y} className="r">{colLabel(y)}<div className="small muted">{cfg.year_labels[y]}</div></th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td title={r.hint}><b>{r.label}</b><div className="small muted">{r.doc}</div></td>
              {[0, 1, 2, 3, 4].map((y) => (
                <td key={y}>{y < r.years ? <Field bare def={FIELDS[r.key + '_' + y]} value={form[r.key + '_' + y]} onChange={(v) => set(r.key + '_' + y, v)} noUnit placeholder="" /> : <span className="muted small">—</span>}</td>
              ))}
            </tr>
          ))}
          <tr className="calc">
            <td><b>EBITDA</b><div className="small muted">операционная прибыль + амортизация − переоценка − разовые доходы{ctx.garden ? ' + затраты на молодые сады' : ''}</div></td>
            {[0, 1, 2, 3, 4].map((y) => { const s = series.find((x) => x.year === y); return <td key={y} className="r mono">{s ? num(s.ebitda / 1e6, 1) + ' млн' : '—'}</td>; })}
          </tr>
          <tr className="calc">
            <td><b>Маржа EBITDA</b><div className="small muted">для 3.1 и 3.2: годы подряд от последнего</div></td>
            {[0, 1, 2, 3, 4].map((y) => { const s = series.find((x) => x.year === y); return <td key={y} className="r mono">{s ? num(s.margin, 1) + '%' : '—'}</td>; })}
          </tr>
        </tbody>
      </table>
      {ctx.annualized && <div className="small muted" style={{ marginTop: 6 }}>Суммы последнего периода умножаются на {num(ctx.ann, 2)} (пересчёт промежуточной отчётности в годовую). Вводите фактические суммы за период.</div>}
    </div>
  );
}

// ── Доли выручки по видам деятельности
function Shares({ form, set, ctx, search }) {
  const tot = cfg.segment_subs.reduce((a, c) => a + (parseNum(form['sh_' + c]) || 0), 0);
  return (
    <div>
      <div className="shares">
        {cfg.segment_subs.map((c) => (
          <div key={c} className={'share-cell' + (ctx.segs.includes(c) ? ' on' : '')}>
            <span className="share-ic">{cfg.subsectors[c].icon}</span>
            <span className="share-name">{cfg.subsectors[c].name}</span>
            <Field bare def={FIELDS['sh_' + c]} value={form['sh_' + c]} onChange={(v) => set('sh_' + c, v)} placeholder="0" highlight={matches(FIELDS['sh_' + c], search)} />
          </div>
        ))}
      </div>
      <div className={'callout ' + (ctx.main ? '' : 'warn')} style={{ marginTop: 10 }}>
        {ctx.sub_selected === 'INT' ? (
          ctx.main ? <>Сумма долей: <b>{num(tot, 1)}%</b>. Подсекторные шкалы применяются к сегментам от 10% выручки: {ctx.segs.map((c) => `${cfg.subsectors[c].name} (${num(ctx.shares[c], 1)}%)`).join(', ')}. Группа маржи — смешанная по долям групп{ctx.seasonal ? '; действует правило сезонного долга' : ''}.</>
            : <>Укажите доли выручки по видам деятельности (без продаж внутри группы): по ним выделяются сегменты агрохолдинга и смешиваются шкалы.</>
        ) : ctx.main ? <>Подсектор не выбран. По долям выручки (правило А.2) компания относится к подсектору <b>{ctx.main === 'INT' ? 'Интегрированный агрохолдинг' : cfg.subsectors[ctx.main].name}</b>. Выберите подсектор в поле выше.</>
          : null}
      </div>
    </div>
  );
}

// ── Подсектор: выбор и что подобрано автоматически
function SubsectorGroup({ form, set, ctx, settings, search }) {
  const f = FIELDS.subsector;
  return (
    <div>
      <div className="fgrid"><Field def={f} value={form.subsector} onChange={(v) => set('subsector', v)} highlight={matches(f, search)} className="sub-select" /></div>
      {ctx.sub_selected ? <SubsectorProfile code={ctx.sub_selected} settings={settings} ctx={ctx} />
        : <div className="callout warn" style={{ marginTop: 10 }}>Выберите подсектор — от него программа сама подберёт веса и пороги из «Настроек», шкалы натурального объёма, маржи и сезонности, перечень продукции с добавленной стоимостью, ключевое сырьё, правило сезонного долга и параметры стресс-сценария.</div>}
    </div>
  );
}

// ── Таблица со строками
function TableEditor({ name, form, set, ctx, rowExtra }) {
  const t = cfg.tables[name];
  const rows = Array.isArray(form[name]) ? form[name] : [];
  const upd = (i, k, v) => { const next = rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)); set(name, next); };
  const add = () => set(name, [...rows, {}]);
  const del = (i) => set(name, rows.filter((_, j) => j !== i));
  return (
    <div className="tedit">
      <div className="small muted" style={{ marginBottom: 6 }}>{t.hint}</div>
      <div className="tbl-wrap">
        <table className="tbl te">
          <thead><tr><th>№</th>{t.cols.map((c) => <th key={c.key} className={c.type === 'bool' ? 'c' : ''}>{c.label}</th>)}{rowExtra && <th>Расчёт программы</th>}<th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={t.cols.length + 3} className="muted small">Строк нет — нажмите «Добавить строку».</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                {t.cols.map((c) => (
                  <td key={c.key} className={c.type === 'bool' ? 'c' : ''}>
                    {c.type === 'bool'
                      ? <input type="checkbox" checked={!!r[c.key]} onChange={(e) => upd(i, c.key, e.target.checked)} aria-label={c.label} />
                      : <Field bare def={{ key: `${name}_${i}_${c.key}`, label: c.label, type: c.type === 'num' ? 'num' : c.type === 'date' ? 'date' : c.type, options: c.options, money: c.money }}
                        value={r[c.key]} onChange={(v) => upd(i, c.key, v)} noUnit placeholder={c.type === 'num' ? '' : undefined} inputId={`t_${name}_${i}_${c.key}`} />}
                  </td>
                ))}
                {rowExtra && <td className="small">{rowExtra(r, i)}</td>}
                <td><button className="icon-btn" title="Удалить строку" onClick={() => del(i)}><Icon name="trash" size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn sm" onClick={add} style={{ marginTop: 6 }}><Icon name="plus" size={14} />Добавить строку</button>
    </div>
  );
}

const gardenExtra = (ctx) => (r) => {
  const y = parseNum(r.year);
  if (!r.kind || !isN(y) || ctx.harvest_year === null) return '—';
  const age = ctx.harvest_year - Math.trunc(y);
  const [ph, k] = gardenPhase(r.kind, age);
  const name = cfg.garden_phases.find((p) => p.key === ph).name;
  return `${age} лет · ${name.toLowerCase()} · коэфф. ${num(k, 2)}`;
};
const equipExtra = (form) => {
  const rows = (Array.isArray(form.equip) ? form.equip : []).map((r, i) => ({ i, cost: parseNum(r.cost), year: parseNum(r.year) })).filter((r) => isN(r.cost) && r.cost > 0 && isN(r.year));
  rows.sort((a, b) => b.cost - a.cost);
  const tot = rows.reduce((a, r) => a + r.cost, 0);
  const chosen = new Set();
  let acc = 0;
  for (const r of rows) { if (acc >= 0.8 * tot) break; chosen.add(r.i); acc += r.cost; }
  return (r, i) => (chosen.has(i) ? 'основное (входит в 80% стоимости)' : '—');
};

// ── Карточки блоков
function Block1({ form, set, setMany, result, ctx, search }) {
  const vis = (f) => fieldVisible(ctx, f);
  const fieldsOf = (code) => cfg.fields.filter((f) => f.card === 'b1' && sfOfGroup(f.group) === code && vis(f));
  const srcKeys = (code) => fieldsOf(code).filter((f) => f.type === 'source').map((f) => f.key);
  const s16 = result.sf['1.6'];
  return (
    <>
      <SfBox code="1.1" result={result} extra={<div className="calcline">Выручка последнего года из раздела «Финансовая отчётность»: <b>{isN(result.sf['1.1'].value) ? num(result.sf['1.1'].value, 0) + ' млн сом' : 'не введена'}</b>. Балл — линейная интерполяция между границами шкалы (вкладка «Шкалы и правила»).</div>} />
      {['1.2', '1.3', '1.4'].map((c) => (
        <SfBox key={c} code={c} result={result} tools={<SourceFill keys={srcKeys(c)} form={form} setMany={setMany} />}>
          <FieldList fields={fieldsOf(c)} form={form} set={set} search={search} />
          {c === '1.2' && result.sf['1.2'].note && <div className="capnote"><Icon name="warn" size={14} /> {result.sf['1.2'].note}</div>}
        </SfBox>
      ))}
      <SfBox code="1.5" result={result}>
        <TableEditor name="seg15" form={form} set={set} ctx={ctx} />
        <FieldList fields={fieldsOf('1.5')} form={form} set={set} search={search} />
        {(result.sf['1.5'].segments || []).length > 0 && (
          <div className="calcline">После объединения по сырью: {result.sf['1.5'].segments.map((s, i) => <span key={i} className={'chip ' + (s.key_seg ? 'green' : '')}>{s.labels.join(' + ')} — {num(s.share, 1)}% выручки, валовая прибыль {mlnSom(s.gp)}{s.key_seg ? ' · ключевой' : ''}</span>)}
            <div className="small muted">Лет с отрицательной EBITDA из последних 3: {result.sf['1.5'].neg_years}.</div></div>
        )}
      </SfBox>
      <SfBox code="1.6" result={result} extra={
        <div className="calcline">{(s16.parts || [s16]).map((p, i) => (
          <div key={i}>{cfg.subsectors[p.sub || ctx.main] ? cfg.subsectors[p.sub || ctx.main].nat.label : 'Натуральный объём'}: <b>{isN(p.value) ? fmtVal(p.value, p.unit, 1) : 'нет данных'}</b> → балл {num(p.score, 2)}{s16.parts ? ` · вес сегмента ${num(p.w * 100, 0)}%` : ''}</div>
        ))}</div>}>
        <FieldList fields={fieldsOf('1.6')} form={form} set={set} search={search} />
        {ctx.garden && <div className="small muted">Сады добавляются из таблицы кварталов (блок 2): в полном плодоношении интенсивные × 5, прочие × 2, в других фазах × 1.</div>}
      </SfBox>
    </>
  );
}

function Block2({ form, set, setMany, result, ctx, search }) {
  const vis = (f) => fieldVisible(ctx, f);
  const groups = groupsOf('b2');
  const fieldsG = (g) => cfg.fields.filter((f) => f.card === 'b2' && f.group === g && vis(f));
  const srcKeysSf = (code) => cfg.fields.filter((f) => f.card === 'b2' && sfOfGroup(f.group) === code && f.type === 'source' && vis(f)).map((f) => f.key);
  const s22 = result.sf['2.2'];
  const gardenPart = (() => {
    const s = result.sf['2.1'];
    const all = [s, ...(s.segments || [])];
    for (const x of all) for (const p of x.parts || []) if (p.garden) return p.garden;
    return null;
  })();
  return (
    <>
      <SfBox code="2.1" result={result} tools={<SourceFill keys={srcKeysSf('2.1')} form={form} setMany={setMany} />}>
        {groups.filter((g) => sfOfGroup(g) === '2.1').map((g) => {
          const fs = fieldsG(g);
          const tb = cfg.table_order.filter((t) => cfg.tables[t].group === g && (cfg.tables[t].when || []).every((w) => fieldVisible(ctx, { when: [w] })));
          if (!fs.length && !tb.length) return null;
          return (
            <div key={g} className="group">
              <div className="group-t">{g.replace('2.1 ', '')}</div>
              {tb.map((t) => <TableEditor key={t} name={t} form={form} set={set} ctx={ctx} rowExtra={t === 'gardens' ? gardenExtra(ctx) : null} />)}
              <FieldList fields={fs} form={form} set={set} search={search} />
            </div>
          );
        })}
        {gardenPart && gardenPart.area > 0 && (
          <div className="calcline">Насаждения: {num(gardenPart.area, 1)} га; нормативный сбор по годам {gardenPart.norms.map((x) => num(x, 0)).join(' / ')} т; фактический {gardenPart.harvests.map((x) => (isN(x) ? num(x, 0) : '—')).join(' / ')} т.
            {gardenPart.points_list && <div className="small">Защита сада: {gardenPart.points_list.map((p) => <span key={p.key} className={'chip ' + (p.ok ? 'green' : '')}>{POINT_LABELS[p.key]}{isN(p.share) ? ` (${num(p.share, 0)}%)` : ''}</span>)}</div>}
          </div>
        )}
        {ctx.crp && <div className="small muted">Однолетние и многолетние направления: доля многолетних {num(ctx.crp_p, 0)}% выручки. Если каждое направление даёт 15% и больше, балл 2.1 взвешивается по долям; иначе применяется вариант большего направления.</div>}
      </SfBox>
      <SfBox code="2.2" result={result} tools={<SourceFill keys={srcKeysSf('2.2')} form={form} setMany={setMany} />}
        extra={<div className="calcline small">Защита: {(s22.g_points || []).map((p) => <span key={p.key} className={'chip ' + (p.ok ? 'green' : '')}>{POINT_LABELS[p.key]}</span>)}
          <div className="muted">Шкала сезонности: {ctx.g3 >= 1 ? 'первичное производство (сдвинута на 15 п.п.)' : ctx.g3 > 0 ? `смешанная (доля первичного производства ${num(ctx.g3 * 100, 0)}%)` : 'переработка'}.</div></div>}>
        {groups.filter((g) => sfOfGroup(g) === '2.2').map((g) => {
          const fs = fieldsG(g);
          if (!fs.length) return null;
          return <div key={g} className="group"><div className="group-t">{g.replace('2.2 Производственные риски: ', '')}</div><FieldList fields={fs} form={form} set={set} search={search} /></div>;
        })}
      </SfBox>
      <SfBox code="2.3" result={result} tools={<SourceFill keys={srcKeysSf('2.3')} form={form} setMany={setMany} />}>
        <FieldList fields={fieldsG(groups.find((g) => sfOfGroup(g) === '2.3'))} form={form} set={set} search={search} />
        <TableEditor name="equip" form={form} set={set} ctx={ctx} rowExtra={equipExtra(form)} />
      </SfBox>
    </>
  );
}

function Block3({ result, ctx }) {
  const s31 = result.sf['3.1'], s32 = result.sf['3.2'];
  return (
    <>
      <SfBox code="3.1" result={result} extra={<div className="calcline">Средняя маржа EBITDA {s31.how === 'min' ? '(меньше 3 лет — берётся наименьшая)' : 'за 3 года'}: <b>{isN(s31.value) ? num(s31.value, 1) + '%' : 'нет данных'}</b>. Шкала группы {ctx.group === 'MIX' ? 'смешанная по долям выручки' : ctx.group}: Aaa от {num(s31.bounds[1], 1)}%, Ba от {num(s31.bounds[5], 1)}%. Данные — из таблицы «по годам».</div>} />
      <SfBox code="3.2" result={result} extra={<div className="calcline">{s32.years >= 2 ? <>Ряд {s32.years} {s32.years < 5 ? 'года' : 'лет'}; наибольшее снижение маржи за год {num(s32.max_drop, 1)} п.п. при средней марже {num(s32.avg, 1)}% → МПМ <b>{isN(s32.value) ? num(s32.value, 1) + '%' : '—'}</b>.</> : (s32.note || 'Нужно минимум 2 года подряд.')}</div>} />
    </>
  );
}

function Block4({ form, set, result, ctx, search }) {
  const b4 = result.b4;
  if (!b4) return null;
  const d = b4.debt, I = b4.int;
  const fs = cfg.fields.filter((f) => f.card === 'b4' && fieldVisible(ctx, f));
  const row = (code) => {
    const s = result.sf[code];
    return <SfBox key={code} code={code} result={result} extra={
      <div className="calcline">Факт: <b>{isN(s.fact.value) ? fmtVal(s.fact.value, s.unit) : s.fact.note || '—'}</b> → {num(s.fact.score, 2)}; прогноз (базовый сценарий): <b>{isN(s.fc.value) ? fmtVal(s.fc.value, s.unit) : s.fc.note || '—'}</b> → {num(s.fc.score, 2)}. Балл = 0,5 × факт + 0,5 × прогноз.</div>} />;
  };
  const s44 = result.sf['4.4'];
  return (
    <>
      <div className="callout small">Данные блока 4 берутся из раздела «Финансовая отчётность» и вкладки «Прогноз и стресс». Долг в 4.1: {DEBT_MODE[d.mode]} = <b>{mlnSom(d.d41)}</b>; в 4.3: <b>{mlnSom(d.d43)}</b>. Проценты в расчёте: <b>{mlnSom(I.used)}</b>{I.recompute ? <> — <b>нормализованы</b> по рыночной ставке {fmtPct(I.market * 100)}% ({MARKET_SRC[I.market_src]}; {I.why}); фактические {mlnSom(I.actual)}{isN(I.ic_actual) ? `, покрытие по ним справочно ${num(I.ic_actual, 2)}×` : ''}</> : isN(I.eff) ? <> (эффективная ставка {num(I.eff * 100, 1)}%; {isN(I.threshold) && I.eff < I.threshold ? 'ниже порога, но рыночная ставка не выше — проценты фактические' : 'нормализация не нужна'})</> : ''}. Налог на прибыль: {mlnSom(b4.tax)} ({TAX_SRC[b4.tax_src]}).</div>
      {ctx.seasonal && (
        <div className="group">
          <div className="group-t">Сезонный долг и ликвидные запасы</div>
          <FieldList fields={fs} form={form} set={set} search={search} />
          {isN(b4.fact_nod) && <div className="small muted">Справочно: Debt/EBITDA без вычета запасов {num(b4.fact_nod, 2)}×.</div>}
        </div>
      )}
      {['4.1', '4.2', '4.3'].map(row)}
      <SfBox code="4.4" result={result} extra={<div className="calcline">(деньги + неиспользованные линии + FFO прогнозного года) / (краткосрочный долг{ctx.seasonal ? ' — наибольший квартальный' : ''} + капзатраты + дивиденды + возвратные авансы) = {mlnSom(s44.num)} / {mlnSom(s44.den)} = <b>{isN(s44.value) ? num(s44.value, 2) + '×' : s44.note || '—'}</b></div>} />
    </>
  );
}

function Block5({ form, set, setMany, result, ctx, search }) {
  const groups = groupsOf('b5');
  const fieldsG = (g) => cfg.fields.filter((f) => f.card === 'b5' && f.group === g && fieldVisible(ctx, f));
  const srcKeysSf = (code) => cfg.fields.filter((f) => f.card === 'b5' && sfOfGroup(f.group) === code && f.type === 'source').map((f) => f.key);
  const s52 = result.sf['5.2'], s53 = result.sf['5.3'];
  return (
    <>
      <SfBox code="5.1" result={result} tools={<SourceFill keys={srcKeysSf('5.1')} form={form} setMany={setMany} />}
        extra={<div className="calcline small">Выплаты владельцам и чистая прибыль за 3 года берутся из таблицы «по годам». {result.sf['5.1'].equity_cut > 0 ? `Из капитала исключена переоценка насаждений ${mlnSom(result.sf['5.1'].equity_cut)}.` : ''}</div>}>
        {groups.filter((g) => sfOfGroup(g) === '5.1').map((g) => <div key={g} className="group"><div className="group-t">{g.replace('5.1 Финансовая политика и собственность: ', '')}</div><FieldList fields={fieldsG(g)} form={form} set={set} search={search} /></div>)}
      </SfBox>
      <SfBox code="5.2" result={result} extra={
        <div className="calcline">Категория по таблице решений: <b>{s52.cat || 'нет данных'}</b>{s52.why ? ` — ${s52.why}` : ''}. Тесты целостности: {s52.tests.map((t) => <span key={t.id} className={'chip ' + (t.result === 'pass' ? 'green' : t.result === 'fail' ? 'red' : '')}>№{t.id} {cfg.integrity_tests[t.id - 1].name}: {t.result === 'pass' ? 'пройден' : t.result === 'fail' ? 'не пройден' : t.result === 'explain' ? 'требует пояснений' : 'не проверен'}{t.auto ? ' (авто)' : ''}</span>)}</div>}>
        {groups.filter((g) => sfOfGroup(g) === '5.2').map((g) => <div key={g} className="group"><div className="group-t">{g.replace('5.2 Качество и прозрачность отчётности', 'Отчётность и аудит').replace('Отчётность и аудит: ', '')}</div><FieldList fields={fieldsG(g)} form={form} set={set} search={search} /></div>)}
        <div className="small muted">Тесты 1 (баланс) и 2 (движение денег) программа проверяет сама по строкам баланса и ОДДС из раздела «Финансовая отчётность».</div>
      </SfBox>
      <SfBox code="5.3" result={result} extra={<div className="calcline small">Баллы проверки: {(s53.points_list || []).map((p) => <span key={p.key} className={'chip ' + (p.ok ? 'green' : '')}>{POINT_LABELS[p.key]}</span>)}</div>}>
        {groups.filter((g) => sfOfGroup(g) === '5.3').map((g) => <div key={g} className="group"><div className="group-t">{g.replace('5.3 ПОД/ФТ и санкции: ', '')}</div><FieldList fields={fieldsG(g)} form={form} set={set} search={search} /></div>)}
        {result.stops && result.stops.length > 0 && <div className="capnote bad"><Icon name="warn" size={14} /> Стоп-фактор: {result.stops.join('; ')} — оценка не присваивается.</div>}
      </SfBox>
    </>
  );
}

function Block6({ form, set, setMany, result, ctx, search }) {
  const groups = groupsOf('b6');
  const fieldsG = (g) => cfg.fields.filter((f) => f.card === 'b6' && f.group === g && fieldVisible(ctx, f));
  const ev = result.credit;
  return (
    <>
      <SfBox code="6.1" result={result} extra={
        <div className="calcline">{ev && ev.default ? <span className="red-t">Дефолт за 5 лет: {ev.default_reasons.join('; ')}.</span> : <>Максимальная просрочка за 36 месяцев: <b>{isN(result.sf['6.1'].value) ? num(result.sf['6.1'].value, 0) + ' дней' : '—'}</b>.</>}
          {(result.restr || []).length > 0 && <div className="small">Реструктуризации: {result.restr.map((r) => <span key={r.n} className={'chip ' + (r.type >= 3 ? (r.type === 4 ? 'red' : 'yellow') : 'green')}>№{r.n} {r.date || 'без даты'}: вид {r.type} — {RESTR_TYPE[r.type]}{!r.in5 ? ' (старше 5 лет, не учитывается)' : r.type === 3 && !r.in36 ? ' (старше 36 мес.)' : ''}</span>)}</div>}
        </div>}>
        <FieldList fields={fieldsG(groups.find((g) => sfOfGroup(g) === '6.1'))} form={form} set={set} search={search} />
        <TableEditor name="restr" form={form} set={set} ctx={ctx} />
      </SfBox>
      <SfBox code="6.2" result={result} extra={<div className="calcline">{result.sf['6.2'].note || <>Просрочено {isN(result.sf['6.2'].value) ? num(result.sf['6.2'].value, 1) + '%' : '—'} всей кредиторской задолженности ({mlnSom(result.sf['6.2'].total)}).</>}</div>}>
        <FieldList fields={fieldsG(groups.find((g) => sfOfGroup(g) === '6.2'))} form={form} set={set} search={search} />
      </SfBox>
      <SfBox code="6.3" result={result} tools={<SourceFill keys={['s63A', 's63B', 's63V', 's63G']} form={form} setMany={setMany} />}>
        <FieldList fields={fieldsG(groups.find((g) => sfOfGroup(g) === '6.3'))} form={form} set={set} search={search} />
      </SfBox>
    </>
  );
}

// ── Отчётный период: первым в профиле. От него программа сама ставит годы и даты во всех полях
function PeriodGroup({ form, set, ctx, search, onNextYear }) {
  const P = useContext(PeriodContext) || {};
  const fs = cfg.fields.filter((f) => f.card === 'profile' && f.group === 'Отчётный период' && fieldVisible(ctx, f));
  const evY = P.eval ? Number(P.eval.slice(0, 4)) : new Date().getFullYear();
  const ph = { report_year: String(evY - 1), bal_date: '31.12.' + (P.report_year !== null && P.report_year !== undefined ? P.report_year : evY - 1) };
  const pw = { warnings: [], raw: form, report_year: ctx.report_year, bal_date: ctx.bal_date, eval_date: ctx.eval_date, fy_type: ctx.fy_type };
  periodChecks(pw);
  const ry = P.report_year;
  const has = ry !== null && ry !== undefined;
  return (
    <div id="period-group">
      <div className="fgrid">
        {fs.map((f) => <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => set(f.key, v)} highlight={matches(f, search)}
          placeholder={ph[f.key]} className={f.type === 'bool' ? 'span-all' : ''} />)}
      </div>
      <div className="period-box" id="period-summary">
        <div className="period-h"><Icon name="calendar" size={15} /><b>Программа сама ставит годы и даты</b>
          {has && <button id="btn-next-year" className="btn sm" style={{ marginLeft: 'auto' }} onClick={onNextYear}
            title="Новая оценка этой компании за следующий год: таблица «по годам» сдвигается, профиль и реестры сохраняются">Следующий отчётный год ({ry + 1}) <Icon name="arrow" size={14} /></button>}
        </div>
        {has ? (
          <div className="period-grid">
            <span>Таблица «по годам»</span><b>{P.years.join(' · ')}</b>
            <span>Отчётный период</span><b>{P.begin ? `${isoRu(P.begin)} – ${isoRu(P.bal_eff)}` : '—'}{P.bal_assumed ? ' (дата баланса не указана — взят конец года)' : ''}</b>
            <span>Прогноз и стресс</span><b>{P.fc_from ? (P.bal_eff.slice(5) === '12-31' ? `${periodText('f12', P)} (${isoRu(P.fc_from)} – ${isoRu(P.fc_to)})` : `${isoRu(P.fc_from)} – ${isoRu(P.fc_to)}`) : '—'}</b>
            <span>Кредитная история и события</span><b>{P.eval ? <>36 месяцев: {periodText('e36', P)} · 5 лет: {periodText('e60', P)}</> : 'укажите дату оценки'}</b>
          </div>
        ) : <div className="small">Укажите последний полный финансовый год — например, {evY - 1}. Программа сама подставит дату баланса 31.12.{evY - 1}, годы в таблице «по годам» ({evY - 1}, {evY - 2}, {evY - 3}…) и годы в подписях полей.</div>}
        {pw.warnings.map((w, i) => <div key={i} className="capnote" style={{ marginTop: 6 }}><Icon name="warn" size={14} /> {w}</div>)}
      </div>
    </div>
  );
}

function GroupTitle({ g, children }) {
  const code = groupPeriod(g);
  return <div className="group-t">{children || g}{code && <PeriodChip code={code} />}</div>;
}

function PlainCard({ card, form, set, ctx, result, search, settings, onNextYear }) {
  const groups = groupsOf(card);
  const out = groups.map((g) => {
    if (card === 'profile' && g === 'Отчётный период') return <div key={g} className="group"><div className="group-t">{g}</div><PeriodGroup form={form} set={set} ctx={ctx} search={search} onNextYear={onNextYear} /></div>;
    if (card === 'profile' && g === 'Подсектор') return <div key={g} className="group"><div className="group-t">{g}</div><SubsectorGroup form={form} set={set} ctx={ctx} settings={settings} search={search} /></div>;
    if (card === 'profile' && g === 'Выручка по видам деятельности') {
      if (!fieldVisible(ctx, FIELDS['sh_' + cfg.segment_subs[0]])) return null;
      return <div key={g} className="group"><div className="group-t">{ctx.sub_selected === 'INT' ? 'Доли выручки агрохолдинга по видам деятельности' : g}</div><Shares form={form} set={set} ctx={ctx} search={search} /></div>;
    }
    if (card === 'profile' && g === 'Валюта, ключевая и рыночная ставки') {
      const fs = cfg.fields.filter((f) => f.card === card && f.group === g && fieldVisible(ctx, f))
        .map((f) => (f.key === 'mkt_rate' && ctx.settings ? { ...f, placeholder: 'по настройкам: ' + fmtPct(ctx.settings.market_rate) } : f));
      return <div key={g} className="group"><GroupTitle g={g} /><FieldList fields={fs} form={form} set={set} search={search} /><RateNote result={result} ctx={ctx} /></div>;
    }
    if (card === 'fin' && g === 'Данные по годам') return <div key={g} className="group"><GroupTitle g={g}>Данные по годам — сначала последний год, затем прошлые</GroupTitle><YearTable form={form} set={set} ctx={ctx} result={result} /></div>;
    const fs = cfg.fields.filter((f) => f.card === card && f.group === g && fieldVisible(ctx, f));
    if (!fs.length) return null;
    return <div key={g} className="group"><GroupTitle g={g} /><FieldList fields={fs} form={form} set={set} search={search} /></div>;
  });
  if (card === 'profile') {
    out.push(
      <div key="_docs" className="group" id="docs-general">
        <div className="group-t">Документы компании</div>
        <div className="small muted" style={{ marginBottom: 6 }}>Устав, свидетельство о регистрации, лицензии, аудиторские заключения, отчётность — всё, на что опирается оценка. Документ к конкретному показателю прикрепляйте скрепкой в его поле «Источник». Файлы хранятся вместе с оценкой и попадают в отчёт и досье, но на расчёт не влияют.</div>
        <DocsPanel k="_general" />
      </div>,
    );
  }
  return out;
}

// Какая рыночная ставка действует и нормализованы ли проценты
function RateNote({ result, ctx }) {
  const I = result && result.b4 ? result.b4.int : null;
  if (!I && !(ctx && ctx.settings)) return null;
  const rate = I ? I.market * 100 : ctx.settings.market_rate;
  const src = I ? I.market_src : ctx.settings.market_src;
  return (
    <div className="calcline" id="rate-note">
      Нормализация процентов (4.2–4.4): действует рыночная ставка <b>{fmtPct(rate)}%</b> — {MARKET_SRC[src]}{I && I.market_note ? ` (источник: ${I.market_note})` : ''}.{' '}
      {!I ? 'Проверка выполняется, когда введены долг и проценты.'
        : I.recompute ? <>Проценты <b>нормализованы</b>: {I.why}; в расчёте {mlnSom(I.used)} вместо фактических {mlnSom(I.actual)}.</>
          : isN(I.threshold) && isN(I.eff) && I.eff < I.threshold ? <>Проценты <b>не нормализуются</b>: эффективная ставка {num(I.eff * 100, 1)}% ниже порога {num(I.threshold * 100, 1)}%, но рыночная ставка не выше её — нормализация не может уменьшать проценты. Проверьте рыночную ставку.</>
          : isN(I.threshold) && isN(I.eff) ? <>Проценты не нормализуются: эффективная ставка {num(I.eff * 100, 1)}% не ниже порога {num(I.threshold * 100, 1)}% ({fmtPct(ctx.settings.low_rate_share)}% ключевой ставки).</>
            : I.avg_debt > 0 && !isN(I.threshold) ? 'Ключевая ставка не указана — проверка не выполнена.' : 'Долг не введён или равен нулю — нормализация не требуется.'}
    </div>
  );
}

function AdjPreview({ result }) {
  if (!result.adj) return null;
  return (
    <div className="calcline">
      {result.adj.items.length === 0 ? 'Корректировки не применяются.' : result.adj.items.map((it, i) => {
        const t = adjText(it);
        return <div key={i}><span className={'chip ' + (it.notches < 0 ? 'red' : it.notches > 0 ? 'green' : '')}>{it.notches > 0 ? '+' : ''}{it.notches} ступ.</span> <b>{t.name}</b>: {t.value}</div>;
      })}
    </div>
  );
}

// ── Панель результата
export function ResultPanel({ result, onGo }) {
  if (result.status === 'error') return <div className="card"><div className="card-b"><div className="capnote bad">{result.message}</div></div></div>;
  const r = result.rating, rb = result.rating_base;
  const rated = result.status === 'rated';
  const bs = blockStats(result);
  return (
    <div className="result-col">
      <div className={'card rating-card t-' + (rated ? ratingTone(r.index) : 'none')}>
        <div className="card-b">
          <div className="eyebrow">Итоговая оценка</div>
          {rated ? (
            <>
              <div className="big-rating">{r.national}<span>{r.internal}</span></div>
              <div className="small">{ratingMeaning(r.national)}</div>
              <div className="outlook-pill">Прогноз: <b>{result.outlook.label}</b></div>
            </>
          ) : (
            <div className="capnote bad" style={{ marginTop: 6 }}><b>{result.message}</b>
              <ul>{[...(result.stops || []), ...(result.insufficient || [])].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
          <div className="kv"><span>Балл скоркарда</span><b>{num(result.agg, 2)} → {rb.national}</b></div>
          <div className="kv"><span>Запас до ступени ниже</span><b>{num(rb.headroom, 2)} балла</b></div>
          <div className="kv"><span>Корректировки</span><b>{result.adj.notches > 0 ? '+' : ''}{result.adj.notches} ступ.{result.capped ? ' · ограничение B1' : ''}</b></div>
          <div className="kv"><span>Прогнозная / стрессовая</span><b>{result.forecast.rating.national} / {result.stress.worst ? result.stress.worst.rating.national : '—'}</b></div>
          <div className="marking">{cfg.marking}</div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Блоки</h3></div>
        <div className="card-b"><BlockBars blocks={bs} total={result.agg} /></div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Подфакторы</h3><span className="muted small" style={{ marginLeft: 'auto' }}>нажмите, чтобы перейти</span></div>
        <div className="card-b sf-list">
          {cfg.subfactors.map((s) => {
            const x = result.sf[s.code];
            return (
              <button key={s.code} className="sf-row" onClick={() => onGo(s.code)} title={s.name}>
                <span className="mono">{s.code}</span><span className="nm">{s.name}</span>
                {x.all_default && <span className="dot warn" title="нет данных" />}
                {x.caps.some((c) => !c.inactive) && <span className="dot bad" title="действует ограничение" />}
                <span className={'tag t-' + catTone(x.cat_score)}>{num(x.score, 1)}</span>
              </button>
            );
          })}
          <div className="small muted" style={{ marginTop: 8 }}>Без данных: {num(result.default_weight, 1)}% веса (допустимо не больше 20%).</div>
        </div>
      </div>
      {result.warnings.length > 0 && <div className="card"><div className="card-b small">{result.warnings.map((w, i) => <div key={i} className="capnote">{w}</div>)}</div></div>}
    </div>
  );
}

const CARD_IDS = cfg.cards.filter((c) => c.id !== 'fc').map((c) => c.id);

export default function InputView({ form, set, setMany, result, ctx, settings, onNextYear }) {
  const [open, setOpen] = useState(() => Object.fromEntries(CARD_IDS.map((c) => [c, c === 'profile' || c === 'fin'])));
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return {};
    const h = {};
    for (const f of cfg.fields) if (f.card !== 'fc' && matches(f, q) && fieldVisible(ctx, f)) h[f.card] = (h[f.card] || 0) + 1;
    return h;
  }, [q, ctx]);
  const go = (code) => {
    const card = 'b' + code[0];
    const target = card === 'b3' ? 'fin' : card;
    setOpen((o) => ({ ...o, [target]: true }));
    setTimeout(() => { const el = document.getElementById('sf-' + code); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  };
  const props = { form, set, setMany, result, ctx, settings, search: q, onNextYear };
  const body = (id) => {
    if (result.status === 'error' && !['profile', 'fin'].includes(id)) return <div className="callout warn">Сначала заполните профиль: {result.errors.join(' ')}</div>;
    switch (id) {
      case 'profile': return <PlainCard card="profile" {...props} />;
      case 'fin': return <><PlainCard card="fin" {...props} />{result.sf && <div className="group"><div className="group-t">Блок 3. Прибыльность и стабильность (считается из данных по годам)</div><Block3 result={result} ctx={ctx} /></div>}</>;
      case 'b1': return <Block1 {...props} />;
      case 'b2': return <Block2 {...props} />;
      case 'b4': return <Block4 {...props} />;
      case 'b5': return <Block5 {...props} />;
      case 'b6': return <Block6 {...props} />;
      case 'adj': return <><PlainCard card="adj" {...props} /><div className="group"><div className="group-t">Корректировки итоговой оценки (считаются автоматически)</div><AdjPreview result={result} /></div></>;
      default: return null;
    }
  };
  return (
    <div className="work">
      <div className="work-main">
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input placeholder="Найти поле: например, «аудит», «запасы», «покупатель»" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <button className="btn sm" onClick={() => setOpen(Object.fromEntries(CARD_IDS.map((c) => [c, true])))}><Icon name="expand" size={14} />Раскрыть всё</button>
          <button className="btn sm" onClick={() => setOpen(Object.fromEntries(CARD_IDS.map((c) => [c, false])))}><Icon name="collapse" size={14} />Свернуть всё</button>
        </div>
        {cfg.cards.filter((c) => c.id !== 'fc').map((c) => {
          const isOpen = open[c.id] || (q && hits[c.id]);
          const block = c.block ? cfg.blocks.find((b) => b.id === c.block) : null;
          return (
            <div key={c.id} className={'card incard' + (isOpen ? ' open' : '')} id={'card-' + c.id}>
              <button className="card-h incard-h" onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))} aria-expanded={!!isOpen}>
                <Icon name={c.icon} /><h3>{c.title}</h3>
                {q && hits[c.id] ? <span className="chip yellow">найдено: {hits[c.id]}</span> : null}
                {block && result.sf && <CardScore result={result} block={c.block} />}
                <span className="chev" style={{ marginLeft: block ? 8 : 'auto' }}><Icon name="chev" /></span>
              </button>
              {block && isOpen && <div className="block-desc">{block.desc}</div>}
              {isOpen && <div className="card-b">{body(c.id)}</div>}
            </div>
          );
        })}
      </div>
      <aside className="work-side">{result.sf ? <ResultPanel result={result} onGo={go} /> : <ResultPanel result={result} onGo={go} />}</aside>
    </div>
  );
}

function CardScore({ result, block }) {
  const sfs = cfg.subfactors.filter((s) => s.block === block);
  let w = 0, s = 0, nd = 0;
  for (const x of sfs) { const r = result.sf[x.code]; w += r.weight; s += r.weight * r.score; if (r.all_default) nd += 1; }
  const avg = w > 0 ? s / w : null;
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
      {nd > 0 && <span className="tag t-none">без данных: {nd}</span>}
      <span className="muted small">вес {num(w, 0)}% · средний балл</span>
      <span className={'tag t-' + catTone(avg !== null ? cfgCat(avg) : null)}>{num(avg, 2)}</span>
    </span>
  );
}
const cfgCat = (score) => { let i = 0; for (const c of [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5]) if (score > c) i += 1; return cfg.categories[i]; };
