import React from 'react';
import { cfg, fieldVisible } from './engine.js';
import { Field, Icon, PeriodChip } from './ui.jsx';
import { groupPeriod } from './period.js';
import { num, isN, ratingTone } from './format.js';
import { mlnSom, fmtVal, subName } from './labels.js';

function Fields({ group, form, set, ctx }) {
  const fs = cfg.fields.filter((f) => f.card === 'fc' && f.group === group && fieldVisible(ctx, f));
  if (!fs.length) return null;
  return (
    <div className="group">
      <div className="group-t">{group}{groupPeriod(group) && <PeriodChip code={groupPeriod(group)} />}</div>
      <div className="fgrid">{fs.map((f) => <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => set(f.key, v)} className={f.type === 'bool' ? 'span-all' : ''} />)}</div>
    </div>
  );
}

const sc = (x) => (isN(x) ? num(x, 2) : '—');

export default function ForecastView({ form, set, result, ctx }) {
  const b4 = result.b4;
  const ok = result.status !== 'error' && b4;
  const fc = ok ? b4.fc : null;
  const fa = ok ? b4.fact : null;
  const fs = fc ? fc.scores : null;
  const rows = ok ? [
    ['Выручка', mlnSom(fc.rev0), mlnSom(fc.B), fc.bp ? `база ${mlnSom(fc.base)}${isN(fc.base_III) ? ` (первичное производство: средняя за ${fc.base_years} г. в ценах последнего года)` : ''}; рост ${num(fc.g, 1)}% (по бизнес-плану ${isN(fc.g_bp) ? num(fc.g_bp, 1) + '%' : '—'}, не больше инфляции + 5 п.п. = ${num(fc.g_cap, 1)}%)${fc.newcap > 0 ? `; новые мощности ${mlnSom(fc.newcap)}` : ''}${fc.garden_add > 0 ? `; прирост урожая садов ${mlnSom(fc.garden_add)}` : ''}` : 'бизнес-плана нет — база без роста'],
    ['Маржа EBITDA', isN(result.sf['3.1'].value) ? num(result.sf['3.1'].value, 1) + '% (средняя)' : '—', isN(fc.m) ? num(fc.m, 1) + '%' : '—', fc.bp && isN(fc.m_bp) ? `по бизнес-плану ${num(fc.m_bp, 1)}%, не больше средней за 3 года` : 'средняя за 3 года'],
    ['EBITDA', mlnSom(fa.ebitda), mlnSom(fc.E), ''],
    ['Финансовый долг (конец периода)', mlnSom(b4.debt.bal), mlnSom(fc.debt_end), `+ новые кредиты ${mlnSom(fc.new_loans)} − погашения ${mlnSom(fc.repay12)}`],
    ['Проценты', mlnSom(fa.interest), mlnSom(fc.interest), `средний долг ${mlnSom(fc.avg_debt)} × ставка ${num(fc.rate * 100, 1)}%`],
    ['Налог на прибыль', mlnSom(fa.tax), mlnSom(fc.tax), `ставка ${num(fc.tax_rate * 100, 1)}% (не выше 10%)`],
    ['FFO = EBITDA − проценты − налог', mlnSom(fa.ffo), mlnSom(fs.ffo), ''],
    ['Дивиденды и иные выплаты', mlnSom(b4.div0), mlnSom(fc.div), `большее из политики (${mlnSom(fc.div_policy)}) и средних за 3 года (${mlnSom(fc.div_avg)})`],
    ['RCF = FFO − дивиденды', mlnSom(fa.rcf), mlnSom(fs.rcf), ''],
    ['4.1 Debt / EBITDA', isN(fa.v41) ? fmtVal(fa.v41, 'x') : fa.n41 || '—', isN(fs.v41) ? fmtVal(fs.v41, 'x') : fs.n41 || '—', `баллы ${sc(fa.s41)} и ${sc(fs.s41)}`],
    ['4.2 EBITDA / проценты', isN(fa.v42) ? fmtVal(fa.v42, 'x') : fa.n42 || '—', isN(fs.v42) ? fmtVal(fs.v42, 'x') : fs.n42 || '—', `баллы ${sc(fa.s42)} и ${sc(fs.s42)}`],
    ['4.3 RCF / чистый долг', isN(fa.v43) ? fmtVal(fa.v43, '%') : fa.n43 || '—', isN(fs.v43) ? fmtVal(fs.v43, '%') : fs.n43 || '—', `баллы ${sc(fa.s43)} и ${sc(fs.s43)}`],
    ['4.4 Покрытие ликвидности', '—', isN(fc.liq.value) ? fmtVal(fc.liq.value, 'x') : fc.liq.note || '—', `балл ${sc(fc.liq.score)}; прогнозный по построению`],
  ] : [];
  return (
    <div className="work">
      <div className="work-main">
        <div className="callout small">Прогноз строится по правилам методологии, а не по мнению аналитика: рост выручки не больше инфляции + 5 п.п., маржа не выше средней за 3 года, новые мощности — с месяца ввода и не больше 50% проектной выручки, долг — только по подписанным договорам. Баллы 4.1–4.3 = 0,5 × факт + 0,5 × прогноз; прогнозная оценка считает их полностью по прогнозу; стрессовая — худший из четырёх сценариев.</div>
        <div className="card"><div className="card-h"><Icon name="trend" /><h3>Данные для прогноза</h3></div>
          <div className="card-b">
            <Fields group="Базовый сценарий на 12 месяцев" form={form} set={set} ctx={ctx} />
            <Fields group="Данные для стресс-сценариев" form={form} set={set} ctx={ctx} />
            <Fields group="Прогноз по оценке" form={form} set={set} ctx={ctx} />
          </div>
        </div>
        {ok && (
          <div className="card"><div className="card-h"><Icon name="table" /><h3>Факт и базовый сценарий</h3></div>
            <div className="card-b">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Показатель</th><th className="r">Последний год</th><th className="r">Прогноз 12 мес.</th><th>Как получено</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td className="r nowrap">{r[1]}</td><td className="r nowrap">{r[2]}</td><td className="small">{r[3]}</td></tr>)}</tbody>
              </table></div>
            </div>
          </div>
        )}
        {ok && b4.stress.length > 0 && (
          <div className="card"><div className="card-h"><Icon name="warn" /><h3>Стресс-сценарии</h3></div>
            <div className="card-b">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Сценарий</th><th className="r">Изменение EBITDA</th><th className="r">EBITDA</th><th className="r">4.1</th><th className="r">4.2</th><th className="r">4.3</th><th className="r">4.4</th><th className="r">Балл</th><th>Оценка</th></tr></thead>
                <tbody>{b4.stress.map((s, i) => {
                  const it = result.stress.items[i];
                  return (
                    <tr key={s.id} className={result.stress.worst && result.stress.worst.id === s.id ? 'hl' : ''}>
                      <td><b>{s.id}. {cfg.stress_scenarios[i].name}</b><div className="small muted">{detail(s)}</div></td>
                      <td className="r nowrap">{mlnSom(-s.dE)}</td><td className="r nowrap">{mlnSom(s.E)}</td>
                      <td className="r">{sc(it.s41)}</td><td className="r">{sc(it.s42)}</td><td className="r">{sc(it.s43)}</td><td className="r">{sc(it.s44)}</td>
                      <td className="r">{num(it.agg, 2)}</td><td><span className={'tag t-' + ratingTone(it.index)}>{it.rating.national}</span>{it.notches !== result.adj.notches ? <span className="small muted"> (корр. {it.notches})</span> : ''}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
              <div className="small muted" style={{ marginTop: 6 }}>В стресс-сценариях прочие краткосрочные обязательства ({mlnSom(b4.debt.oth_st)}) считаются долгом; пересчитываются 4.1–4.4, валютное несоответствие (С2) и кризисная ликвидность.</div>
            </div>
          </div>
        )}
      </div>
      <aside className="work-side">
        {ok && (
          <div className="result-col">
            <div className="card"><div className="card-b">
              <div className="eyebrow">Прогноз по оценке</div>
              <div className="big-rating" style={{ fontSize: 26 }}>{result.outlook.label}</div>
              <ul className="small">{result.outlook.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <div className="kv"><span>Текущая оценка</span><b>{result.rating.national}</b></div>
              <div className="kv"><span>Прогнозная (4.1–4.3 по прогнозу)</span><b>{result.forecast.rating.national}</b></div>
              <div className="kv"><span>Стрессовая (худший: {result.stress.worst ? result.stress.worst.id : '—'})</span><b>{result.stress.worst ? result.stress.worst.rating.national : '—'}</b></div>
              {result.ref30 && <div className="kv"><span>Справочно: выручка и EBITDA −30%</span><b>{result.ref30.rating.national}</b></div>}
              {result.status !== 'rated' && <div className="capnote bad small">{result.message}</div>}
            </div></div>
            <div className="card"><div className="card-h"><h3>Порядок выбора прогноза</h3></div><div className="card-b small"><ol>{cfg.outlook_rules.map((r, i) => <li key={i}>{r}</li>)}</ol></div></div>
          </div>
        )}
      </aside>
    </div>
  );
}

function detail(s) {
  const d = s.detail || {};
  if (s.id === 'C1') return (d.parts || []).map((p) => `${subName(p.sub)}: ${p.shock}; d_о ${num(p.d_o * 100, 0)}%${p.d_c ? `, d_ц ${num(p.d_c * 100, 0)}%` : ''}${p.r ? `, r ${num(p.r * 100, 0)}%, t ${num(p.t, 2)}` : ''}, v_ш ${num(p.vsh, 2)}; сырьё ${mlnSom(p.C)}${p.C_default ? ' (по группе)' : ''}`).join(' · ');
  if (s.id === 'C2') return `валютная выручка +${mlnSom(d.fx_rev_gain)}, импорт −${mlnSom(d.import_loss)}, валютный долг +${mlnSom(d.fx_debt_add)}, проценты +${mlnSom(d.fx_int_add)}`;
  if (s.id === 'C3') return `потеря выручки ${mlnSom(d.lost_rev)} × (1 − v = ${num(1 - d.v, 2)})`;
  return `долг с плавающей ставкой ${mlnSom(d.float_debt)} × 5 п.п. = +${mlnSom(d.int_add)} процентов`;
}
