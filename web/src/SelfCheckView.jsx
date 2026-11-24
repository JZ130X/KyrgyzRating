import React, { useMemo } from 'react';
import { cfg, compute, ratingIndex, ruleCategory, IND_MAP, categoryForValue, normalizeSettings } from './engine.js';
import { Icon } from './ui.jsx';
import { num } from './format.js';
import { committeeCheck, monitoring, addMonths, addDays, dateIso } from './process.js';
import { makeEntry } from './archive.js';
import { periodInfo, nextYearInputs, syncPeriod, periodText } from './period.js';

const M = 1e6;
const base = () => ({ sh_DAI: 100, rev_0: 1000 * M, op_0: 100 * M, da_0: 20 * M });
const demo = (k) => cfg.demos.find((d) => d.key === k).inputs;

export function runChecks() {
  const out = [];
  const chk = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail: String(detail) });
  let r = compute({ sh_DAI: 100, rev_0: 1600 * M, op_0: 1 });
  chk('В.1: выручка 1 600 млн сом → 11,03', r.sf['1.1'].score === 11.03, r.sf['1.1'].score);
  r = compute({ ...base(), i14A: 18, s14A: 'x', i14B: 52, s14B: 'x', i14V: 64, s14V: 'x', i14G: 22, s14G: 'x' });
  chk('В.2: пример 1.4 → 10,05', r.sf['1.4'].score === 10.05, r.sf['1.4'].score);
  const g = compute(demo('garden'));
  chk('2.1.7: балл 2.1.2 = 7,05', g.sf['2.1'].parts[1].score === 7.05, g.sf['2.1'].parts[1].score);
  chk('2.1.7: балл 2.1 = 8,00', g.sf['2.1'].score === 8, g.sf['2.1'].score);
  chk('2.1.7: приведённая площадь 390 га → 13,62', g.sf['1.6'].value === 390 && g.sf['1.6'].score === 13.62, g.sf['1.6'].score);
  r = compute({ ...base(), r61_report: 'yes', i61_max36: 12 });
  chk('6.1: просрочка 12 дней → 6,3', r.sf['6.1'].score === 6.3, r.sf['6.1'].score);
  const p62 = { ...base(), p62_sup: 220, p62_tax: 30, p62_soc: 15, p62_wage: 25, p62_oth: 10, i62_overdue: 24 };
  r = compute(p62);
  chk('6.2: 8% → 9,0', r.sf['6.2'].score === 9, r.sf['6.2'].score);
  r = compute({ ...p62, f62_tax90: true });
  chk('6.2: налоги просрочены > 90 дней → 13,5', r.sf['6.2'].score === 13.5, r.sf['6.2'].score);
  chk('Граница «меньше = лучше»: 15% → A', ruleCategory(15, IND_MAP['1.4.А'].rules, 'Ca') === 'A');
  chk('Граница «больше = лучше»: 1,0x → Baa', ruleCategory(1.0, IND_MAP['1.2.Б'].rules, 'Ca') === 'Baa');
  chk('Просрочка 6 дней → A', categoryForValue(6, cfg.metrics.overdue.bounds, 'lower', true) === 'A');
  chk('Шкала: 10,50 → Baa3; 10,51 → Ba1', cfg.rating_scale[ratingIndex(10.5)].internal === 'Baa3' && cfg.rating_scale[ratingIndex(10.51)].internal === 'Ba1');
  r = compute({ ...demo('dairy'), f53_list: true });
  chk('Стоп-фактор ПОД/ФТ → оценка не присваивается', r.status === 'stop');
  r = compute({ sh_DAI: 100 });
  chk('Нет отчётности → недостаточно информации', r.status === 'insufficient');
  const m = compute(demo('mill'));
  chk('Сезонный долг с вычетом запасов: 301,25 млн', Math.abs(m.b4.debt.d41 / M - 301.25) < 1e-6, num(m.b4.debt.d41 / M, 2));
  const a1 = compute(demo('dairy')), a2 = compute(JSON.parse(JSON.stringify(demo('dairy'))));
  chk('Повторный расчёт даёт тот же код', a1.result_hash === a2.result_hash);
  // Процедура комитета (те же правила, что в Python)
  const dd = { ...demo('dairy'), docs: { s12: [{ id: '0'.repeat(64), name: 'x.pdf', size: 1 }] } };
  chk('Прикреплённые документы не меняют расчёт', compute(dd).result_hash === cfg.golden.dairy);
  const ed = makeEntry(compute(demo('dairy')), demo('dairy'), null);
  const mem = [{ name: 'Председатель П. П.', role: 'chair', vote: 'for' }, { name: 'Член А. А.', role: 'member', vote: 'for' }, { name: 'Член Б. Б.', role: 'member', vote: 'against' }];
  const pr = { check: { by: 'Второй В. В.', date: '17.11.2026', result: 'ok' }, committee: { number: 'КР-1', date: '18.11.2026', members: mem, decision: 'approve' } };
  const cr = committeeCheck(ed, pr);
  chk('Комитет: 2 из 3 «за» → утверждена оценка программы', cr.decision && cr.decision.final_index === ed.final_index && cr.decision.deviation === 0);
  chk('Комитет: проверяющий не может быть тем же аналитиком', committeeCheck(ed, { ...pr, check: { ...pr.check, by: ' абдыкадырова  а. т.' } }).errors_check.some((x) => x.includes('Проверяющий совпадает')));
  chk('Комитет: конфликт интересов → нет кворума', committeeCheck(ed, { ...pr, committee: { ...pr.committee, members: mem.map((m, i) => (i === 2 ? { ...m, conflict: true } : m)) } }).errors_committee.some((x) => x.includes('Нет кворума')));
  chk('Сроки: 12 месяцев, 90 дней, 29.02 → 28.02', addMonths('2026-11-18', 12) === '2027-11-18' && addDays('2026-11-18', 90) === '2027-02-16' && addMonths('2028-02-29', 12) === '2029-02-28' && dateIso('31.02.2026') === null);
  const fin = { ...ed, process: { ...pr, decision: cr.decision, finalized_at: '2026-11-18T10:00:00.000Z' }, status: 'approved' };
  const mn = monitoring([fin], '2027-11-01');
  chk('Мониторинг: «Присвоен», пересмотр до 18.11.2027 — скоро', mn.actions[0].action === 'assigned' && mn.active[0].next_review === '18.11.2027' && mn.active[0].review_state === 'soon');
  const dm = demo('dairy');
  const pi = periodInfo(dm);
  chk('Отчётный период: 2025…2021, прогноз 2026, окно 36 месяцев с 17.11.2023', pi.years.join() === '2025,2024,2023,2022,2021' && periodText('f12', pi) === '2026 г.' && periodText('e36', pi) === '17.11.2023–16.11.2026' && periodText('q2', pi) === 'на 30.06.2025');
  const sp = syncPeriod({ report_year: 2025, bal_date: '31.12.2025' }, 'report_year', 2026);
  const sp2 = syncPeriod({}, 'bal_date', '30.06.2027');
  chk('Год 2026 → дата баланса 31.12.2026; баланс 30.06.2027 → последний полный год 2026', sp.bal_date === '31.12.2026' && sp2.report_year === 2026);
  const dw = compute({ ...dm, bal_date: '31.12.2024' });
  chk('Несогласованные даты → предупреждение, расчёт не меняется', dw.warnings.some((w) => w.includes('не совпадает с концом')) && dw.result_hash === compute(dm).result_hash);
  const ny = nextYearInputs(dm, '2027-11-20').inputs;
  chk('Следующий год: 2026, баланс 31.12.2026; выручка 2025 переходит в прошлый год', ny.report_year === 2026 && ny.bal_date === '31.12.2026' && ny.rev_1 === dm.rev_0 && ny.rev_0 === undefined && ny.s12 === undefined && ny.company === dm.company);
  const pz = { ...cfg.demos.find((d) => d.key === 'problem').inputs, fin_int: 0 };
  const ra = compute({ ...pz, mkt_rate: 14, s_mkt_rate: 'НБКР, 2025' });
  chk('Нормализация процентов по ставке аналитика для отрасли (14%, с источником)', ra.b4.int.recompute && ra.b4.int.market_src === 'input' && Math.abs(ra.b4.int.used - 18.9e6) < 1);
  const rb = compute({ ...pz, mkt_rate: 14 });
  chk('Ставка без источника не учитывается → 16% и предупреждение', rb.b4.int.market_src === 'all' && Math.abs(rb.b4.int.used - 21.6e6) < 1 && rb.warnings.some((w) => w.includes('без источника')));
  const [so] = normalizeSettings({ subsectors: { PRM: { market_rate: 18 } } });
  const rc = compute(pz, so);
  chk('Ставка подсектора из «Настроек» → 18%', rc.b4.int.market_src === 'sub' && Math.abs(rc.b4.int.used - 24.3e6) < 1);
  const nbs = { title: 'Бюллетень НБКР', new: { years: { 2025: { agri: [17.35, 39686], ind: [15.95, 5114] } }, months: {} } };
  const [sn] = normalizeSettings({ nbkr: nbs });
  const rn = compute(pz, sn);
  chk('Бюллетень НБКР: животноводство за 2025 год → «сельское хозяйство» 17,35%', rn.b4.int.market_src === 'nbkr' && Math.abs(rn.b4.int.market - 0.1735) < 1e-12);
  const [sn2] = normalizeSettings({ nbkr: nbs, subsectors: { PRM: { market_rate: 19 } } });
  chk('Своя ставка подсектора важнее бюллетеня', compute(pz, sn2).b4.int.market_src === 'sub');
  const mon = {};
  for (let m = 1; m <= 12; m++) mon['2025-' + String(m).padStart(2, '0')] = { agri: [16 + m * 0.1, 10 * m] };
  const [sn3] = normalizeSettings({ nbkr: { title: 'Бюллетень НБКР', new: { years: {}, months: mon } } });
  const rl = compute({ ...pz, fy_type: 'ltm', bal_date: '31.12.2025' }, sn3);
  chk('Бюллетень, LTM: среднее 12 помесячных ставок, как годовая ставка НБКР (16,65%)', rl.b4.int.market_src === 'nbkr' && Math.abs(rl.b4.int.market - 0.1665) < 1e-12);
  const rk = compute({ ...pz, key_rate: 20 }, sn);
  chk('Рыночная ставка ниже ключевой → предупреждение о льготных программах', rk.warnings.some((w) => w.includes('ниже ключевой ставки НБКР 20%')));
  const ef = compute(dm).b4.int.eff;
  const [sl] = normalizeSettings({ market_rate: Math.round(ef * 5000) / 100 });
  const rlw = compute({ ...dm, key_rate: Math.round(ef * 40000) / 100 }, sl);
  chk('Нормализация не уменьшает проценты: рыночная ставка ниже фактической → проценты фактические', !rlw.b4.int.recompute && rlw.b4.int.used === rlw.b4.int.actual && rlw.warnings.some((w) => w.includes('проценты оставлены фактическими')));
  for (const d of cfg.demos) {
    const rr = compute(d.inputs);
    chk(`Эталон Python для примера «${d.title}»`, rr.result_hash === cfg.golden[d.key], rr.result_hash.slice(0, 16));
  }
  return out;
}

export default function SelfCheckView({ py, result }) {
  const checks = useMemo(() => runChecks(), []);
  const bad = checks.filter((c) => !c.ok).length;
  return (
    <div className="selfcheck">
      <div className={'callout ' + (bad ? 'warn' : '')}>
        <b>{bad ? `Найдено расхождений: ${bad}` : 'Все проверки пройдены'}</b> — {checks.length} проверок: примеры из скоркарда (выручка 1 600 млн сом → 11,03; пример сада 2.1.7; просрочка 12 дней → 6,3; кредиторская задолженность 8% → 9,0), правило границ, шкала, стоп-факторы, сезонный долг, правила рейтингового комитета и сроки пересмотра, эталонные результаты обучающих примеров, посчитанные Python-движком.
      </div>
      <div className="card"><div className="card-b">
        <table className="tbl"><tbody>{checks.map((c, i) => <tr key={i}><td style={{ width: 28 }}>{c.ok ? '✓' : '✗'}</td><td>{c.name}</td><td className="mono small">{c.ok ? '' : c.detail}</td></tr>)}</tbody></table>
      </div></div>
      <div className="card"><div className="card-h"><Icon name="shield" /><h3>Сверка с Python</h3></div><div className="card-b small">
        {py.status === 'match' && <p>✓ Python-движок посчитал текущие данные — результат совпал побитово (код {result.result_hash.slice(0, 16)}).</p>}
        {py.status === 'diff' && <p>⚠ Python-движок получил другой результат: {py.pyFinal || '—'}. Проверьте, что программа и Python-файл одной версии.</p>}
        {['off', 'file'].includes(py.status) && <p>Python-сервер не подключён: расчёт идёт в браузере по тем же правилам. Для сверки и общего архива запустите <span className="mono">python kg_agro_rating.py serve</span> и откройте http://127.0.0.1:8765. Полная самопроверка движка: <span className="mono">python kg_agro_rating.py selftest</span>.</p>}
        {['on', 'wait'].includes(py.status) && <p>Идёт сверка с Python…</p>}
      </div></div>
    </div>
  );
}
