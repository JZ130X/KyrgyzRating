import React, { useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cfg, compute, isNum, fmtPct, MARKET_SRC } from './engine.js';
import { LOGO_URL, BRAND_RU, BRAND_EN } from './brand.js';
import { Icon, Tag } from './ui.jsx';
import { num, isN, download, catTone, ratingTone } from './format.js';
import { docsOf, deviationText, reviewDue, isoRu } from './process.js';
import { fmtSize } from './docstore.js';
import { SF, FIELDS, subName, fmtVal, mlnSom, indValue, sfValue, indicatorGroups, POINT_LABELS, DEBT_MODE, TAX_SRC, TEST_RESULT, RESTR_TYPE, adjText, blockStats, ratingMeaning } from './labels.js';

const str = (v) => (typeof v === 'string' ? v.trim() : isN(v) ? String(v) : '');

function sources(form) {
  const out = [];
  const docs = form.docs && typeof form.docs === 'object' ? form.docs : {};
  for (const f of cfg.fields) {
    if (f.type !== 'source') continue;
    const v = str(form[f.key]);
    const d = Array.isArray(docs[f.key]) ? docs[f.key] : [];
    if (!v && !d.length) continue;
    const g = f.group.replace(/:.*/, '');
    out.push({ group: g, label: f.label, text: v, docs: d });
  }
  return out;
}

export function ReportDoc({ result, form, process }) {
  const r = result;
  const rated = r.status === 'rated';
  const comp = str(form.company) || 'Компания без названия';
  const today = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const made = `${p2(today.getDate())}.${p2(today.getMonth() + 1)}.${today.getFullYear()}`;
  if (r.status === 'error') {
    return (
      <div className="report"><div className="rep-head"><img src={LOGO_URL} alt="" /><div><b>{BRAND_EN}</b> · {BRAND_RU}</div></div>
        <h1>{comp}</h1><div className="capnote bad">{r.message}</div></div>
    );
  }
  const bs = blockStats(r);
  const b4 = r.b4, fc = b4.fc, fa = b4.fact;
  const src = sources(form);
  const allDocs = docsOf(form);
  const genDocs = allDocs.filter(([k]) => k === '_general').map(([, m]) => m);
  const dec = process && process.decision && typeof process.decision === 'object' ? process.decision : null;
  const missingInds = [];
  for (const s of cfg.subfactors) for (const [lbl, inds] of indicatorGroups(r.sf[s.code])) for (const i of inds) if (!i.na && i.missing) missingInds.push(`${i.code} ${i.name}${lbl ? ' (' + lbl + ')' : ''}`);
  return (
    <div className="report">
      <div className="rep-head">
        <img src={LOGO_URL} alt="" />
        <div><b>{BRAND_EN}</b> · {BRAND_RU}<div className="small muted">Отчёт для рейтингового комитета · сформирован программой {made}</div></div>
      </div>
      <div className="rep-marking">{cfg.marking}</div>
      <h1>{comp}</h1>
      <div className="rep-meta">
        {str(form.inn) && <span>ИНН {str(form.inn)}</span>}
        <span>Дата оценки: {str(form.eval_date) || '—'}</span>
        <span>Последний полный финансовый год: {str(form.report_year) || '—'}</span>
        <span>Дата баланса: {str(form.bal_date) || '—'}</span>
        <span>Аналитик: {str(form.analyst) || '—'}</span>
      </div>

      <h2>1. Итог</h2>
      {rated ? (
        <div className={'rep-result t-' + ratingTone(r.rating.index)}>
          <div className="rep-rating">{r.rating.national}<span>{r.rating.internal}</span></div>
          <div>
            <div><b>Значение:</b> {ratingMeaning(r.rating.national)}</div>
            <div><b>Прогноз по оценке: {r.outlook.label}</b> — {r.outlook.reasons.join('; ').replace(/\.$/, '')}.</div>
          </div>
        </div>
      ) : (
        <div className="capnote bad"><b>{r.message}.</b><ul>{[...r.stops, ...r.insufficient].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}
      <table className="tbl rep-kv"><tbody>
        <tr><td>Агрегированный балл скоркарда (0,5 — лучший, 20,5 — худший)</td><td><b>{num(r.agg, 2)}</b> → {r.rating_base.national} ({r.rating_base.internal}); диапазон ступени {num(r.rating_base.lower, 1)}–{num(r.rating_base.upper, 1)}, запас до ступени ниже {num(r.rating_base.headroom, 2)} балла</td></tr>
        <tr><td>Корректировки</td><td>{r.adj.notches > 0 ? '+' : ''}{r.adj.notches} ступ.{r.adj.caps.length ? '; ' + r.adj.caps.join('; ') : ''}</td></tr>
        <tr><td>Прогнозная оценка (4.1–4.3 по базовому сценарию)</td><td>{r.forecast.rating.national} (балл {num(r.forecast.agg, 2)})</td></tr>
        <tr><td>Стрессовая оценка (худший сценарий)</td><td>{r.stress.worst ? `${r.stress.worst.rating.national} — ${r.stress.worst.id}. ${cfg.stress_scenarios.find((s) => s.id === r.stress.worst.id).name}` : '—'}</td></tr>
        {r.ref30 && <tr><td>Справочно: данные аннуализированы, сценарий −30% выручки и EBITDA</td><td>{r.ref30.rating.national} (на баллы не влияет)</td></tr>}
      </tbody></table>

      <h2>2. Профиль</h2>
      <p>Подсектор {r.sub_source === 'selected' ? 'выбран в профиле компании' : 'определён программой по долям выручки (раздел А.2)'}: <b>{r.is_int ? 'Интегрированный агрохолдинг' : subName(r.main)}</b>
        {r.is_int ? `; сегменты от 10% выручки: ${r.segs.map((c) => `${subName(c)} ${num(r.shares[c], 1)}%`).join(', ')}` : r.sub_source === 'selected' ? '' : ` (${num(r.shares[r.main], 1)}% выручки)`}.
        {' '}Веса и пороги — {r.settings_changed ? 'из «Настроек» подсектора (отличаются от методологии)' : 'по методологии'}.
        Группа маржи: {r.group === 'MIX' ? `смешанная (I ${num(r.gshare.I * 100, 0)}%, II ${num(r.gshare.II * 100, 0)}%, III ${num(r.gshare.III * 100, 0)}%)` : r.group}.
        {r.seasonal ? ' Применяется правило сезонного долга.' : ''} Валюта отчётности: {r.currency}{r.fx ? ` (средний курс ${num(r.rate_avg, 4)}, на дату баланса ${num(r.rate_end, 4)} сом; все суммы пересчитаны в сомы)` : ''}.
        {r.annualized ? ` Промежуточная отчётность пересчитана в годовую (× ${num(r.ann, 2)}).` : ''}</p>

      <h2>3. Скоркард</h2>
      <table className="tbl">
        <thead><tr><th>Код</th><th>Подфактор</th><th className="r">Вес</th><th>Значение</th><th className="r">Балл</th><th>Кат.</th><th>Ограничения и примечания</th></tr></thead>
        <tbody>
          {cfg.blocks.map((b) => (
            <React.Fragment key={b.id}>
              <tr className="rep-block"><td colSpan={7}><b>Блок {b.id}. {b.name}</b> — вес {num(bs[b.id - 1].weight, 0)}%, средний балл {num(bs[b.id - 1].avg, 2)}</td></tr>
              {cfg.subfactors.filter((s) => s.block === b.id).map((s) => {
                const x = r.sf[s.code];
                const caps = x.caps.filter((c) => !c.inactive).map((c) => c.text);
                if (x.all_default) caps.unshift('нет данных — балл по умолчанию');
                return (
                  <tr key={s.code}><td className="mono">{s.code}</td><td>{s.name}</td><td className="r">{num(x.weight, 0)}%</td><td>{sfValue(r, s.code)}</td>
                    <td className="r"><b>{num(x.score, 2)}</b></td><td><Tag cat={x.cat_score} /></td><td className="small">{caps.join('; ') || '—'}</td></tr>
                );
              })}
            </React.Fragment>
          ))}
          <tr className="rep-total"><td /><td><b>Итого</b></td><td className="r">100%</td><td /><td className="r"><b>{num(r.agg, 2)}</b></td><td><b>{r.rating_base.internal}</b></td><td /></tr>
        </tbody>
      </table>

      <h2>4. Индикаторы метрических подфакторов</h2>
      <p className="small muted">Каждый индикатор относится к категории по порогам методологии и получает её балл (Aaa 1, Aa 3, A 6, Baa 9, Ba 12, B 15, Caa 18, Ca 20). Балл подфактора — взвешенное среднее. Значение без источника считается отсутствующим (12 баллов).</p>
      {cfg.subfactors.filter((s) => s.type === 'metric').map((s) => {
        const groups = indicatorGroups(r.sf[s.code]);
        return (
          <div key={s.code} className="rep-sf">
            <h3>{s.code} {s.name} — {num(r.sf[s.code].score, 2)}</h3>
            {groups.map(([lbl, inds], k) => (
              <div key={k}>{lbl && <div className="small"><b>{lbl}</b></div>}
                <table className="tbl"><thead><tr><th>Индикатор</th><th className="r">Вес</th><th className="r">Значение</th><th>Кат.</th><th className="r">Балл</th><th>Примечание</th></tr></thead>
                  <tbody>{inds.map((i) => <tr key={i.code}><td>{i.code} {i.name}</td><td className="r">{i.w}%</td><td className="r nowrap">{indValue(i)}</td><td>{i.na ? '—' : i.missing ? 'нет данных' : i.cat}</td><td className="r">{i.na ? '—' : num(i.score, 0)}</td><td className="small">{i.note || (i.missing && !i.src ? 'нет источника' : '')}</td></tr>)}</tbody>
                </table>
              </div>
            ))}
            {s.code === '2.2' && r.sf['2.2'].g_points && <div className="small">Защита (2.2.Г): {r.sf['2.2'].g_points.map((p) => `${POINT_LABELS[p.key]} — ${p.ok ? 'да' : 'нет'}`).join('; ')}.</div>}
            {s.code === '5.3' && r.sf['5.3'].points_list && <div className="small">Проверка (5.3.А): {r.sf['5.3'].points_list.map((p) => `${POINT_LABELS[p.key]} — ${p.ok ? 'да' : 'нет'}`).join('; ')}.</div>}
          </div>
        );
      })}

      <h2>5. Финансовые данные</h2>
      <table className="tbl">
        <thead><tr><th>Год</th><th className="r">Выручка</th><th className="r">EBITDA</th><th className="r">Маржа EBITDA</th></tr></thead>
        <tbody>{(r.series || []).map((y) => <tr key={y.year}><td>{isN(Number(form.report_year)) ? Number(form.report_year) - y.year : cfg.year_labels[y.year]}{y.year === 0 && str(form.fy_type) === 'ltm' ? ' (LTM)' : ''}</td><td className="r">{mlnSom(y.rev)}</td><td className="r">{mlnSom(y.ebitda)}</td><td className="r">{num(y.margin, 1)}%</td></tr>)}</tbody>
      </table>
      <p className="small">EBITDA = операционная прибыль + амортизация − переоценка биоактивов − разовые субсидии и доходы{r.garden ? ' + затраты на закладку и уход за молодыми садами' : ''}. Маржа 3.1: {r.sf['3.1'].how === 'min' ? 'меньше 3 лет данных — взята наименьшая' : 'средняя за 3 года'} = {isN(r.sf['3.1'].value) ? num(r.sf['3.1'].value, 1) + '%' : '—'}; МПМ 3.2: {isN(r.sf['3.2'].value) ? num(r.sf['3.2'].value, 1) + '%' : r.sf['3.2'].note || '—'}.</p>

      <h2>6. Долговая нагрузка и базовый сценарий</h2>
      <p className="small">Долг в 4.1: {DEBT_MODE[b4.debt.mode]} — {mlnSom(b4.debt.d41)}; в 4.3: {mlnSom(b4.debt.d43)}; на дату баланса {mlnSom(b4.debt.bal)}.
        Проценты: {mlnSom(b4.int.used)}{b4.int.recompute ? ` — нормализованы по рыночной ставке ${fmtPct(b4.int.market * 100)}% (${b4.int.why}); фактические ${mlnSom(b4.int.actual)}${isN(b4.int.ic_actual) ? `, EBITDA / фактические проценты ${num(b4.int.ic_actual, 2)}× (справочно)` : ''}` : ''}. Налог: {mlnSom(b4.tax)} ({TAX_SRC[b4.tax_src]}).
        {` Рыночная ставка для нормализации процентов и прогноза: ${fmtPct(b4.int.market * 100)}% — ${MARKET_SRC[b4.int.market_src]}${b4.int.market_note ? ` (источник: ${b4.int.market_note})` : ''}.`}
        {isN(b4.fact_nod) ? ` Справочно: Debt/EBITDA без вычета запасов ${num(b4.fact_nod, 2)}×.` : ''}</p>
      <table className="tbl">
        <thead><tr><th>Показатель</th><th className="r">Факт</th><th className="r">Прогноз 12 мес.</th></tr></thead>
        <tbody>
          <tr><td>Выручка</td><td className="r">{mlnSom(fc.rev0)}</td><td className="r">{mlnSom(fc.B)}</td></tr>
          <tr><td>Маржа EBITDA</td><td className="r">{isN(r.sf['3.1'].value) ? num(r.sf['3.1'].value, 1) + '%' : '—'}</td><td className="r">{isN(fc.m) ? num(fc.m, 1) + '%' : '—'}</td></tr>
          <tr><td>EBITDA</td><td className="r">{mlnSom(fa.ebitda)}</td><td className="r">{mlnSom(fc.E)}</td></tr>
          <tr><td>Проценты</td><td className="r">{mlnSom(fa.interest)}</td><td className="r">{mlnSom(fc.interest)}</td></tr>
          <tr><td>FFO</td><td className="r">{mlnSom(fa.ffo)}</td><td className="r">{mlnSom(fc.scores.ffo)}</td></tr>
          <tr><td>Дивиденды</td><td className="r">{mlnSom(b4.div0)}</td><td className="r">{mlnSom(fc.div)}</td></tr>
          <tr><td>4.1 Debt/EBITDA</td><td className="r">{isN(fa.v41) ? num(fa.v41, 2) + '×' : fa.n41}</td><td className="r">{isN(fc.scores.v41) ? num(fc.scores.v41, 2) + '×' : fc.scores.n41}</td></tr>
          <tr><td>4.2 EBITDA/проценты</td><td className="r">{isN(fa.v42) ? num(fa.v42, 2) + '×' : fa.n42}</td><td className="r">{isN(fc.scores.v42) ? num(fc.scores.v42, 2) + '×' : fc.scores.n42}</td></tr>
          <tr><td>4.3 RCF/чистый долг</td><td className="r">{isN(fa.v43) ? num(fa.v43, 1) + '%' : fa.n43}</td><td className="r">{isN(fc.scores.v43) ? num(fc.scores.v43, 1) + '%' : fc.scores.n43}</td></tr>
          <tr><td>4.4 Покрытие ликвидности</td><td className="r">—</td><td className="r">{isN(fc.liq.value) ? num(fc.liq.value, 2) + '×' : fc.liq.note}</td></tr>
        </tbody>
      </table>
      <p className="small">Допущения базового сценария: {fc.bp ? `рост выручки ${num(fc.g, 1)}% (бизнес-план ${isN(fc.g_bp) ? num(fc.g_bp, 1) + '%' : '—'}, ограничение — инфляция + 5 п.п. = ${num(fc.g_cap, 1)}%)` : 'бизнес-плана нет — выручка без роста'}{isN(fc.base_III) ? `; база первичного производства — средняя выручка за ${fc.base_years} г. в ценах последнего года` : ''}{fc.newcap > 0 ? `; новые мощности +${mlnSom(fc.newcap)}` : ''}{fc.garden_add > 0 ? `; прирост урожая садов +${mlnSom(fc.garden_add)}` : ''}; маржа {isN(fc.m) ? num(fc.m, 1) + '%' : '—'}; новые кредиты {mlnSom(fc.new_loans)}, погашения {mlnSom(fc.repay12)}; ставка {num(fc.rate * 100, 1)}%; налог {num(fc.tax_rate * 100, 1)}%; капзатраты {mlnSom(fc.capex12)}.</p>

      <h2>7. Стресс-сценарии</h2>
      <table className="tbl">
        <thead><tr><th>Сценарий</th><th className="r">ΔEBITDA</th><th className="r">4.1</th><th className="r">4.2</th><th className="r">4.3</th><th className="r">4.4</th><th className="r">Балл</th><th>Оценка</th></tr></thead>
        <tbody>{r.stress.items.map((it, i) => <tr key={it.id}><td>{it.id}. {cfg.stress_scenarios[i].name}</td><td className="r">{mlnSom(-b4.stress[i].dE)}</td><td className="r">{num(it.s41, 2)}</td><td className="r">{num(it.s42, 2)}</td><td className="r">{num(it.s43, 2)}</td><td className="r">{num(it.s44, 2)}</td><td className="r">{num(it.agg, 2)}</td><td>{it.rating.national}</td></tr>)}</tbody>
      </table>

      <h2>8. Корректировки итоговой оценки</h2>
      {r.adj.items.length === 0 ? <p>Корректировки не применяются: ни один формульный триггер не выполнен.</p> : (
        <table className="tbl"><thead><tr><th>Корректировка</th><th>Расчёт</th><th className="r">Ступени</th></tr></thead>
          <tbody>{r.adj.items.map((it, i) => { const t = adjText(it); return <tr key={i}><td>{t.name}</td><td className="small">{t.value}</td><td className="r">{it.notches > 0 ? '+' : ''}{it.notches}</td></tr>; })}</tbody></table>
      )}

      <h2>9. Кредитная история</h2>
      <p className="small">{r.credit.report === 'yes' ? 'Отчёт бюро получен.' : r.credit.report === 'refused' ? 'Компания отказала в согласии на запрос бюро.' : 'Отчёт бюро не предоставлен.'} {r.credit.default ? `Дефолт за 5 лет: ${r.credit.default_reasons.join('; ')}.` : 'Дефолтов за 5 лет по введённым данным нет.'}</p>
      {r.restr.length > 0 && (
        <table className="tbl"><thead><tr><th>№</th><th>Дата</th><th>Вид</th><th>Основание</th></tr></thead>
          <tbody>{r.restr.map((x) => <tr key={x.n}><td>{x.n}</td><td>{x.date || '—'}</td><td>{x.type} — {RESTR_TYPE[x.type]}{!x.in5 ? ' (старше 5 лет)' : ''}</td><td className="small">{x.reasons.join('; ') || (x.type === 1 ? 'решение НБКР/Правительства или режим ЧС, документы есть' : x.type === 2 ? 'перенос под сезон или пролонгация на рыночных условиях, документы есть' : 'финансовые трудности компании')}</td></tr>)}</tbody></table>
      )}

      <h2>10. Качество отчётности</h2>
      <p className="small">Подфактор 5.2: категория {r.sf['5.2'].cat || 'нет данных'}{r.sf['5.2'].why ? ` — ${r.sf['5.2'].why}` : ''}. Тесты целостности: {r.tests.map((t) => `№${t.id} ${cfg.integrity_tests[t.id - 1].name} — ${TEST_RESULT[t.result] || t.result}${t.auto ? ' (проверен программой)' : ''}`).join('; ')}.</p>

      <h2>11. Полнота данных и источники</h2>
      <p className="small">Подфакторы без данных: {r.default_list.length ? r.default_list.join(', ') : 'нет'} ({num(r.default_weight, 1)}% веса; порог — 20%). {missingInds.length ? `Индикаторы без данных или без источника (балл 12): ${missingInds.join('; ')}.` : 'Все применимые индикаторы заполнены и подтверждены источниками.'}</p>
      {src.length > 0 && <>
        <p className="small">Источников указано: {src.filter((s) => s.text).length}; подтверждено прикреплёнными документами: {src.filter((s) => s.docs.length).length}; файлов всего: {allDocs.length}.</p>
        <table className="tbl"><thead><tr><th>Раздел</th><th>Источник</th><th>Документы</th></tr></thead><tbody>{src.map((s, i) => <tr key={i}><td className="small">{s.group}</td><td className="small">{s.text || '—'}</td><td className="small">{s.docs.length ? s.docs.map((m) => `${m.name} (${fmtSize(m.size || 0)})`).join('; ') : '—'}</td></tr>)}</tbody></table>
      </>}
      {genDocs.length > 0 && <p className="small">Общие документы компании: {genDocs.map((m) => m.name).join('; ')}.</p>}
      {r.warnings.length > 0 && <div className="small">{r.warnings.map((w, i) => <div key={i}>• {w}</div>)}</div>}

      {dec && <>
        <h2>12. Решение рейтингового комитета</h2>
        <p className="small">Протокол № {dec.protocol} от {dec.date}: <b>{dec.decision_label}</b>{dec.final_national ? <> — <b>{dec.final_national}</b> ({dec.final_internal}), прогноз «{dec.outlook_label}»; отклонение от программы: {deviationText(dec.deviation)}</> : ''}. Голосование: за {dec.votes_for}, против {dec.votes_against}, воздержались {dec.votes_abstain}. Проверил: {dec.check_by} ({dec.check_date}).
          {dec.rationale ? ` ${dec.decision === 'approve_dev' ? 'Обоснование' : dec.decision === 'approve' ? 'Комментарий' : 'Причина'}: ${dec.rationale.replace(/[.\s]+$/, '')}.` : ''}
          {dec.status === 'approved' && !process.withdrawal ? ` Следующий пересмотр — не позднее ${isoRu(reviewDue({ outlook_code: dec.outlook_code, date_iso: dec.date_iso }))}.` : ''}
          {process.withdrawal ? ` Оценка отозвана ${process.withdrawal.date}: ${String(process.withdrawal.reason || '').replace(/[.\s]+$/, '')}.` : ''}</p>
      </>}

      <div className="rep-foot small muted">
        {r.settings_changed ? 'Расчёт выполнен с изменёнными настройками весов или порогов (см. «Настройки»). ' : ''}
        Код расчёта: данные {r.input_hash.slice(0, 16)} · результат {r.result_hash.slice(0, 16)}. Одинаковые данные всегда дают одинаковый результат и код.
        <div>{cfg.marking}.</div>
      </div>
    </div>
  );
}

export function reportsHtml(items, title) {
  const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const body = items.map(({ result, form, process }) => renderToStaticMarkup(<ReportDoc result={result} form={form} process={process} />)).join('<div class="page-break"></div>');
  return `<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style><style>body{background:#eef2f8;padding:24px}.report{margin:0 auto 24px}.page-break{break-after:page;height:0}@media print{body{padding:0;background:#fff}.report{margin:0}}</style></head><body>${body}</body></html>`;
}

export default function ReportView({ result, form, onSave, savedEntry, saved, onDossier }) {
  const ref = useRef(null);
  const process = savedEntry && savedEntry.process ? savedEntry.process : null;
  const name = (str(form.company) || 'company').replace(/[^\wа-яёөүң\-]+/gi, '_');
  const saveHtml = () => download(`otchet_${name}.html`, reportsHtml([{ result, form, process }], 'Отчёт — ' + (str(form.company) || '')), 'text/html');
  const saveJson = () => download(`raschet_${name}.json`, JSON.stringify({ model: cfg.model_version, inputs: form, result }, null, 1));
  return (
    <>
      <div className="callout no-print report-help">
        <b>Отчёт заполнять не нужно.</b> Программа собирает его из введённых данных: значения, категории, баллы, ограничения, корректировки, прогноз и стресс-сценарии. В отчёте нет мнений и рекомендаций — только расчёт по правилам методологии. Любое изменение данных сразу меняет отчёт.
      </div>
      <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className={'btn ' + (saved ? '' : 'green')} onClick={onSave}><Icon name={saved ? 'check' : 'save'} size={16} />{saved ? 'В архиве' : savedEntry ? 'Сохранить документы' : 'Сохранить в архив'}</button>
        <button className="btn primary" onClick={() => window.print()}><Icon name="printer" size={16} />Печать / PDF</button>
        <button className="btn" onClick={saveHtml}><Icon name="download" size={16} />Скачать отчёт (HTML)</button>
        <button className="btn" onClick={saveJson}><Icon name="download" size={16} />Скачать расчёт (JSON)</button>
        <button id="btn-dossier" className="btn" onClick={onDossier} title="ZIP: отчёт, данные, все прикреплённые документы по разделам и опись"><Icon name="clip" size={16} />Скачать досье (ZIP)</button>
      </div>
      <div ref={ref}><ReportDoc result={result} form={form} process={process} /></div>
    </>
  );
}
