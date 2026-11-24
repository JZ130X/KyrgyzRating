// Подписи и форматирование результатов для интерфейса и отчёта (тексты только описывают расчёт, без оценочных суждений).
import { cfg, ratingGroupKey } from './engine.js';
import { num, isN } from './format.js';

export const SF = Object.fromEntries(cfg.subfactors.map((s) => [s.code, s]));
export const BLOCK = Object.fromEntries(cfg.blocks.map((b) => [b.id, b]));
export const IND = Object.fromEntries(cfg.indicators.map((x) => [x.code, x]));
export const ADJ = Object.fromEntries(cfg.adjustment_rules.map((a) => [a.id, a]));
export const FIELDS = Object.fromEntries(cfg.fields.map((f) => [f.key, f]));
export const SUBS = cfg.subsectors;
export const subName = (c) => (c === 'INT' ? cfg.subsectors.INT.name : c && cfg.subsectors[c] ? cfg.subsectors[c].name : '—');

export function fmtVal(v, unit, dec = 1) {
  if (!isN(v)) return '—';
  if (unit === '%') return num(v, dec) + '%';
  if (unit === 'x') return num(v, 2) + '×';
  if (unit === 'п.п.') return num(v, 1) + ' п.п.';
  if (unit === 'млн сом') return num(v, 0) + ' млн сом';
  if (unit === 'дней') return num(v, 0) + ' дн.';
  if (unit === 'баллов') return num(v, 0) + ' балл.';
  if (!unit) return num(v, dec);
  return num(v, dec) + ' ' + unit;
}
export const mlnSom = (x, d = 1) => (isN(x) ? num(x / 1e6, d) + ' млн сом' : '—');

export function indValue(i) {
  if (i.na) return 'не применяется';
  if (!isN(i.value)) return i.note && !i.missing ? i.note : '—';
  return fmtVal(i.value, i.unit, i.dec);
}

// Значение подфактора для таблицы скоркарда
export function sfValue(res, code) {
  const s = res.sf[code];
  if (!s) return '—';
  if (['4.1', '4.2', '4.3'].includes(code)) {
    const u = s.unit;
    const f = isN(s.fact.value) ? fmtVal(s.fact.value, u) : s.fact.note || '—';
    const g = isN(s.fc.value) ? fmtVal(s.fc.value, u) : s.fc.note || '—';
    return `факт ${f}; прогноз ${g}`;
  }
  if (code === '1.6' && s.parts && s.parts.length > 1) return 'по сегментам';
  if (isN(s.value)) {
    const m = cfg.metrics[s.metric] || {};
    return fmtVal(s.value, s.unit || m.unit, m.dec ?? 2);
  }
  if (s.note && !s.indicators) return s.note;
  return s.indicators || s.parts || s.segments ? 'по индикаторам' : '—';
}

// Все группы индикаторов подфактора: [[подпись, индикаторы], …]
export function indicatorGroups(s) {
  const out = [];
  if (!s) return out;
  if (s.indicators) out.push(['', s.indicators]);
  for (const p of s.parts || []) if (p.indicators) out.push([p.label || '', p.indicators]);
  for (const sg of s.segments || []) {
    if (sg.indicators) out.push([sg.label || '', sg.indicators]);
    for (const p of sg.parts || []) out.push([(sg.label || '') + ': ' + (p.label || ''), p.indicators]);
  }
  return out;
}

export const POINT_LABELS = {
  power: 'резервное электроснабжение от 50% критической нагрузки',
  water: 'гарантированный источник воды',
  prop: 'страхование имущества',
  bio: 'страхование урожая, поголовья или биоактивов от 50% стоимости',
  vet: 'программа ветеринарной или фитосанитарной защиты (охват 100%)',
  storage: 'хранилища с контролем температуры и влажности от 2 месяцев потребления',
  drip: 'капельное или микродождевальное орошение',
  net: 'противоградовая сетка',
  frost: 'защита от весенних заморозков',
  cert: 'сертифицированный посадочный материал',
  cold: 'холодильное хранилище от 30% среднего урожая',
  benef: 'бенефициары раскрыты и подтверждены',
  sanct: 'нет санкций США, ЕС, Великобритании (компания, владельцы, банки)',
  cash: 'наличные поступления не больше 20% выручки',
  hr: 'нет операций со странами высокого риска (или до 5% с документами)',
  viol: 'нет решений о нарушении валютного, таможенного законодательства и ПОД/ФТ за 3 года',
};
export const DEBT_MODE = {
  bal: 'долг на дату баланса',
  bal_inv: 'долг на дату баланса за вычетом 70% ликвидных запасов',
  avg: 'средний долг за 4 квартала',
  avg_inv: 'средний за 4 квартала долг за вычетом 70% ликвидных запасов на каждую дату',
};
export const TAX_SRC = {
  exempt: 'компания освобождена от налога на прибыль',
  cfs: 'налог, уплаченный по ОДДС',
  pl: 'текущий налог по ОПУ',
  pbt10: '10% прибыли до налогообложения',
  none: 'данных о налоге нет — принят 0',
};
export const TEST_RESULT = { pass: 'пройден', fail: 'не пройден', explain: 'требует пояснений', '': 'не проверен' };
export const RESTR_TYPE = { 1: 'системная', 2: 'техническая', 3: 'вынужденная', 4: 'приравнена к дефолту' };
export const STATUS_TEXT = { rated: 'Оценка рассчитана', insufficient: 'Оценка не присваивается: недостаточно информации', stop: 'Оценка не присваивается: стоп-фактор ПОД/ФТ', error: 'Расчёт невозможен' };

export function ratingMeaning(national) {
  return cfg.rating_group_info[ratingGroupKey(national)] || '';
}

export function adjText(it) {
  const a = ADJ[it.id];
  let v = '';
  if (it.id === 'fx') v = `долг в валюте ${num(it.debt_share, 1)}% − выручка в валюте ${num(it.rev_share, 1)}% = ${num(it.value, 1)} п.п.`;
  else if (it.id === 'undisclosed') v = `нерасшифрованные обязательства ${num(it.value, 1)}% всех обязательств`;
  else if (it.id === 'state') v = [it.plus ? 'государственная доля от 50% или стратегический объект (+1)' : '', it.minus ? 'регулируемые цены от 30% выручки (−1)' : ''].filter(Boolean).join('; ');
  else if (it.id === 'event') v = `от одного разрешения зависит ${num(it.value, 1)}% выручки`;
  else if (it.id === 'pledges') v = [isN(it.value) ? `залоги за владельцев ${num(it.value, 1)}% капитала` : 'залоги за владельцев при капитале ≤ 0', isN(it.nonmarket) ? `нерыночные сделки ${num(it.nonmarket, 1)}% активов` : ''].filter(Boolean).join('; ');
  else if (it.id === 'crisis') v = `коэффициент на 6 месяцев ${num(it.value, 2)}×`;
  else if (it.id === 'aml') v = it.what === 'sanctions' ? 'санкции США, ЕС или Великобритании — итог не выше B1' : 'уголовное дело о легализации доходов';
  else if (it.id === 'credit') v = it.what === 'default' ? 'дефолт за 5 лет — итог не лучше B1' : [it.what.includes('type3') ? 'вынужденная реструктуризация за 36 месяцев' : '', it.what.includes('refused') ? 'отказ в согласии на запрос бюро' : ''].filter(Boolean).join('; ');
  return { name: a ? a.name : it.id, value: v };
}

// Средний балл и вклад блоков
export function blockStats(res) {
  return cfg.blocks.map((b) => {
    const sfs = cfg.subfactors.filter((s) => s.block === b.id);
    let w = 0, s = 0;
    for (const x of sfs) { const r = res.sf[x.code]; w += r.weight; s += r.weight * r.score; }
    const tw = cfg.subfactors.reduce((a, x) => a + res.sf[x.code].weight, 0);
    return { id: b.id, name: b.name, short: b.short, weight: tw > 0 ? (w / tw) * 100 : 0, avg: w > 0 ? s / w : null, weighted: tw > 0 ? s / tw : null };
  });
}

export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
