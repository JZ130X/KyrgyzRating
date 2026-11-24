import React from 'react';
import { cfg, subsectorParams, parseNum, fmtPct, NBKR_SECTOR_NAMES } from './engine.js';
import { num } from './format.js';

// Какие правила, веса и пороги программа подбирает для подсектора.
// Используется в профиле компании, в «Настройках» и в «Шкалах и правилах».

const f = (v) => num(v, Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 2 : 1);
const METRIC_NAMES = { rev: '1.1 выручка', mpm: '3.2 падение маржи', de: '4.1 Debt/EBITDA', ic: '4.2 покрытие процентов', rcf: '4.3 RCF/чистый долг', liq: '4.4 ликвидность', overdue: '6.1 просрочка', payables: '6.2 кредиторская задолженность' };
const GROUP_SHORT = { I: 'I — переработка сырьевых товаров', II: 'II — белковая продукция и плоды', III: 'III — первичное производство' };

function marginText(b) {
  return `Aaa от ${f(b[1])}%, Baa ${f(b[4])}–${f(b[3])}%, Ca ниже ${f(b[7])}%`;
}
function seasonText(g3) {
  const sc = cfg.seasonality_scales[g3 ? 'III' : 'I'];
  return `${g3 ? 'шкала первичного производства (сдвиг на 15 п.п.)' : 'общая шкала'}: Aaa до ${f(sc[0])}%, Baa до ${f(sc[3])}%`;
}

export function subsectorRows(code, settings, ctx) {
  const s = cfg.subsectors[code];
  const p = subsectorParams(settings, code);
  const rows = [];
  const changedBounds = Object.keys(p.changed.bounds).filter((k) => p.changed.bounds[k]);
  rows.push(['Веса подфакторов', p.changed.weights ? 'изменены в «Настройках» для этого подсектора' : 'по методологии (одинаковы для всех подсекторов)', p.changed.weights]);
  if (code === 'INT') {
    const segs = ctx && ctx.is_int ? [...ctx.segs].sort((a, b) => ctx.shares[b] - ctx.shares[a]) : [];
    rows.push(['Сегменты', segs.length ? segs.map((c) => `${cfg.subsectors[c].name} ${num(ctx.shares[c], 1)}%`).join('; ') : 'виды деятельности с долей выручки 10% и более (доли вводятся ниже)', false]);
    rows.push(['Шкалы сегментов', '1.3 перечни, 1.6 натуральный объём, 2.1 сырьё и параметры С1 — по каждому сегменту, баллы взвешиваются по долям выручки', false]);
    rows.push(['3.1 Маржа EBITDA', 'смешанная шкала: граница = Σ доля группы в выручке × граница группы' + (ctx && ctx.is_int ? ` (группа I ${num(ctx.gshare.I * 100, 0)}%, II ${num(ctx.gshare.II * 100, 0)}%, III ${num(ctx.gshare.III * 100, 0)}%)` : ''), false]);
    rows.push(['2.2.В Сезонность', 'смешанная шкала по доле первичного производства (группа III)', false]);
    rows.push(['Блок 4: сезонный долг', 'если сезонные виды деятельности дают 30% выручки и более' + (ctx && ctx.is_int ? (ctx.seasonal ? ' — применяется' : ' — не применяется') : ''), false]);
  } else {
    let g = s.group;
    let gNote = '';
    if (code === 'FSH') {
      g = ctx && ctx.main === 'FSH' ? ctx.group : 'III';
      gNote = ' (рыбопереработка от 50% выручки — группа II)';
    }
    rows.push(['3.1 Маржа EBITDA', `группа ${GROUP_SHORT[g] || g}${gNote}; ${marginText(p.changed.margin ? p.margin : cfg.margin_groups[g].bounds)}${p.changed.margin ? ' — пороги изменены в «Настройках»' : ''}`, p.changed.margin]);
    if (p.nat) rows.push(['1.6 Натуральный объём', `${s.nat.label}: Aaa от ${f(p.nat[1])} ${s.nat.unit}, Baa ${f(p.nat[4])}–${f(p.nat[3])}${p.changed.nat ? ' — пороги изменены в «Настройках»' : ''}`, p.changed.nat]);
    rows.push(['2.2.В Сезонность', seasonText(g === 'III'), false]);
    rows.push(['2.1 Ключевое сырьё', s.raw + (s.stock_na ? '; запас сырья (2.1.Б) не оценивается' : ''), false]);
    rows.push(['1.3.А Продукция с добавленной стоимостью', s.va_yes, false]);
    rows.push(['2.2.Г Защита, пункт 5', s.protect5 === 'storage' ? 'хранилища не менее чем на 2 месяца потребления' : 'программа ветеринарной или фитосанитарной защиты с охватом 100%', false]);
    rows.push(['Блок 4: сезонный долг', cfg.seasonal_subs.includes(code) ? 'применяется: средний долг за 4 квартала, вычет 70% подтверждённых ликвидных запасов' : 'не применяется: долг на дату баланса', false]);
    rows.push(['Стресс С1', s.c1.shock + (s.c1_proc ? `; переработка: ${s.c1_proc.shock.replace('Переработка: ', '')}` : ''), false]);
  }
  {
    const cur = ctx && ctx.main === code && ctx.settings ? ctx.settings : null;
    const nb = settings && settings.nbkr ? settings.nbkr : null;
    const ys = nb ? Object.keys(nb.new.years).sort() : [];
    const ly = ys.length ? ys[ys.length - 1] : null;
    const lyRate = nb && ly && p.nbkr_sector && nb.new.years[ly][p.nbkr_sector] ? nb.new.years[ly][p.nbkr_sector][0] : null;
    let txt;
    if (p.changed.market) txt = `${fmtPct(cur ? cur.market_rate : p.market_rate)}% — ставка подсектора, изменена в «Настройках» (важнее бюллетеня НБКР)`;
    else if (cur && cur.market_src === 'nbkr') txt = `${fmtPct(cur.market_rate)}% — ${cur.market_note}`;
    else if (cur && cur.market_src === 'segments') txt = `${fmtPct(cur.market_rate)}% — по долям сегментов: ${cur.market_note}`;
    else if (nb && p.nbkr_sector && !cur) txt = `${nb.title}: отрасль «${NBKR_SECTOR_NAMES[p.nbkr_sector]}», ставка за отчётный год компании` + (lyRate !== null ? ` (${ly} г. — ${fmtPct(lyRate)}%)` : '');
    else if (nb && code === 'INT' && !cur) txt = 'по долям сегментов: у каждого сегмента — ставка его подсектора из бюллетеня НБКР';
    else txt = `${fmtPct(cur ? cur.market_rate : p.market_rate)}% — ` + (nb && cur ? 'в бюллетене НБКР нет ставки за отчётный период, общая ставка из «Настроек»' : p.market_glob === 16 ? 'по методологии (общая для всех подсекторов)' : 'общая ставка из «Настроек»');
    const own = cur && ctx.raw ? parseNum(ctx.raw.mkt_rate) : null;
    const ownOk = own !== null && own >= 0.1 && own <= 100 && String(ctx.raw.s_mkt_rate || '').trim() !== '';
    rows.push(['Рыночная ставка: нормализация процентов (4.2–4.4)', txt + '.' + (ownOk ? ` Для этой компании действует ставка аналитика для отрасли: ${fmtPct(own)}%` : ' Ставку для отрасли за отчётный период аналитик может указать в профиле, с источником'), p.changed.market || p.changed.nbkr]);
  }
  rows.push(['Пороги количественных показателей', changedBounds.length ? 'изменены в «Настройках»: ' + changedBounds.map((k) => METRIC_NAMES[k]).join(', ') : 'по методологии', changedBounds.length > 0]);
  return rows;
}

export function SubsectorProfile({ code, settings, ctx, title }) {
  if (!code || !cfg.subsectors[code]) return null;
  const s = cfg.subsectors[code];
  const rows = subsectorRows(code, settings, ctx);
  return (
    <div className="subprof">
      <div className="subprof-h">
        <span className="subprof-ic">{s.icon}</span>
        <div><b>{title || 'Что программа подобрала для подсектора'}: {s.name}</b><div className="small muted">{s.desc}</div></div>
      </div>
      <div className="subprof-grid">
        {rows.map(([k, v, ch]) => (
          <div key={k} className={'subprof-row' + (ch ? ' changed' : '')}><span>{k}</span><div>{v}</div></div>
        ))}
      </div>
    </div>
  );
}

// Проверка введённых порогов (для «Настроек»)
export function boundsError(vals, dir) {
  const v = vals.map(parseNum);
  if (v.some((x) => x === null)) return 'заполните все 9 значений числами';
  for (let i = 0; i < 8; i++) {
    if (dir === 'higher' && !(v[i] > v[i + 1])) return 'значения должны убывать слева направо (больше — лучше)';
    if (dir === 'lower' && !(v[i] < v[i + 1])) return 'значения должны возрастать слева направо (меньше — лучше)';
  }
  return null;
}
