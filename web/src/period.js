// Отчётный период: годы и даты, которые программа выводит из последнего полного финансового года,
// даты баланса и даты оценки; перенос оценки на следующий год; автосвязь года и даты баланса.
// period_info и next_year_inputs — построчный порт раздела 15а kg_agro_rating.py (сверка — tools/period_parity.py).
import { cfg, parseNum, rawStr } from './engine.js';
import { dateIso, isoRu, addMonths, addDays, mdays, ymd } from './process.js';

const p2 = (n) => String(n).padStart(2, '0');
const p4 = (n) => String(n).padStart(4, '0');
const clone = (x) => JSON.parse(JSON.stringify(x));
const NY = cfg.next_year;

export function validYear(v) {
  const x = parseNum(v);
  if (x === null || x < 1990 || x > 2100) return null;
  return Math.trunc(x);
}

// Сдвиг на n месяцев; последний день месяца остаётся последним (30.06 → 31.12, 28.02.2027 → 29.02.2028)
export function addMonthsEom(iso, n) {
  const [y, m, d] = ymd(iso);
  if (d === mdays(y, m)) {
    const t = y * 12 + (m - 1) + n;
    const y2 = Math.floor(t / 12), m2 = (t % 12) + 1;
    return `${p4(y2)}-${p2(m2)}-${p2(mdays(y2, m2))}`;
  }
  return addMonths(iso, n);
}

export function periodInfo(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ry = validYear(r.report_year);
  let fy = rawStr(r.fy_type) || 'year';
  if (!['year', 'ltm', 'interim'].includes(fy)) fy = 'year';
  let mo = parseNum(r.interim_months);
  mo = [3, 6, 9].includes(mo) ? Math.trunc(mo) : 6;
  const bal = dateIso(r.bal_date);
  const ev = dateIso(r.eval_date);
  const hy = validYear(r.harvest_year);
  const out = { report_year: ry, fy_type: fy, interim_months: mo, bal, eval: ev, harvest_year: hy !== null ? hy : ry, bal_assumed: false };
  let be = bal;
  if (be === null && ry !== null && fy === 'year') { be = `${p4(ry)}-12-31`; out.bal_assumed = true; }
  out.bal_eff = be;
  out.years = ry !== null ? [0, 1, 2, 3, 4].map((i) => ry - i) : null;
  out.begin = null;
  out.m12_from = null;
  out.fc_from = null; out.fc_to = null; out.f6_to = null;
  out.quarters = null;
  if (be !== null) {
    out.begin = fy === 'ltm' ? addDays(addMonthsEom(be, -12), 1) : be.slice(0, 4) + '-01-01';
    out.m12_from = addDays(addMonthsEom(be, -12), 1);
    out.fc_from = addDays(be, 1);
    out.fc_to = addMonthsEom(be, 12);
    out.f6_to = addMonthsEom(be, 6);
    out.quarters = [1, 2, 3].map((k) => addMonthsEom(be, -3 * k));
  }
  out.e36_from = ev ? addDays(addMonths(ev, -36), 1) : null;
  out.e60_from = ev ? addDays(addMonths(ev, -60), 1) : null;
  out.next_year = ry !== null ? ry + 1 : null;
  out.next_bal = be !== null ? addMonthsEom(be, 12) : null;
  return out;
}

export function nextYearInputs(raw, todayIsoStr) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const pi = periodInfo(r);
  if (pi.report_year === null) return { inputs: null, error: 'Укажите последний полный финансовый год — от него считается следующий.' };
  const out = {};
  for (const f of cfg.fields) {
    const k = f.key;
    if (f.card === 'profile' && !NY.reset_profile.includes(k) && Object.prototype.hasOwnProperty.call(r, k)) out[k] = clone(r[k] === undefined ? null : r[k]);
  }
  out.report_year = pi.next_year;
  if (pi.next_bal !== null) out.bal_date = isoRu(pi.next_bal);
  out.eval_date = isoRu(todayIsoStr);
  for (const [key, n] of NY.shift) {
    for (let y = n - 1; y > 0; y -= 1) {
      const v = r[`${key}_${y - 1}`];
      if (v !== null && v !== undefined && v !== '') out[`${key}_${y}`] = clone(v);
    }
  }
  for (const [dst, src] of NY.pairs) {
    const v = r[src];
    if (v !== null && v !== undefined && v !== '') out[dst] = clone(v);
  }
  const hy = validYear(r.harvest_year);
  if (hy !== null) out.harvest_year = hy + 1;
  for (const t of NY.tables) {
    const rows = r[t];
    if (Array.isArray(rows) && rows.length > 0) out[t] = clone(rows);
  }
  return { inputs: out, error: null };
}

// ── Автосвязь полей периода при вводе: год → 31.12 этого года; дата баланса → год (если год пуст)
export function syncPeriod(form, key, value) {
  const next = { ...form, [key]: value };
  if (key === 'report_year') {
    const ny = validYear(value);
    const fy = rawStr(form.fy_type) || 'year';
    const bal = rawStr(form.bal_date);
    if (ny !== null && fy === 'year' && (bal === '' || /^31\.12\.\d{4}$/.test(bal))) next.bal_date = `31.12.${ny}`;
  } else if (key === 'bal_date') {
    const iso = dateIso(value);
    if (iso && rawStr(form.report_year) === '') {
      const [y, m, d] = ymd(iso);
      next.report_year = m === 12 && d === 31 ? y : y - 1;
    }
  } else if (key === 'fy_type' && value === 'year') {
    const ry = validYear(form.report_year);
    if (ry !== null && rawStr(form.bal_date) === '') next.bal_date = `31.12.${ry}`;
  }
  return next;
}

// ── Подписи: конкретный год или даты для кода периода поля (см. FIELD_PERIODS в c_fields.py)
const ru = (iso) => (iso ? isoRu(iso) : null);
const isYearEnd = (iso) => !!iso && iso.slice(5) === '12-31';
const yr = (y) => `${y} г.`;
export function periodText(code, P) {
  if (!code || !P) return null;
  const ry = P.report_year;
  const be = P.bal_eff;
  switch (code) {
    case 'p0':
      if (P.fy_type === 'year') return ry !== null ? yr(ry) : null;
      if (!be) return null;
      return P.fy_type === 'ltm' ? `12 мес. по ${ru(be)}` : `${P.interim_months} мес. по ${ru(be)}`;
    case 'y0': return ry !== null ? yr(ry) : null;
    case 'y1': return ry !== null ? yr(ry - 1) : null;
    case 'y3': return ry !== null ? `${ry - 2}–${ry} гг.` : null;
    case 'y5': return ry !== null ? `${ry - 4}–${ry} гг.` : null;
    case 'yn': return ry !== null ? yr(ry + 1) : null;
    case 'h0': case 'h1': case 'h2': return P.harvest_year !== null ? yr(P.harvest_year - Number(code[1])) : null;
    case 'bal': return be ? `на ${ru(be)}` : null;
    case 'beg': return P.begin ? `на ${ru(P.begin)}` : null;
    case 'q1': case 'q2': case 'q3': return P.quarters ? `на ${ru(P.quarters[Number(code[1]) - 1])}` : null;
    case 'm12': return be ? (isYearEnd(be) ? yr(Number(be.slice(0, 4))) : `${ru(P.m12_from)}–${ru(be)}`) : null;
    case 'f12': return be ? (isYearEnd(be) ? yr(Number(be.slice(0, 4)) + 1) : `${ru(P.fc_from)}–${ru(P.fc_to)}`) : null;
    case 'f6': return be ? `${ru(P.fc_from)}–${ru(P.f6_to)}` : null;
    case 'ev': return P.eval ? `на ${ru(P.eval)}` : null;
    case 'e36': return P.eval ? `${ru(P.e36_from)}–${ru(P.eval)}` : null;
    case 'e60': return P.eval ? `${ru(P.e60_from)}–${ru(P.eval)}` : null;
    default: return null;
  }
}
export const groupPeriod = (g) => (cfg.group_periods || {})[g] || '';
export { canonical } from './engine.js';
