// Kyrgyz Rating (модуль АПК) — JS-движок. Построчный порт kg_agro_rating.py (разделы 6–11).
// Правила и таблицы берутся из config.json, который выгружает Python (export-config).
// Любое изменение формул вносится сначала в Python, затем сюда; совпадение проверяется сравнением результатов.
import CFG from './config.json';

export const cfg = CFG;
const C = CFG;

// ════════════════════════════════════════════════════════════════════════
// 1. Вспомогательные функции (совпадают с Python 1:1)
// ════════════════════════════════════════════════════════════════════════

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const nz = (x) => (isNum(x) ? x : 0);

export function q(x, digits) {
  if (!isNum(x)) return null;
  const m = 10 ** digits;
  let r = Math.floor(x * m + 0.5 + 1e-9) / m;
  if (r === 0) r = 0;
  return r;
}
export function fmtFixed(x, digits) {
  if (!isNum(x)) return null;
  const r = q(x, digits);
  return r.toFixed(digits);
}
export function fmtNum(x, d = 2) {
  if (!isNum(x)) return '—';
  let s = fmtFixed(x, d);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let ip = s;
  let fp = '';
  if (s.includes('.')) [ip, fp] = s.split('.');
  let grp = '';
  while (ip.length > 3) {
    grp = ' ' + ip.slice(-3) + grp;
    ip = ip.slice(0, -3);
  }
  const out = ip + grp + (fp ? ',' + fp : '');
  return (neg ? '−' : '') + out;
}
function canonNum(x) {
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x === 0 ? 0 : x);
  const m = Math.floor(x * 1e6 + 0.5);
  if (m === 0) return '0';
  const neg = m < 0;
  const s = BigInt(Math.abs(m)).toString().padStart(7, '0');
  const ip = s.slice(0, -6);
  const fp = s.slice(-6).replace(/0+$/, '');
  return (neg ? '-' : '') + ip + (fp ? '.' + fp : '');
}
export function canonical(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return Number.isFinite(obj) ? canonNum(obj) : 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(String(k)) + ':' + canonical(obj[k])).join(',') + '}';
  }
  return JSON.stringify(String(obj));
}

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Hex(str) {
  return sha256BytesHex(new TextEncoder().encode(str));
}
export function sha256BytesHex(bytes) {
  const len = bytes.length;
  const withPad = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(withPad);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(withPad - 8, Math.floor((len * 8) / 0x100000000));
  dv.setUint32(withPad - 4, (len * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15], w2 = W[i - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map((x) => x.toString(16).padStart(8, '0')).join('');
}

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/ /g, '').replace(/ /g, '').replace(/ /g, '').replace(/,/g, '.');
  s = s.replace(/−/g, '-');
  if (s === '' || s === '-' || s === '.') return null;
  if (!NUM_RE.test(s)) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}
const DATE_RE = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/;
export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}
export function monthsBetween(a, b) {
  let m = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) m -= 1;
  return m;
}
export const textOk = (s) => typeof s === 'string' && s.trim() !== '';

// ── индексы конфигурации
const FIELD = {};
for (const f of C.fields) FIELD[f.key] = f;
export const FIELD_MAP = FIELD;
const IND = {};
for (const x of C.indicators) IND[x.code] = x;
export const IND_MAP = IND;
const GARDEN = {};
for (const g of C.garden_kinds) GARDEN[g.key] = g;
const COMMODITY = {};
for (const c of C.commodity_groups) COMMODITY[c.key] = c;
const SUBS = C.subsectors;
const CATS = C.categories;
const CAT_SCORES = C.category_scores;
const DEFAULT = C.default_score;
const SF_CODES = C.sf_codes;
const METRICS = C.metrics;

const L7 = (vals) => vals.map((v, i) => [CATS[i], '<=', v]);

// ════════════════════════════════════════════════════════════════════════
// 2. Настройки
// ════════════════════════════════════════════════════════════════════════

export const BOUND_KEYS = C.bound_keys;
const SEGMENT_SUBS = C.segment_subs;
export function defaultSettings() {
  return JSON.parse(JSON.stringify(C.default_settings));
}
// Веса и пороги подсектора по методологии
export function subDefaultParams(c) {
  const p = { weights: {}, bounds: {} };
  for (const sf of C.subfactors) p.weights[sf.code] = sf.weight;
  for (const k of BOUND_KEYS) p.bounds[k] = [...METRICS[k].bounds];
  if (SEGMENT_SUBS.includes(c)) {
    p.margin = [...C.margin_groups[SUBS[c].group].bounds];
    if (SUBS[c].nat.bounds) p.nat = [...SUBS[c].nat.bounds];
  }
  return p;
}
export function validBounds(b, dir) {
  if (!Array.isArray(b) || b.length !== 9) return false;
  for (const x of b) if (!isNum(x)) return false;
  for (let i = 0; i < 8; i++) {
    if (dir === 'higher' && !(b[i] > b[i + 1])) return false;
    if (dir === 'lower' && !(b[i] < b[i + 1])) return false;
  }
  return true;
}
function normBounds(v, dir) {
  if (!Array.isArray(v)) return null;
  const cand = v.map(parseNum);
  return validBounds(cand, dir) ? cand : null;
}
export function sameArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function normOverride(c, ov, notes, glob = null) {
  const out = {};
  if (!isObj(ov)) return out;
  const d = subDefaultParams(c);
  const name = SUBS[c].name;
  const w = ov.weights;
  if (isObj(w)) {
    let ok = true;
    let tot = 0;
    const vals = {};
    for (const code of SF_CODES) {
      const x = parseNum(w[code]);
      if (x === null || x < 0) { ok = false; break; }
      vals[code] = x;
      tot += x;
    }
    if (ok && tot > 0) {
      let diff = false;
      for (const code of SF_CODES) if (vals[code] !== d.weights[code]) diff = true;
      if (diff) out.weights = vals;
    } else notes.push(name + ': веса подфакторов заданы неверно — используются веса методологии.');
  }
  const b = ov.bounds;
  if (isObj(b)) {
    const ob = {};
    for (const k of BOUND_KEYS) {
      if (has(b, k)) {
        const cand = normBounds(b[k], METRICS[k].dir);
        if (cand === null) notes.push(name + ': пороги «' + METRICS[k].name + '» заданы неверно — используются пороги методологии.');
        else if (!sameArr(cand, d.bounds[k])) ob[k] = cand;
      }
    }
    if (Object.keys(ob).length > 0) out.bounds = ob;
  }
  for (const [key, label] of [['margin', 'маржи EBITDA (3.1)'], ['nat', 'натурального объёма (1.6)']]) {
    if (has(ov, key) && has(d, key)) {
      const cand = normBounds(ov[key], 'higher');
      if (cand === null) notes.push(name + ': пороги ' + label + ' заданы неверно — используются пороги методологии.');
      else if (!sameArr(cand, d[key])) out[key] = cand;
    }
  }
  if (has(ov, 'market_rate') && ov.market_rate !== null && ov.market_rate !== undefined && ov.market_rate !== '') {
    const x = parseNum(ov.market_rate);
    if (x === null || !(0.1 <= x && x <= 100)) notes.push(name + ': рыночная ставка задана неверно (нужно 0,1–100%) — используется общая ставка.');
    else if (x !== (glob !== null ? glob : defaultSettings().market_rate)) out.market_rate = x;
  }
  const ns = ov.nbkr_sector;
  if (ns !== null && ns !== undefined && ns !== '') {
    if (!NBKR_KEYS.includes(ns)) notes.push(name + ': неизвестная отрасль бюллетеня НБКР «' + ns + '» — используется отрасль по умолчанию.');
    else if (ns !== C.nbkr_default_map[c]) out.nbkr_sector = ns;
  }
  return out;
}
export function normalizeSettings(raw) {
  const out = defaultSettings();
  const notes = [];
  if (!isObj(raw)) return [out, notes];
  for (const [k, lo, hi] of [['market_rate', 0.1, 100], ['low_rate_share', 1, 100]]) {
    const x = parseNum(raw[k]);
    if (x !== null) {
      if (lo <= x && x <= hi) out[k] = x;
      else notes.push('Параметр «' + k + '» вне допустимого диапазона — используется стандартный.');
    }
  }
  if (raw.nbkr !== null && raw.nbkr !== undefined) out.nbkr = normNbkr(raw.nbkr, notes);
  const subs = raw.subsectors;
  if (isObj(subs)) {
    for (const c of C.subsector_order) {
      if (has(subs, c)) {
        const ov = normOverride(c, subs[c], notes, out.market_rate);
        if (Object.keys(ov).length > 0) out.subsectors[c] = ov;
      }
    }
  } else if (['weights', 'bounds', 'margin', 'nat'].some((k) => has(raw, k))) {
    // прежний формат: общие настройки переносятся в каждый подсектор
    for (const c of C.subsector_order) {
      let ov = {};
      if (has(raw, 'weights')) ov.weights = raw.weights;
      if (has(raw, 'bounds')) ov.bounds = raw.bounds;
      if (SEGMENT_SUBS.includes(c)) {
        const m = raw.margin;
        const g = SUBS[c].group;
        if (isObj(m) && has(m, g)) ov.margin = m[g];
        const n = raw.nat;
        if (isObj(n) && has(n, c)) ov.nat = n[c];
      }
      ov = normOverride(c, ov, notes, out.market_rate);
      if (Object.keys(ov).length > 0) out.subsectors[c] = ov;
    }
  }
  const uniq = [];
  for (const n of notes) if (!uniq.includes(n)) uniq.push(n);
  return [out, uniq];
}
export function settingsChanged(s) {
  return canonical(s) !== canonical(defaultSettings());
}
// Веса и пороги, которые действуют для компании: по выбранному подсектору (для агрохолдинга — по сегментам)
export function effectiveSettings(st, ctx) {
  const main = ctx.main;
  const subs = st.subsectors;
  const ov = main !== null && has(subs, main) ? subs[main] : {};
  const base = subDefaultParams(main !== null ? main : 'INT');
  const w = {};
  const srcW = ov.weights || base.weights;
  for (const code of SF_CODES) w[code] = srcW[code];
  const b = {};
  const ob = ov.bounds || {};
  for (const k of BOUND_KEYS) b[k] = has(ob, k) ? [...ob[k]] : [...base.bounds[k]];
  const nat = {};
  const msub = {};
  for (const c of SEGMENT_SUBS) {
    const o = has(subs, c) ? subs[c] : {};
    const nb = SUBS[c].nat.bounds;
    nat[c] = has(o, 'nat') ? [...o.nat] : nb ? [...nb] : null;
    msub[c] = has(o, 'margin') ? [...o.margin] : null;
  }
  const margin = {};
  for (const g of ['I', 'II', 'III']) margin[g] = [...C.margin_groups[g].bounds];
  const d0 = defaultSettings();
  let changed = st.market_rate !== d0.market_rate || st.low_rate_share !== d0.low_rate_share;
  const rel = main !== null ? [main, ...ctx.segs] : [];
  for (const c of rel) if (has(subs, c)) changed = true;
  // рыночная ставка: своя у подсектора → бюллетень НБКР за отчётный период → общая;
  // агрохолдинг без своей ставки и без своей отрасли бюллетеня — по долям сегментов
  let mr = st.market_rate, msrc = 'all', mnote = null;
  if (main !== null) {
    if (ctx.group === 'MIX' && !has(ov, 'market_rate') && !ov.nbkr_sector) {
      const got = SEGMENT_SUBS.filter((c) => ctx.shares[c] > 0).map((c) => [c, ctx.shares[c] / 100.0, ...subMarket(st, ctx, c)]);
      if (got.some((g) => g[3] !== 'all')) {
        let t = 0;
        for (const g of got) t += g[1] * g[2];
        mr = q(t, 4);
        msrc = 'segments';
        mnote = got.map((g) => SUBS[g[0]].name + ' ' + fmtNum(g[1] * 100, 0) + '% × ' + fmtPct(g[2]) + '%').join('; ');
      }
    } else [mr, msrc, mnote] = subMarket(st, ctx, main);
  }
  return { weights: w, bounds: b, margin, margin_sub: msub, nat, market_rate: mr, market_src: msrc, market_note: mnote, low_rate_share: st.low_rate_share, changed };
}

// ════════════════════════════════════════════════════════════════════════
// 3. Баллы, категории, шкала
// ════════════════════════════════════════════════════════════════════════

export function scoreValue(value, bounds, dir) {
  const s = C.boundary_scores;
  if (dir === 'higher') {
    if (value >= bounds[0]) return s[0];
    if (value <= bounds[8]) return s[8];
    for (let i = 0; i < 8; i++) {
      const b0 = bounds[i], b1 = bounds[i + 1];
      if (value <= b0 && value > b1) return s[i] + ((b0 - value) / (b0 - b1)) * (s[i + 1] - s[i]);
    }
  } else {
    if (value <= bounds[0]) return s[0];
    if (value >= bounds[8]) return s[8];
    for (let i = 0; i < 8; i++) {
      const b0 = bounds[i], b1 = bounds[i + 1];
      if (value >= b0 && value < b1) return s[i] + ((value - b0) / (b1 - b0)) * (s[i + 1] - s[i]);
    }
  }
  return s[8];
}
export function categoryForValue(value, bounds, dir, strict = false) {
  let idx = 0;
  for (let i = 1; i < 8; i++) {
    const b = bounds[i];
    if (dir === 'higher') { if (value < b) idx += 1; }
    else if (strict) { if (value >= b) idx += 1; }
    else if (value > b) idx += 1;
  }
  return CATS[idx];
}
export function categoryForScore(score) {
  let idx = 0;
  for (const c of [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5]) if (score > c) idx += 1;
  return CATS[idx];
}
export function ratingIndex(total) {
  const t = q(total, 6);
  let idx = C.rating_scale.length - 1;
  for (let i = 0; i < C.rating_scale.length; i++) {
    const up = C.rating_scale[i].upper;
    if (up !== null && t <= up) { idx = i; break; }
  }
  return idx;
}
export function ratingInfo(idx, total = null) {
  const row = C.rating_scale[idx];
  const lower = idx > 0 ? C.rating_scale[idx - 1].upper : 0.5;
  const info = { index: idx, internal: row.internal, national: row.national, lower, upper: row.upper, headroom: null, to_better: null };
  if (total !== null && row.upper !== null) {
    info.headroom = q(row.upper - total, 2);
    info.to_better = q(total - lower, 2);
  }
  return info;
}
export function ratingGroupKey(national) {
  return national.slice(2).replace(/\+/g, '').replace(/−/g, '');
}
export function ruleCategory(value, rules, other) {
  for (const [cat, op, th] of rules) {
    if (op === '>=' && value >= th) return cat;
    if (op === '<=' && value <= th) return cat;
    if (op === '>' && value > th) return cat;
  }
  return other;
}
function blendRules(a, b, wa) {
  return a.map((r, i) => [r[0], r[1], r[2] * wa + b[i][2] * (1 - wa)]);
}

// ════════════════════════════════════════════════════════════════════════
// 4. Ввод: разбор, валюта, подсектор, условия показа
// ════════════════════════════════════════════════════════════════════════

export function rawBool(v) {
  if (v === true) return true;
  if (typeof v === 'string' && ['1', 'true', 'да', 'yes'].includes(v.trim().toLowerCase())) return true;
  if (isNum(v) && v === 1) return true;
  return false;
}
export function rawStr(v) {
  if (typeof v === 'string') return v.trim();
  if (isNum(v)) return canonNum(v);
  return '';
}

const dmy = (t) => `${String(t[2]).padStart(2, '0')}.${String(t[1]).padStart(2, '0')}.${String(t[0]).padStart(4, '0')}`;
const dateGt = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
// Согласованность отчётного периода. На расчёт не влияет — только предупреждения.
export function periodChecks(ctx) {
  const w = ctx.warnings;
  const ry = ctx.report_year, bd = ctx.bal_date, ev = ctx.eval_date;
  if (ry === null) {
    if (rawStr(ctx.raw.report_year) === '') w.push('Не указан последний полный финансовый год: годы в таблице «по годам», возраст оборудования и насаждений не определены.');
    else w.push('Последний полный финансовый год указан неверно — нужен год от 1990 до 2100.');
  }
  if (ry !== null && bd !== null) {
    if (ctx.fy_type === 'year') {
      if (!(bd[0] === ry && bd[1] === 12 && bd[2] === 31)) w.push(`Дата баланса ${dmy(bd)} не совпадает с концом последнего полного финансового года (31.12.${ry}) — проверьте год и дату баланса.`);
    } else if (bd[0] === ry + 1 && bd[1] === 12 && bd[2] === 31) {
      w.push(`Дата баланса ${dmy(bd)} — конец года: выберите годовую отчётность и последний полный финансовый год ${ry + 1}.`);
    } else if (bd[0] !== ry + 1) {
      w.push(`Дата баланса ${dmy(bd)}: промежуточная отчётность и LTM относятся к ${ry + 1} году — году после последнего полного финансового года ${ry}.`);
    }
  }
  if (ry !== null && ev !== null && ry >= ev[0]) w.push(`Последний полный финансовый год ${ry} ещё не закончился на дату оценки ${dmy(ev)}.`);
  if (bd !== null && ev !== null && dateGt(bd, ev)) w.push(`Дата баланса ${dmy(bd)} позже даты оценки ${dmy(ev)}.`);
}

export function buildCtx(raw, settings, haircut = null) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ctx = { raw: r, settings, errors: [], warnings: [], haircut };
  const cur = rawStr(r.currency) || 'KGS';
  ctx.currency = cur;
  ctx.fx = cur !== 'KGS';
  ctx.rate_avg = 1;
  ctx.rate_end = 1;
  if (ctx.fx) {
    const ra = parseNum(r.rate_avg);
    const re = parseNum(r.rate_end);
    if (ra === null || ra <= 0 || re === null || re <= 0) ctx.errors.push('Отчётность не в сомах: укажите средний курс НБКР за период и курс на дату баланса.');
    else { ctx.rate_avg = ra; ctx.rate_end = re; }
  }
  const fy = rawStr(r.fy_type) || 'year';
  ctx.fy_type = fy;
  ctx.ann = 1;
  ctx.annualized = false;
  if (fy === 'interim') {
    let mo = parseNum(r.interim_months);
    if (![3, 6, 9].includes(mo)) mo = 6;
    ctx.interim_months = mo;
    ctx.ann = 12.0 / mo;
    ctx.annualized = true;
  }
  const ry = parseNum(r.report_year);
  ctx.report_year = ry !== null && ry >= 1990 && ry <= 2100 ? Math.trunc(ry) : null;
  const hy = parseNum(r.harvest_year);
  ctx.harvest_year = hy !== null && hy >= 1990 && hy <= 2100 ? Math.trunc(hy) : ctx.report_year;
  ctx.eval_date = parseDate(r.eval_date);
  ctx.bal_date = parseDate(r.bal_date);
  periodChecks(ctx);
  classify(ctx);
  ctx.st_all = settings;
  ctx.settings = effectiveSettings(settings, ctx);
  return ctx;
}

const HAIRCUT_KEYS = C.haircut_keys;
export function gnum(ctx, key) {
  let v = parseNum(ctx.raw[key]);
  if (v === null) return null;
  const f = FIELD[key];
  if (f) {
    if (f.money === 'flow') v = v * ctx.rate_avg;
    else if (f.money === 'stock') v = v * ctx.rate_end;
    if (f.ann) v = v * ctx.ann;
  }
  if (ctx.haircut !== null && HAIRCUT_KEYS.includes(key)) v = v * ctx.haircut;
  return v;
}
export const gbool = (ctx, key) => rawBool(ctx.raw[key]);
export const gstr = (ctx, key) => rawStr(ctx.raw[key]);

export function gtable(ctx, name) {
  const rows = ctx.raw[name];
  if (!Array.isArray(rows)) return [];
  const cols = C.tables[name].cols;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const d = {};
    let empty = true;
    for (const c of cols) {
      const v = row[c.key];
      if (c.type === 'num') {
        let x = parseNum(v);
        if (x !== null) {
          empty = false;
          if (c.money === 'flow') x = x * ctx.rate_avg;
          else if (c.money === 'stock') x = x * ctx.rate_end;
        }
        d[c.key] = x;
      } else if (c.type === 'bool') {
        d[c.key] = rawBool(v);
      } else {
        const s = rawStr(v);
        if (s !== '' && c.type !== 'select') empty = false;
        d[c.key] = s;
      }
    }
    if (!empty) out.push(d);
  }
  return out;
}

export function subGroup(ctx, c) {
  if (c === 'FSH') {
    const v = parseNum(ctx.raw.fsh_proc_share);
    return v !== null && v >= 50 ? 'II' : 'III';
  }
  return SUBS[c].group;
}

function sharesOf(r) {
  const shares = {};
  let tot = 0;
  for (const c of SEGMENT_SUBS) {
    let v = parseNum(r['sh_' + c]);
    if (v === null || v < 0) v = 0;
    shares[c] = v;
    tot += v;
  }
  const norm = {};
  for (const c of SEGMENT_SUBS) norm[c] = tot > 0 ? (shares[c] * 100.0) / tot : 0;
  return [norm, tot];
}
function setSegments(ctx, main, norm) {
  ctx.main = main;
  ctx.is_int = main === 'INT';
  let segs = [];
  if (ctx.is_int) {
    for (const c of SEGMENT_SUBS) if (norm[c] >= 10) segs.push(c);
  } else segs = [main];
  ctx.segs = segs;
  let sw = 0;
  for (const c of segs) sw += norm[c];
  ctx.seg_w = {};
  for (const c of segs) ctx.seg_w[c] = sw > 0 ? norm[c] / sw : 0;
}
// Подсектор по долям выручки (раздел А.2)
export function ruleA2(norm) {
  let best = null;
  let n15 = 0;
  for (const c of SEGMENT_SUBS) {
    if (best === null || norm[c] > norm[best]) best = c;
    if (norm[c] >= 15) n15 += 1;
  }
  if (norm[best] >= 60) return [best, best, n15];
  if (n15 >= 2) return ['INT', best, n15];
  return [best, best, n15];
}
const subLabel = (c) => (SUBS[c] ? SUBS[c].name : String(c));

function classify(ctx) {
  const r = ctx.raw;
  const sel = rawStr(r.subsector);
  ctx.sub_selected = sel;
  ctx.sub_source = null;
  ctx.main = null;
  ctx.segs = [];
  ctx.seg_w = {};
  ctx.is_int = false;
  let norm = {};
  for (const c of SEGMENT_SUBS) norm[c] = 0;
  let tot = 0;
  if (sel !== '' && !has(SUBS, sel)) {
    ctx.errors.push('Неизвестный подсектор «' + sel + '» — выберите подсектор из списка.');
  } else if (sel !== '' && sel !== 'INT') {
    norm[sel] = 100.0;
    tot = 100.0;
    ctx.sub_source = 'selected';
    setSegments(ctx, sel, norm);
  } else if (sel === 'INT') {
    [norm, tot] = sharesOf(r);
    ctx.sub_source = 'selected';
    if (tot <= 0) ctx.errors.push('Для интегрированного агрохолдинга укажите доли выручки по видам деятельности.');
    else {
      if (Math.abs(tot - 100) > 1) ctx.warnings.push('Сумма долей выручки по видам деятельности ' + fmtNum(tot, 1) + '% — программа пересчитала доли до 100%.');
      const [a2, best, n15] = ruleA2(norm);
      if (a2 !== 'INT') {
        if (norm[best] >= 60) ctx.warnings.push('По правилу А.2 компания не является агрохолдингом: «' + subLabel(best) + '» даёт ' + fmtNum(norm[best], 1) + '% выручки (60% и более) — проверьте выбор подсектора.');
        else ctx.warnings.push('По правилу А.2 агрохолдинг — не менее двух видов деятельности с долей 15% выручки и более; сейчас таких ' + n15 + ' — проверьте выбор подсектора.');
      }
      setSegments(ctx, 'INT', norm);
      if (ctx.segs.length === 0) {
        ctx.errors.push('Ни один вид деятельности агрохолдинга не даёт 10% выручки — сегменты для расчёта не определены.');
        ctx.main = null;
        ctx.is_int = false;
      }
    }
  } else {
    [norm, tot] = sharesOf(r);
    if (tot <= 0) ctx.errors.push('Выберите подсектор в профиле компании.');
    else {
      if (Math.abs(tot - 100) > 1) ctx.warnings.push('Сумма долей выручки по видам деятельности ' + fmtNum(tot, 1) + '% — программа пересчитала доли до 100%.');
      const [a2] = ruleA2(norm);
      ctx.sub_source = 'shares';
      setSegments(ctx, a2, norm);
      ctx.warnings.push('Подсектор не выбран — программа определила его по долям выручки (правило А.2): «' + subLabel(a2) + '». Выберите подсектор в профиле компании.');
    }
  }
  ctx.shares = norm;
  ctx.shares_total = tot;
  const gsh = { I: 0, II: 0, III: 0 };
  for (const c of C.segment_subs) gsh[subGroup(ctx, c)] += norm[c] / 100.0;
  ctx.gshare = gsh;
  if (ctx.main === null) { ctx.group = null; ctx.g3 = 0; }
  else if (ctx.is_int) { ctx.group = 'MIX'; ctx.g3 = gsh.III; }
  else { ctx.group = subGroup(ctx, ctx.main); ctx.g3 = ctx.group === 'III' ? 1 : 0; }
  let sea = 0;
  for (const c of C.seasonal_subs) sea += norm[c];
  ctx.seasonal = C.seasonal_subs.includes(ctx.main) || (ctx.is_int && sea >= 30);
  let p = parseNum(r.crp_perennial_share);
  if (p === null) p = 0;
  p = Math.max(0, Math.min(100, p));
  ctx.crp_p = p;
  const crp = ctx.segs.includes('CRP');
  ctx.crp = crp;
  ctx.garden = crp && p > 0;
  ctx.annual = crp && p < 100;
  let base = ctx.main;
  if (ctx.is_int) {
    base = null;
    for (const c of ctx.segs) if (base === null || norm[c] > norm[base]) base = c;
  }
  ctx.prot_sub = base;
  ctx.prot = base !== null ? SUBS[base].protect5 : 'vet';
}

export function condOk(ctx, token) {
  if (token.includes(':')) {
    const i = token.indexOf(':');
    const kind = token.slice(0, i);
    const arg = token.slice(i + 1);
    const lst = arg.split(',');
    if (kind === 'sub') return lst.some((c) => ctx.segs.includes(c));
    if (kind === 'seg') return ctx.is_int && ctx.segs.includes(arg);
    if (kind === 'main') return lst.includes(ctx.main);
    if (kind === 'notmain') return ctx.main !== null && !lst.includes(ctx.main);
    if (kind === 'prot') return ctx.prot === arg;
    return true;
  }
  switch (token) {
    case 'fx': return ctx.fx;
    case 'interim': return ctx.fy_type === 'interim';
    case 'seasonal': return ctx.seasonal;
    case 'int': return ctx.is_int;
    case 'shares': return ctx.sub_selected === 'INT' || (ctx.sub_selected === '' && ctx.shares_total > 0);
    case 'notint': return !ctx.is_int;
    case 'garden': return ctx.garden;
    case 'annual': return ctx.annual;
    case 'reval': return gbool(ctx, 'f23_reval');
    case 'noreval': return !gbool(ctx, 'f23_reval');
    case 'group': return gbool(ctx, 'in_group');
    case 'bp': return !gbool(ctx, 'bp_none');
    case 'main3': return ctx.g3 > 0;
    default: return true;
  }
}
export function fieldVisible(ctx, f) {
  for (const t of f.when || []) if (!condOk(ctx, t)) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════════
// 5. Индикаторы и подфакторы
// ════════════════════════════════════════════════════════════════════════

function indEval(code, value, srcOk, opt = {}) {
  const na = !!opt.na;
  const d = IND[code];
  const res = { code, name: d.name, w: d.w, unit: opt.unit === undefined || opt.unit === null ? d.unit : opt.unit, dec: d.dec, value: value === undefined ? null : value, src: !!srcOk, na,
    missing: false, cat: null, score: null, note: opt.note === undefined ? null : opt.note };
  if (na) return res;
  if (opt.force_cat !== undefined && opt.force_cat !== null && srcOk) {
    res.cat = opt.force_cat;
    res.score = CAT_SCORES[opt.force_cat];
    return res;
  }
  if (value === null || value === undefined || !srcOk) {
    res.missing = true;
    res.score = DEFAULT;
    if (value !== null && value !== undefined && !srcOk) res.note = 'Значение без источника не учитывается';
    return res;
  }
  const rl = opt.rules !== undefined && opt.rules !== null ? opt.rules : d.rules;
  res.cat = ruleCategory(value, rl, d.else);
  res.score = CAT_SCORES[res.cat];
  return res;
}

function metricScore(inds) {
  let sw = 0, s = 0, missW = 0, napp = 0, nmiss = 0;
  for (const x of inds) {
    if (x.na) continue;
    napp += 1;
    sw += x.w;
    s += x.w * x.score;
    if (x.missing) { missW += x.w; nmiss += 1; }
  }
  if (sw <= 0) return { score: DEFAULT, raw: DEFAULT, all_default: true, miss_share: 1, caps: [] };
  const raw = q(s / sw, 2);
  const out = { score: raw, raw, all_default: nmiss === napp, miss_share: missW / sw, caps: [] };
  if (missW / sw > 0.5 && raw < 15) {
    out.score = 15;
    out.caps.push({ name: 'Недостаточно данных', text: 'Индикаторы без данных составляют более 50% веса подфактора — не лучше B (15)', level: 15 });
  }
  return out;
}

function applyCap(res, level, name, text, exact = false) {
  if (exact) {
    if (res.score !== level) res.score = level;
    res.caps.push({ name, text, level, exact: true });
    return;
  }
  if (res.score < level) {
    res.score = level;
    res.caps.push({ name, text, level });
  } else res.caps.push({ name, text, level, inactive: true });
}

const srcOk = (ctx, key) => textOk(gstr(ctx, key));

function quantResult(code, metric, value, bounds, dir, opt = {}) {
  const strict = !!opt.strict;
  const special = opt.special === undefined ? null : opt.special;
  const res = { code, metric, value: value === undefined ? null : value, unit: opt.unit !== undefined && opt.unit !== null ? opt.unit : METRICS[metric].unit,
    caps: [], all_default: false, note: opt.note === undefined ? null : opt.note, bounds, dir };
  if (special !== null) {
    res.raw = special;
    res.score = special;
    res.cat = categoryForScore(special);
    return res;
  }
  if (value === null || value === undefined) {
    res.raw = DEFAULT;
    res.score = DEFAULT;
    res.cat = null;
    res.all_default = true;
    return res;
  }
  const sc = q(scoreValue(value, bounds, dir), 2);
  res.raw = sc;
  res.score = sc;
  res.cat = categoryForValue(value, bounds, dir, strict);
  return res;
}

// ── Ряды по годам
export function yearEbitda(ctx, y) {
  const rev = gnum(ctx, 'rev_' + y);
  const op = gnum(ctx, 'op_' + y);
  if (rev === null || op === null) return null;
  const da = nz(gnum(ctx, 'da_' + y));
  let e = op + da - nz(gnum(ctx, 'bio_' + y)) - nz(gnum(ctx, 'once_' + y)) - nz(gnum(ctx, 'gain_' + y));
  if (ctx.garden) e = e + nz(gnum(ctx, 'young_' + y));
  return { year: y, rev, ebitda: e, margin: rev > 0 ? (e / rev) * 100.0 : null };
}
export function marginSeries(ctx) {
  const out = [];
  for (let y = 0; y < 5; y++) {
    const r = yearEbitda(ctx, y);
    if (r === null || r.margin === null) break;
    out.push(r);
  }
  return out;
}

// ── Блок 1
function sf11(ctx) {
  const rev = gnum(ctx, 'rev_0');
  const v = rev !== null ? rev / 1e6 : null;
  return quantResult('1.1', 'rev', v, ctx.settings.bounds.rev, 'higher');
}
function sf12(ctx) {
  const share = parseNum(ctx.raw.m12_share);
  const other = parseNum(ctx.raw.m12_other);
  const st = gstr(ctx, 's12_type');
  const indep = C.independent_sources.includes(st) && srcOk(ctx, 's12');
  let note = null;
  if (!indep && (share !== null || other !== null)) note = 'Доля не подтверждена независимым источником — индикаторы 1.2.А и 1.2.Б считаются без данных';
  let ratio = null;
  if (share !== null && other !== null && other > 0) ratio = share / other;
  const a = indEval('1.2.А', share, indep);
  const b = indEval('1.2.Б', ratio, indep && other !== null);
  if (!indep && srcOk(ctx, 's12')) {
    for (const x of [a, b]) if (x.value !== null) x.note = 'Источник не независимый — значение не учитывается';
  }
  const inds = [a, b];
  const res = metricScore(inds);
  res.indicators = inds;
  res.note = note;
  return res;
}
function sf13(ctx) {
  const inds = [indEval('1.3.А', parseNum(ctx.raw.i13A), srcOk(ctx, 's13A')), indEval('1.3.Б', parseNum(ctx.raw.i13B), srcOk(ctx, 's13B')),
    indEval('1.3.В', parseNum(ctx.raw.i13V), srcOk(ctx, 's13V'))];
  const res = metricScore(inds);
  res.indicators = inds;
  return res;
}
function sf14(ctx) {
  const g = indEval('1.4.Г', parseNum(ctx.raw.i14G), srcOk(ctx, 's14G'));
  const top = parseNum(ctx.raw.i14G_top);
  if (!g.missing && top !== null && top > 70) {
    const i = CATS.indexOf(g.cat);
    if (i < 4) {
      g.cat = CATS[i + 1];
      g.score = CAT_SCORES[g.cat];
      g.note = 'Более 70% экспорта в одну страну — на одну категорию ниже';
    }
  }
  const inds = [indEval('1.4.А', parseNum(ctx.raw.i14A), srcOk(ctx, 's14A')), indEval('1.4.Б', parseNum(ctx.raw.i14B), srcOk(ctx, 's14B')),
    indEval('1.4.В', parseNum(ctx.raw.i14V), srcOk(ctx, 's14V')), g];
  const res = metricScore(inds);
  res.indicators = inds;
  return res;
}
export function segmentsMerge(rows) {
  const merged = [];
  const keys = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const g = r.group || 'other';
    const cg = COMMODITY[g];
    const raw = cg !== undefined ? cg.raw : null;
    const key = raw !== null ? raw : 'other#' + i;
    let label = cg !== undefined ? cg.name : 'Прочее';
    if (g === 'other' && r.name) label = 'Прочее: ' + r.name;
    const rev = nz(r.rev);
    const gp = rev - nz(r.cogs);
    if (key in keys) {
      const m = merged[keys[key]];
      m.rev += rev;
      m.gp += gp;
      if (!m.labels.includes(label)) m.labels.push(label);
    } else {
      keys[key] = merged.length;
      merged.push({ key, labels: [label], rev, gp });
    }
  }
  return merged;
}
function sf15(ctx, series) {
  const rows = gtable(ctx, 'seg15');
  const ok = srcOk(ctx, 's15');
  const segs = segmentsMerge(rows);
  let tot = 0, gpTot = 0;
  for (const s of segs) { tot += s.rev; gpTot += s.gp; }
  let nkey = null, big = null, forceB = null;
  if (segs.length > 0 && tot > 0) {
    nkey = 0;
    let best = null;
    for (const s of segs) {
      s.share = (s.rev / tot) * 100;
      s.key_seg = s.share >= 10 && s.gp > 0;
      if (s.key_seg) nkey += 1;
      if (best === null || s.gp > best.gp) best = s;
    }
    if (gpTot > 0) big = (best.gp / gpTot) * 100;
    else forceB = 'Ca';
  }
  const a = indEval('1.5.А', nkey, ok);
  const b = indEval('1.5.Б', big, ok, { force_cat: nkey !== null ? forceB : null, note: forceB ? 'Валовая прибыль всех сегментов не положительна' : null });
  const inds = [a, b];
  const res = metricScore(inds);
  res.indicators = inds;
  res.segments = segs;
  let nneg = 0;
  for (const r of series.slice(0, 3)) if (r.ebitda < 0) nneg += 1;
  res.neg_years = nneg;
  if (nkey === 1 && ok) {
    if (nneg >= 2) applyCap(res, 20, 'Один сегмент и убытки', 'Один ключевой сегмент и отрицательная EBITDA в двух и более из 3 лет — Ca (20)', true);
    else if (nneg === 1) applyCap(res, 18, 'Один сегмент и убыток', 'Один ключевой сегмент и отрицательная EBITDA в одном из 3 лет — не лучше Caa (18)');
  }
  return res;
}

export function gardenPhase(kind, age) {
  const g = GARDEN[kind];
  if (age < g.start) return ['young', 0.0];
  if (age < g.full_from) {
    if (g.full_from === g.start) return ['full', 1.0];
    return ['entering', 0.2 + (0.6 * (age - g.start)) / (g.full_from - g.start)];
  }
  if (age <= g.full_to) return ['full', 1.0];
  if (age <= g.end) return ['decline', 0.7];
  return ['old', 0.4];
}
export function gardenRows(ctx) {
  const out = [];
  const hy = ctx.harvest_year;
  for (const r of gtable(ctx, 'gardens')) {
    const kind = r.kind;
    if (!(kind in GARDEN) || !isNum(r.year) || !isNum(r.area) || r.area <= 0 || hy === null) continue;
    const g = GARDEN[kind];
    const age = hy - Math.trunc(r.year);
    const [ph, coef] = gardenPhase(kind, age);
    const d = { ...r };
    d.age = age;
    d.phase = ph;
    d.coef = coef;
    d.norm = [];
    for (let k = 0; k < 3; k++) {
      const a = age - k;
      d.norm.push(a < 0 ? 0.0 : gardenPhase(kind, a)[1] * r.area * g.yield);
    }
    d.nat_k = ph === 'full' ? (g.intensive ? 5 : 2) : 1;
    let remaining = g.end - age;
    if (remaining < 0) remaining = 0;
    const need = Math.min(remaining, 10);
    if (r.land === 'own') d.land_ok = true;
    else if (r.land === 'lease' && isNum(r.lease_end)) d.land_ok = r.lease_end - hy >= need;
    else d.land_ok = false;
    d.need_years = need;
    d.loss = isNum(r.trees) && r.trees > 0 ? ((nz(r.lost) + nz(r.sick)) / r.trees) * 100 : null;
    out.push(d);
  }
  return out;
}
function gardenCalc(ctx) {
  const rows = gardenRows(ctx);
  const ok = srcOk(ctx, 's21g');
  const res = { rows };
  let area = 0, aFull = 0, aLand = 0, lossA = 0, lossS = 0;
  const flags = { drip: 0, net: 0, frost: 0, cert: 0 };
  for (const r of rows) {
    area += r.area;
    if (r.phase === 'full') aFull += r.area;
    if (r.land_ok) aLand += r.area;
    if (r.loss !== null) { lossA += r.area; lossS += r.area * r.loss; }
    for (const k of Object.keys(flags)) if (r[k]) flags[k] += r.area;
  }
  res.area = area;
  const harv = [gnum(ctx, 'g_harv_0'), gnum(ctx, 'g_harv_1'), gnum(ctx, 'g_harv_2')];
  const norms = [0.0, 0.0, 0.0];
  for (const r of rows) for (let k = 0; k < 3; k++) norms[k] += r.norm[k];
  res.norms = norms;
  res.harvests = harv;
  if (area <= 0) {
    res.indicators = ['2.1.А″', '2.1.Б″', '2.1.В″', '2.1.Г″', '2.1.Д″'].map((c) => indEval(c, null, ok));
    res.points = null;
    return res;
  }
  const a = (aFull / area) * 100;
  let sAct = 0, sNorm = 0, haveNorm = false, missingH = false;
  for (let k = 0; k < 3; k++) {
    if (norms[k] > 0) {
      haveNorm = true;
      if (harv[k] === null) missingH = true;
      else { sAct += harv[k]; sNorm += norms[k]; }
    }
  }
  let b;
  if (!haveNorm) {
    b = indEval('2.1.Б″', null, ok, { na: true });
    b.note = 'Плодоносящих насаждений нет — индикатор не применяется';
  } else if (missingH || sNorm <= 0) b = indEval('2.1.Б″', null, ok);
  else b = indEval('2.1.Б″', (sAct / sNorm) * 100, ok);
  res.yield_act = sAct;
  res.yield_norm = sNorm;
  const v = indEval('2.1.В″', lossA > 0 ? lossS / lossA : null, ok);
  const g = indEval('2.1.Г″', (aLand / area) * 100, ok);
  let pts = 0;
  const pl = [];
  for (const k of ['drip', 'net', 'frost', 'cert']) {
    const on = flags[k] / area >= 0.5;
    pl.push({ key: k, share: (flags[k] / area) * 100, ok: on });
    if (on) pts += 1;
  }
  let hsum = 0, hn = 0;
  for (const h of harv) if (h !== null) { hsum += h; hn += 1; }
  const cold = gnum(ctx, 'g_cold');
  const coldOk = cold !== null && hn > 0 && hsum / hn > 0 && cold >= (0.3 * hsum) / hn;
  pl.push({ key: 'cold', share: cold !== null && hn > 0 && hsum > 0 ? (cold / (hsum / hn)) * 100 : null, ok: coldOk });
  if (coldOk) pts += 1;
  res.points_list = pl;
  res.points = pts;
  const d = indEval('2.1.Д″', pts, ok);
  res.indicators = [indEval('2.1.А″', a, ok), b, v, g, d];
  return res;
}

export function natValue(ctx, c) {
  if (c === 'DAI') {
    const m = gnum(ctx, 'nat_DAI_milk');
    return m !== null ? m / 365.0 : null;
  }
  if (c === 'MEA') {
    const a = gnum(ctx, 'nat_MEA_meat'), b = gnum(ctx, 'nat_MEA_eggs');
    if (a === null && b === null) return null;
    return nz(a) + nz(b) * 60;
  }
  if (c === 'CRP') {
    const an = ctx.annual ? gnum(ctx, 'crp_area_annual') : null;
    const gr = ctx.annual ? gnum(ctx, 'crp_area_green') : null;
    const rows = ctx.garden ? gardenRows(ctx) : [];
    if (an === null && gr === null && rows.length === 0) return null;
    let t = nz(an) + nz(gr) * 40;
    for (const r of rows) t += r.area * r.nat_k;
    return t;
  }
  if (c === 'OIL') {
    const a = gnum(ctx, 'nat_OIL_seed'), b = gnum(ctx, 'nat_OIL_oil');
    if (a === null && b === null) return null;
    return nz(a) + nz(b) * 2.5;
  }
  if (c === 'SUG') {
    const a = gnum(ctx, 'nat_SUG_beet'), b = gnum(ctx, 'nat_SUG_raw');
    if (a === null && b === null) return null;
    return nz(a) + nz(b) * 8;
  }
  if (c === 'FRU') {
    const a = gnum(ctx, 'nat_FRU_fresh'), b = gnum(ctx, 'nat_FRU_dried'), k = gnum(ctx, 'nat_FRU_kernel');
    if (a === null && b === null && k === null) return null;
    return nz(a) + nz(b) * 4 + nz(k) * 2;
  }
  if (c === 'PRM') {
    let t = 0, anyv = false;
    for (const l of C.livestock) {
      const v = gnum(ctx, l.key);
      if (v !== null) { anyv = true; t += v * l.k; }
    }
    return anyv ? t : null;
  }
  const key = { FLR: 'nat_FLR', FED: 'nat_FED', CTN: 'nat_CTN', API: 'nat_API', FSH: 'nat_FSH' }[c];
  return key ? gnum(ctx, key) : null;
}
function sf16(ctx) {
  const parts = [];
  let tot = 0, allDef = true;
  for (const c of ctx.segs) {
    const v = natValue(ctx, c);
    const p = quantResult('1.6', 'nat', v, ctx.settings.nat[c], 'higher', { unit: SUBS[c].nat.unit });
    p.sub = c;
    p.w = ctx.seg_w[c];
    parts.push(p);
    tot += p.w * p.score;
    if (!p.all_default) allDef = false;
  }
  if (parts.length === 1) return parts[0];
  const sc = q(tot, 2);
  return { code: '1.6', metric: 'nat', value: null, unit: '', raw: sc, score: sc, cat: categoryForScore(sc), caps: [], all_default: allDef, parts,
    note: 'Взвешенный по выручке балл сегментов' };
}

// ── Блок 2
function b21na(ctx, c) {
  if (c === 'DAI' || c === 'SUG') return true;
  if (c === 'MEA' && !gbool(ctx, 'mea_poultry')) return true;
  if (c === 'FRU') {
    const v = parseNum(ctx.raw.fru_fresh_share);
    if (v !== null && v > 50) return true;
  }
  return false;
}
function sf21sub(ctx, c) {
  const need = gnum(ctx, 'r21_need_' + c), own = gnum(ctx, 'r21_own_' + c), con = gnum(ctx, 'r21_contr_' + c);
  let a = null;
  if (need !== null && need > 0 && (own !== null || con !== null)) a = ((nz(own) + 0.5 * nz(con)) / need) * 100;
  const inds = [indEval('2.1.А', a, srcOk(ctx, 's21A_' + c)),
    indEval('2.1.Б', parseNum(ctx.raw['i21B_' + c]), srcOk(ctx, 's21B_' + c), { na: b21na(ctx, c) }),
    indEval('2.1.В', parseNum(ctx.raw['i21V_' + c]), srcOk(ctx, 's21V_' + c)),
    indEval('2.1.Г', parseNum(ctx.raw['i21G_' + c]), srcOk(ctx, 's21G_' + c))];
  const res = metricScore(inds);
  res.indicators = inds;
  res.label = SUBS[c].name;
  res.sub = c;
  return res;
}
function sf21crpAnnual(ctx) {
  const area = nz(gnum(ctx, 'crp_area_annual')) + nz(gnum(ctx, 'crp_area_green'));
  const sec = gnum(ctx, 'crp_area_secure');
  const a = sec !== null && area > 0 ? (sec / area) * 100 : null;
  const inds = [indEval('2.1.А′', a, srcOk(ctx, 's21Ap')), indEval('2.1.Б′', parseNum(ctx.raw.i21Bp), srcOk(ctx, 's21Bp')),
    indEval('2.1.В′', parseNum(ctx.raw.i21Vp), srcOk(ctx, 's21Vp')), indEval('2.1.Г′', parseNum(ctx.raw.i21Gp), srcOk(ctx, 's21Gp'))];
  const res = metricScore(inds);
  res.indicators = inds;
  res.label = 'Однолетние культуры (2.1.1)';
  return res;
}
function sf21crp(ctx) {
  const p = ctx.crp_p / 100.0;
  const parts = [];
  let wa, wg;
  if (p >= 0.15 && p <= 0.85) { wa = 1 - p; wg = p; }
  else if (p > 0.5) { wa = 0; wg = 1; }
  else { wa = 1; wg = 0; }
  if (wa > 0) {
    const an = sf21crpAnnual(ctx);
    an.w = wa;
    parts.push(an);
  }
  if (wg > 0) {
    const gc = gardenCalc(ctx);
    const gr = metricScore(gc.indicators);
    gr.indicators = gc.indicators;
    gr.label = 'Многолетние насаждения (2.1.2)';
    gr.garden = gc;
    gr.w = wg;
    parts.push(gr);
  }
  let s = 0, alld = true;
  for (const x of parts) { s += x.w * x.score; if (!x.all_default) alld = false; }
  const sc = q(s, 2);
  return { score: sc, raw: sc, parts, all_default: alld, caps: [], label: SUBS.CRP.name, sub: 'CRP' };
}
function sf21(ctx) {
  const parts = [];
  for (const c of ctx.segs) {
    const r = c === 'CRP' ? sf21crp(ctx) : sf21sub(ctx, c);
    r.seg_w = ctx.seg_w[c];
    parts.push(r);
  }
  if (parts.length === 1) return parts[0];
  let s = 0, alld = true;
  for (const x of parts) { s += x.seg_w * x.score; if (!x.all_default) alld = false; }
  const sc = q(s, 2);
  return { score: sc, raw: sc, segments: parts, all_default: alld, caps: [], note: 'Взвешенный по выручке балл сегментов' };
}
export function seasonalityRules(ctx) {
  const common = L7(C.seasonality_scales.I);
  const g3 = L7(C.seasonality_scales.III);
  const w = ctx.g3;
  if (w <= 0) return common;
  if (w >= 1) return g3;
  return blendRules(g3, common, w);
}
function sf22(ctx) {
  let pa = 0;
  if (gbool(ctx, 'f22A_iso')) pa += 2;
  for (const k of ['f22A_haccp', 'f22A_export', 'f22A_halal', 'f22A_lab']) if (gbool(ctx, k)) pa += 1;
  const qs = [1, 2, 3, 4].map((i) => gnum(ctx, 'q_rev_' + i));
  let v = null;
  if (!qs.includes(null)) {
    const t = qs[0] + qs[1] + qs[2] + qs[3];
    if (t > 0) v = (Math.max(...qs) / t) * 100;
  }
  let pg = 0;
  const glist = [];
  const pw = parseNum(ctx.raw.i22G_power);
  glist.push({ key: 'power', ok: pw !== null && pw >= 50 });
  if (ctx.main === 'CRP') {
    const wv = parseNum(ctx.raw.i22G_water_crp);
    glist.push({ key: 'water', ok: wv !== null && wv >= 80 });
  } else glist.push({ key: 'water', ok: gbool(ctx, 'f22G_water') });
  glist.push({ key: 'prop', ok: gbool(ctx, 'f22G_prop') });
  const bi = parseNum(ctx.raw.i22G_bio);
  glist.push({ key: 'bio', ok: bi !== null && bi >= 50 });
  if (ctx.prot === 'storage') {
    const stv = parseNum(ctx.raw.i22G_storage);
    glist.push({ key: 'storage', ok: stv !== null && stv >= 2 });
  } else glist.push({ key: 'vet', ok: gbool(ctx, 'f22G_vet') });
  for (const x of glist) if (x.ok) pg += 1;
  const inds = [indEval('2.2.А', pa, srcOk(ctx, 's22A')), indEval('2.2.Б', parseNum(ctx.raw.i22B), srcOk(ctx, 's22B')),
    indEval('2.2.В', v, srcOk(ctx, 's22V'), { rules: seasonalityRules(ctx) }), indEval('2.2.Г', pg, srcOk(ctx, 's22G'))];
  const res = metricScore(inds);
  res.indicators = inds;
  res.g_points = glist;
  res.season_rules = seasonalityRules(ctx);
  if (gbool(ctx, 'f22_quar')) applyCap(res, 18, 'Карантин или запрет', 'На дату оценки действует карантин, запрет экспорта или приостановка деятельности — не лучше Caa (18)');
  return res;
}
export function equipmentAge(ctx) {
  const rows = [];
  for (const r of gtable(ctx, 'equip')) if (isNum(r.cost) && r.cost > 0 && isNum(r.year)) rows.push(r);
  const ry = ctx.report_year;
  if (rows.length === 0 || ry === null) return [null, []];
  rows.sort((a, b) => b.cost - a.cost);
  let tot = 0;
  for (const r of rows) tot += r.cost;
  let acc = 0;
  const chosen = [];
  for (const r of rows) {
    if (acc >= 0.8 * tot) break;
    chosen.push(r);
    acc += r.cost;
  }
  let s = 0, w = 0;
  for (const r of chosen) {
    let age = ry - r.year;
    if (age < 0) age = 0;
    s += age * r.cost;
    w += r.cost;
  }
  return [w > 0 ? s / w : null, chosen];
}
function sf23(ctx) {
  let wear;
  if (gbool(ctx, 'f23_reval')) {
    const rp = gnum(ctx, 'i23_repl'), rs = gnum(ctx, 'i23_resid');
    wear = rp !== null && rp > 0 && rs !== null ? (1 - rs / rp) * 100 : null;
  } else {
    const c = gnum(ctx, 'i23_cost'), d = gnum(ctx, 'i23_accdep');
    wear = c !== null && c > 0 && d !== null ? (d / c) * 100 : null;
  }
  const cx = gnum(ctx, 'i23_capex3'), dp = gnum(ctx, 'i23_dep3');
  const ren = cx !== null && dp !== null && dp > 0 ? (cx / dp) * 100 : null;
  const [age, chosen] = equipmentAge(ctx);
  const naG = ['CRP', 'PRM', 'API'].includes(ctx.main);
  const dn = parseNum(ctx.raw.i23_down), pl = parseNum(ctx.raw.i23_plan);
  const dt = dn !== null && pl !== null && pl > 0 ? (dn / pl) * 100 : null;
  const inds = [indEval('2.3.А', wear, srcOk(ctx, 's23A')), indEval('2.3.Б', ren, srcOk(ctx, 's23B')), indEval('2.3.В', age, srcOk(ctx, 's23V')),
    indEval('2.3.Г', dt, srcOk(ctx, 's23G'), { na: naG })];
  const res = metricScore(inds);
  res.indicators = inds;
  res.equip_main = chosen.length;
  if (wear !== null && ren !== null && srcOk(ctx, 's23A') && srcOk(ctx, 's23B') && wear > 70 && ren < 50)
    applyCap(res, 15, 'Изношенное оборудование без обновления', 'Износ более 70% и обновление менее 50% амортизации — не лучше B (15)');
  return res;
}

// ── Блок 3
export function marginBounds(ctx) {
  const st = ctx.settings.margin;
  const ms = ctx.settings.margin_sub;
  if (ctx.group === 'MIX') {
    let own = false;
    for (const c of SEGMENT_SUBS) if (ms[c] !== null && ctx.shares[c] > 0) own = true;
    const out = [];
    if (!own) {
      for (let i = 0; i < 9; i++) out.push(ctx.gshare.I * st.I[i] + ctx.gshare.II * st.II[i] + ctx.gshare.III * st.III[i]);
      return out;
    }
    // у сегментов есть свои пороги маржи из настроек: граница = Σ доля × граница подсектора
    for (let i = 0; i < 9; i++) {
      let t = 0;
      for (const c of SEGMENT_SUBS) {
        const sh = ctx.shares[c] / 100.0;
        if (sh > 0) {
          const b = ms[c] !== null ? ms[c] : st[subGroup(ctx, c)];
          t += sh * b[i];
        }
      }
      out.push(t);
    }
    return out;
  }
  if (has(ms, ctx.main) && ms[ctx.main] !== null) return [...ms[ctx.main]];
  const g = ctx.group in st ? ctx.group : 'II';
  return [...st[g]];
}
function avgMargin(series) {
  if (series.length === 0) return [null, null];
  if (series.length >= 3) return [(series[0].margin + series[1].margin + series[2].margin) / 3.0, 'avg3'];
  let m = series[0].margin;
  for (const r of series) if (r.margin < m) m = r.margin;
  return [m, 'min'];
}
function sf31(ctx, series) {
  const [m, how] = avgMargin(series);
  const res = quantResult('3.1', 'margin', m, marginBounds(ctx), 'higher');
  res.how = how;
  res.years = series.length;
  return res;
}
function sf32(ctx, series) {
  const n = series.length;
  const b = ctx.settings.bounds.mpm;
  if (n < 2) {
    const res = quantResult('3.2', 'mpm', null, b, 'lower');
    res.note = n === 1 ? 'Ряд маржи из одного года — подфактор не рассчитывается' : null;
    res.years = n;
    return res;
  }
  const ser = series.slice(0, 5);
  const chrono = [];
  for (let i = ser.length - 1; i >= 0; i--) chrono.push(ser[i].margin);
  let avg = 0;
  for (const x of chrono) avg += x;
  avg = avg / chrono.length;
  let drop = 0;
  for (let i = 0; i < chrono.length - 1; i++) {
    const d = chrono[i] - chrono[i + 1];
    if (d > drop) drop = d;
  }
  let res;
  if (avg <= 0) {
    res = quantResult('3.2', 'mpm', null, b, 'lower', { special: 20.5 });
    res.note = 'Средняя маржа ≤ 0 — 20,5';
    res.value = null;
  } else res = quantResult('3.2', 'mpm', (drop / Math.abs(avg)) * 100, b, 'lower');
  res.years = chrono.length;
  res.max_drop = drop;
  res.avg = avg;
  if (chrono.length === 3) applyCap(res, 4.5, 'Короткий ряд (3 года)', 'Ряд из 3 лет — не лучше A (4,5)');
  else if (chrono.length === 2) applyCap(res, 7.5, 'Короткий ряд (2 года)', 'Ряд из 2 лет — не лучше Baa (7,5); расчёт неполный');
  return res;
}

// ── Блок 5
export function equityAdjusted(ctx) {
  const eq = gnum(ctx, 'equity_end');
  if (eq === null) return [null, 0];
  let cut = 0;
  if (ctx.garden) {
    const bk = gnum(ctx, 'garden_book'), vl = gnum(ctx, 'garden_value');
    if (bk !== null && vl !== null && bk > vl) cut = bk - vl;
  }
  return [eq - cut, cut];
}
function distributions(ctx) {
  let dist = 0, npr = 0, years = 0;
  for (let y = 0; y < 3; y++) {
    const n = gnum(ctx, 'np_' + y);
    const d = nz(gnum(ctx, 'div_' + y)) + nz(gnum(ctx, 'buyback_' + y)) + nz(gnum(ctx, 'ownloan_' + y));
    if (n !== null) { years += 1; npr += n; dist += d; }
  }
  return [dist, npr, years];
}
function sf51(ctx) {
  let pa = 0;
  for (let i = 1; i < 7; i++) if (gbool(ctx, 'f51_' + i)) pa += 1;
  const [eq, cut] = equityAdjusted(ctx);
  const l1 = gnum(ctx, 'i51_loans'), l2 = gnum(ctx, 'i51_recv'), l3 = gnum(ctx, 'i51_guar');
  let expo = null;
  if (l1 !== null || l2 !== null || l3 !== null) expo = nz(l1) + nz(l2) + nz(l3);
  const sb = srcOk(ctx, 's51B');
  let b;
  if (eq === null) b = indEval('5.1.Б', null, sb);
  else if (eq <= 0) b = indEval('5.1.Б', null, sb, { force_cat: 'Ca', note: 'Собственный капитал ≤ 0' });
  else if (expo === null) b = indEval('5.1.Б', null, sb);
  else b = indEval('5.1.Б', (expo / eq) * 100, sb);
  const [dist, npr, years] = distributions(ctx);
  const sv = srcOk(ctx, 's51V');
  let v;
  if (years === 0) v = indEval('5.1.В', null, sv);
  else if (npr <= 0) {
    if (dist > 0) v = indEval('5.1.В', null, sv, { force_cat: 'Ca', note: 'Чистая прибыль за 3 года ≤ 0, выплаты были' });
    else v = indEval('5.1.В', null, sv, { force_cat: 'Ba', note: 'Чистая прибыль за 3 года ≤ 0, выплат не было' });
  } else v = indEval('5.1.В', (dist / npr) * 100, sv);
  const inds = [indEval('5.1.А', pa, srcOk(ctx, 's51A')), b, v];
  const res = metricScore(inds);
  res.indicators = inds;
  res.equity_cut = cut;
  if (gbool(ctx, 'in_group') && !gbool(ctx, 'consolidated'))
    applyCap(res, 12, 'Нет отчётности группы', 'Компания входит в группу без консолидированной отчётности — не лучше Ba (12)');
  const und = parseNum(ctx.raw.i_undisclosed);
  if (und !== null && und > 0 && und <= 25)
    applyCap(res, 15, 'Бенефициары раскрыты не полностью', 'Нераскрытая часть капитала ' + fmtNum(und, 1) + '% (не больше 25%) — не лучше B (15)');
  return res;
}
export function integrityTests(ctx) {
  const out = [];
  const a = gnum(ctx, 'assets_end'), l = gnum(ctx, 'liabeq_end');
  if (a !== null && l !== null && a > 0) out.push({ id: 1, result: Math.abs(a - l) <= 0.005 * a ? 'pass' : 'fail', auto: true, diff: (Math.abs(a - l) / a) * 100 });
  else out.push({ id: 1, result: '', auto: true, diff: null });
  const cf = gnum(ctx, 'cfs_change'), ce = gnum(ctx, 'cash_end'), cb = gnum(ctx, 'cash_begin');
  if (cf !== null && ce !== null && cb !== null) {
    const dlt = ce - cb;
    const base = Math.max(Math.abs(dlt), Math.abs(cf));
    const diff = Math.abs(cf - dlt);
    const okk = diff <= 0.01 * base || diff <= 1;
    out.push({ id: 2, result: okk ? 'pass' : 'fail', auto: true, diff: base > 0 ? (diff / base) * 100 : 0 });
  } else out.push({ id: 2, result: '', auto: true, diff: null });
  for (const t of C.integrity_tests) if (!t.auto) out.push({ id: t.id, result: gstr(ctx, 't' + t.id), auto: false, diff: null });
  return out;
}
function sf52(ctx, tests) {
  const std = gstr(ctx, 'r52_std'), aud = gstr(ctx, 'r52_auditor');
  let yrs = parseNum(ctx.raw.r52_years);
  if (yrs === null) yrs = 0;
  const op = gstr(ctx, 'r52_opinion');
  const days = parseNum(ctx.raw.r52_days);
  const forms = gbool(ctx, 'r52_forms');
  const diff = parseNum(ctx.raw.r52_diff);
  const audited = (aud === 'licensed' || aud === 'ifac') && yrs >= 1;
  let cat = null, why = '';
  if (std === 'none') { cat = 'Ca'; why = 'Отчётность не предоставлена'; }
  else if (diff !== null && diff > 10) { cat = 'Ca'; why = 'Налоговая и представленная отчётность расходятся по выручке более чем на 10%'; }
  else if (std === '' || aud === '') cat = null;
  else if ((op === 'adverse' || op === 'disclaim') && audited) { cat = 'Caa'; why = 'Отрицательное мнение аудитора или отказ от мнения'; }
  else if (!forms) { cat = 'Caa'; why = 'Нет одной из форм 1–3'; }
  else if (!audited) { cat = 'B'; why = 'Аудита нет; формы 1–3 полные'; }
  else if (op === '') cat = null;
  else {
    const ifrs = std === 'ifrs', unmod = op === 'unmod';
    const d120 = days !== null && days <= 120, d150 = days !== null && days <= 150;
    if (ifrs && aud === 'ifac' && yrs >= 5 && unmod && d120) cat = 'Aaa';
    else if (ifrs && aud === 'ifac' && yrs >= 3 && unmod && d120) cat = 'Aa';
    else if (ifrs && ((aud === 'ifac' && yrs >= 1) || (aud === 'licensed' && yrs >= 3)) && unmod && d150) cat = 'A';
    else if ((std === 'ifrs' || std === 'ifrs_sme') && unmod) cat = 'Baa';
    else if (op === 'unmod' || op === 'qual') cat = 'Ba';
    else cat = 'B';
    why = 'Лучшая категория, все условия которой выполнены';
  }
  let fails = 0;
  for (const t of tests) if (t.result === 'fail') fails += 1;
  let res;
  if (cat === null) res = { score: DEFAULT, raw: DEFAULT, cat: null, all_default: true, caps: [], why: 'Данных о стандарте и аудиторе нет' };
  else res = { score: CAT_SCORES[cat], raw: CAT_SCORES[cat], cat, all_default: false, caps: [], why };
  res.fails = fails;
  res.tests = tests;
  if (cat !== null && !audited && std !== 'none') applyCap(res, 15, 'Нет аудита', 'Без аудированной отчётности — не лучше B (15)');
  if (fails >= 3) applyCap(res, 18, 'Провалены тесты целостности', 'Провалено ' + fails + ' теста(ов) целостности — не лучше Caa (18)');
  else if (fails === 2) applyCap(res, 15, 'Провалены тесты целостности', 'Провалено 2 теста целостности — не лучше B (15)');
  return res;
}
export function stopFactors(ctx) {
  const out = [];
  if (gbool(ctx, 'f53_list')) out.push('Компания, бенефициар, руководитель или главный бухгалтер в санкционных перечнях ГСФР или Совета Безопасности ООН');
  const und = parseNum(ctx.raw.i_undisclosed);
  if (gbool(ctx, 'f53_refuse') || (und !== null && und > 25)) out.push('Конечные бенефициары не раскрыты (отказ или нераскрытая часть более 25% капитала)');
  if (gbool(ctx, 'f53_convict')) out.push('За 5 лет вступил в силу приговор или решение суда за легализацию доходов или финансирование терроризма');
  return out;
}
function sf53(ctx) {
  let pts = 0;
  const pl = [];
  const a1 = gbool(ctx, 'f53_benef');
  const a2 = !gbool(ctx, 'f53_sanct') && !gbool(ctx, 'f53_bank_sanct');
  const cash = parseNum(ctx.raw.i53_cash);
  const a3 = cash !== null && cash <= 20;
  const hr = parseNum(ctx.raw.i53_hr);
  const a4 = hr !== null && (hr === 0 || (hr <= 5 && gbool(ctx, 'f53_hr_docs')));
  const a5 = !gbool(ctx, 'f53_viol');
  for (const [k, okk] of [['benef', a1], ['sanct', a2], ['cash', a3], ['hr', a4], ['viol', a5]]) {
    pl.push({ key: k, ok: okk });
    if (okk) pts += 1;
  }
  const inds = [indEval('5.3.А', pts, srcOk(ctx, 's53'))];
  const res = metricScore(inds);
  res.indicators = inds;
  res.points_list = pl;
  if (gbool(ctx, 'f53_sanct')) applyCap(res, 20, 'Санкции США, ЕС, Великобритании', 'Компания, бенефициар или руководитель под санкциями — 5.3 = Ca (20); итоговая оценка не выше B1', true);
  else if (gbool(ctx, 'f53_crim')) applyCap(res, 18, 'Уголовное дело о легализации', 'Возбуждено уголовное дело — 5.3 не лучше Caa (18); −1 ступень итоговой оценки');
  return res;
}

// ── Блок 6
function cmpDate(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
export function restructurings(ctx) {
  const rows = gtable(ctx, 'restr');
  const ev = ctx.eval_date;
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const d = parseDate(r.date);
    const it = { n: i + 1, date: r.date || '', reason: r.reason || '', months: null, in5: true, in36: true, reasons: [] };
    if (d !== null && ev !== null) {
      const m = monthsBetween(d, ev);
      it.months = m;
      it.in5 = m < 60;
      it.in36 = m < 36;
    } else it.reasons.push('дата не указана — считается в пределах периода');
    let below = false;
    if (isNum(r.new_rate) && isNum(r.old_rate) && isNum(r.nbkr_rate) && !r.subsidy) below = r.new_rate < r.old_rate - 3 && r.new_rate < r.nbkr_rate;
    let t = null;
    if (r.writeoff) { t = 4; it.reasons.push('списание или уменьшение долга или процентов'); }
    if (r.capitalized) { t = 4; it.reasons.push('капитализация процентов без процентов на них'); }
    if (below) { t = 4; it.reasons.push('ставка ниже рыночной'); }
    if (r.overdue30) { t = 4; it.reasons.push('просрочка более 30 дней после реструктуризации'); }
    if (t === null) {
      if (!r.docs) { t = 3; it.reasons.push('вид не подтверждён документами'); }
      else if (it.reason === 'system') t = 1;
      else if (it.reason === 'technical') t = 2;
      else t = 3;
    }
    it.type = t;
    it._sort = d !== null ? d : [0, 0, 0];
    items.push(it);
  }
  const order = items.map((_, k) => k).sort((x, y) => cmpDate(items[x]._sort, items[y]._sort) || items[x].n - items[y].n);
  const prev3 = [];
  for (const k of order) {
    const it = items[k];
    if (it.type === 3) {
      const d = parseDate(it.date);
      for (const pd of prev3) {
        if (d !== null && pd !== null && monthsBetween(pd, d) < 36) {
          it.type = 4;
          it.reasons.push('вторая вынужденная реструктуризация за 36 месяцев');
          break;
        }
      }
      if (it.type === 3) prev3.push(d);
    }
  }
  for (const it of items) delete it._sort;
  return items;
}
export function creditEvents(ctx, restr) {
  const rep = gstr(ctx, 'r61_report');
  const m36 = parseNum(ctx.raw.i61_max36), m5 = parseNum(ctx.raw.i61_max5);
  const reasons = [];
  if (m36 !== null && m36 > 90) reasons.push('просрочка более 90 дней за 36 месяцев');
  else if (m5 !== null && m5 > 90) reasons.push('просрочка более 90 дней за 5 лет');
  if (gbool(ctx, 'f61_writeoff')) reasons.push('списание долга кредитором');
  if (gbool(ctx, 'f61_court')) reasons.push('взыскание долга по решению суда');
  if (gbool(ctx, 'f61_bankrupt')) reasons.push('процедура банкротства, санации или ликвидации');
  let t3 = false;
  for (const it of restr) {
    if (it.type === 4 && it.in5) reasons.push('реструктуризация, приравненная к дефолту (№' + it.n + ')');
    if (it.type === 3 && it.in36) t3 = true;
  }
  return { default: reasons.length > 0, default_reasons: reasons, type3: t3, refused: rep === 'refused', report: rep };
}
function sf61(ctx, ev) {
  const rep = ev.report;
  const b = ctx.settings.bounds.overdue;
  if (ev.default) {
    const res = quantResult('6.1', 'overdue', parseNum(ctx.raw.i61_max36), b, 'lower', { strict: true, special: 20 });
    res.caps.push({ name: 'Дефолт', text: 'Дефолт за 5 лет (' + ev.default_reasons.join('; ') + ') — 6.1 = 20, −2 ступени, итог не лучше B1', level: 20, exact: true });
    return res;
  }
  if (rep === 'refused') {
    const res = quantResult('6.1', 'overdue', null, b, 'lower', { special: 15 });
    res.caps.push({ name: 'Отказ в согласии', text: 'Компания отказала в согласии на запрос бюро — 15 баллов и −1 ступень', level: 15, exact: true });
    return res;
  }
  if (rep !== 'yes') {
    const res = quantResult('6.1', 'overdue', null, b, 'lower');
    res.note = 'Отчёт бюро не предоставлен — 12 баллов (правило информационного дефицита)';
    return res;
  }
  let m36 = parseNum(ctx.raw.i61_max36);
  if (m36 === null) m36 = 0;
  const res = quantResult('6.1', 'overdue', m36, b, 'lower', { strict: true });
  if (ev.type3) applyCap(res, 10.5, 'Вынужденная реструктуризация', 'Реструктуризация вида 3 за 36 месяцев — не лучше 10,5 и −1 ступень');
  const cur = parseNum(ctx.raw.i61_current);
  if (cur !== null && cur > 30) applyCap(res, 13.5, 'Текущая просрочка', 'Текущая просрочка более 30 дней — не лучше 13,5');
  const hist = parseNum(ctx.raw.i63A);
  if (hist !== null && hist < 1) applyCap(res, 12, 'Короткая история', 'Кредитная история короче 12 месяцев — не лучше 12');
  return res;
}
function sf62(ctx) {
  const b = ctx.settings.bounds.payables;
  if (gbool(ctx, 'f62_noaging')) {
    const res = quantResult('6.2', 'payables', null, b, 'lower');
    res.note = 'Аналитики по срокам нет — 12 баллов (правило информационного дефицита)';
    return res;
  }
  let tot = null;
  for (const k of ['p62_sup', 'p62_tax', 'p62_soc', 'p62_wage', 'p62_oth']) {
    const v = gnum(ctx, k);
    if (v !== null) tot = nz(tot) + v;
  }
  const ov = gnum(ctx, 'i62_overdue');
  let res;
  if (tot === null) res = quantResult('6.2', 'payables', null, b, 'lower');
  else if (tot <= 0) {
    res = quantResult('6.2', 'payables', null, b, 'lower', { special: 0.5 });
    res.note = 'Кредиторской задолженности нет — 0,5';
  } else if (ov === null) res = quantResult('6.2', 'payables', null, b, 'lower');
  else res = quantResult('6.2', 'payables', (ov / tot) * 100, b, 'lower');
  res.total = tot;
  if (gbool(ctx, 'f62_tax90')) applyCap(res, 13.5, 'Налоги просрочены более 90 дней', 'Налоги или взносы просрочены более 90 дней — не лучше 13,5');
  return res;
}
function sf63(ctx, ev) {
  const inds = [indEval('6.3.А', parseNum(ctx.raw.i63A), srcOk(ctx, 's63A')), indEval('6.3.Б', parseNum(ctx.raw.i63B), srcOk(ctx, 's63B')),
    indEval('6.3.В', parseNum(ctx.raw.i63V), srcOk(ctx, 's63V')), indEval('6.3.Г', parseNum(ctx.raw.i63G), srcOk(ctx, 's63G'))];
  const res = metricScore(inds);
  res.indicators = inds;
  if (ev.default) applyCap(res, 18, 'Дефолт за 5 лет', 'Дефолт или судебное взыскание за 5 лет — не лучше Caa (18)');
  if (gbool(ctx, 'f63_owners90')) applyCap(res, 15, 'Просрочка владельцев', 'У ключевых владельцев просрочка свыше 90 дней за 36 месяцев — не лучше B (15)');
  return res;
}

// ════════════════════════════════════════════════════════════════════════
// 6. Блок 4, базовый сценарий, стресс, корректировки
// ════════════════════════════════════════════════════════════════════════

function taxFact(ctx) {
  if (gbool(ctx, 'tax_exempt')) return [0, 'exempt'];
  let t = gnum(ctx, 'tax_cfs');
  if (t !== null) return [t, 'cfs'];
  t = gnum(ctx, 'tax_pl');
  if (t !== null) return [t, 'pl'];
  const p = gnum(ctx, 'pbt');
  if (p !== null) return [0.1 * Math.max(p, 0), 'pbt10'];
  return [0, 'none'];
}
function taxRateForecast(ctx, tax) {
  if (gbool(ctx, 'tax_exempt')) return 0;
  const p = gnum(ctx, 'pbt');
  if (p !== null && p > 0) return Math.max(0, Math.min(0.1, tax / p));
  return 0.1;
}
function debtData(ctx) {
  const st = nz(gnum(ctx, 'debt_st'));
  const bal = st + nz(gnum(ctx, 'debt_ltb')) + nz(gnum(ctx, 'debt_lto')) + nz(gnum(ctx, 'debt_lease'));
  let begin = gnum(ctx, 'debt_begin');
  if (begin === null) begin = bal;
  const d = { bal, st, begin, cash: nz(gnum(ctx, 'cash_end')), undrawn: nz(gnum(ctx, 'undrawn')), oth_st: nz(gnum(ctx, 'oth_st')), adv: nz(gnum(ctx, 'adv_refund')), mode: 'bal', ded: 0 };
  const qd = [1, 2, 3].map((k) => gnum(ctx, 'q_debt_' + k));
  const qs = [1, 2, 3].map((k) => gnum(ctx, 'q_st_' + k));
  const qi = [0, 1, 2, 3].map((k) => gnum(ctx, 'q_inv_' + k));
  const seas = ctx.seasonal;
  const qconf = seas && gbool(ctx, 'f_q_conf') && !qd.includes(null);
  const invOk = seas && gbool(ctx, 'f_inv_doc') && gbool(ctx, 'f_inv_ins') && gbool(ctx, 'f_inv_12m');
  d.seasonal = seas;
  d.qconf = qconf;
  d.inv_ok = invOk;
  const dd = [bal, qd[0], qd[1], qd[2]];
  const ss = [st, qs[0], qs[1], qs[2]];
  const ded = (k) => {
    if (!invOk || qi[k] === null || qi[k] <= 0) return 0;
    const s = ss[k] !== null ? ss[k] : 0;
    return Math.min(0.7 * qi[k], Math.max(s, 0));
  };
  let d41, d43, st44;
  if (qconf) {
    d43 = (dd[0] + dd[1] + dd[2] + dd[3]) / 4.0;
    const invAll = invOk && qi[0] !== null && qi[1] !== null && qi[2] !== null && qi[3] !== null;
    if (invAll) {
      let t = 0, td = 0;
      for (let k = 0; k < 4; k++) { t += dd[k] - ded(k); td += ded(k); }
      d41 = t / 4.0;
      d.mode = 'avg_inv';
      d.ded = td / 4.0;
    } else if (invOk && qi[0] !== null && qi[0] > 0) {
      d41 = bal - ded(0);
      d.mode = 'bal_inv';
      d.ded = ded(0);
    } else {
      d41 = d43;
      d.mode = 'avg';
    }
    st44 = st;
    for (const x of ss) if (x !== null && x > st44) st44 = x;
  } else {
    d43 = bal;
    const dd0 = ded(0);
    d41 = bal - dd0;
    d.ded = dd0;
    d.mode = dd0 > 0 ? 'bal_inv' : 'bal';
    st44 = st;
  }
  d.d41 = d41;
  d.d43 = d43;
  d.st44 = st44;
  return d;
}
function interestData(ctx, D) {
  let i0 = gnum(ctx, 'fin_int');
  if (i0 === null) i0 = 0;
  const avg = (D.begin + D.bal) / 2.0;
  const eff = avg > 0 ? i0 / avg : null;
  const [mr, msrc, mnote] = marketRate(ctx);
  const kr = parseNum(ctx.raw.key_rate);
  const thr = kr !== null ? ((kr / 100.0) * ctx.settings.low_rate_share) / 100.0 : null;
  const zero = D.begin <= 0 && D.bal <= 0 && i0 === 0;
  let recompute = false, why = null, cond = null;
  if (avg > 0 && i0 === 0) cond = 'долг есть, а проценты равны нулю';
  else if (avg > 0 && thr !== null && eff !== null && eff < thr) cond = 'эффективная ставка ниже ' + fmtNum(ctx.settings.low_rate_share, 0) + '% ключевой ставки';
  if (cond !== null) {
    if (mr * avg > i0) { recompute = true; why = cond; }
    // нормализация не должна уменьшать проценты: рыночная ставка не выше фактической
    else warnOnce(ctx, 'Эффективная ставка компании ' + fmtPct(eff * 100) + '% ниже порога нормализации (' + fmtNum(ctx.settings.low_rate_share, 0) +
      '% ключевой ставки), но рыночная ставка ' + fmtPct(mr * 100) + '% (' + MARKET_SRC[msrc] + ') не выше её — проценты оставлены фактическими. Проверьте рыночную ставку.');
  }
  if (avg > 0 && thr === null && cond === null) warnOnce(ctx, 'Ключевая ставка НБКР не указана — проверка аномально низкой ставки (нормализация процентов) не выполнена.');
  if (recompute && kr !== null && mr * 100 < kr) warnOnce(ctx, 'Рыночная ставка для нормализации ' + fmtPct(mr * 100) + '% (' + MARKET_SRC[msrc] + ') ниже ключевой ставки НБКР ' + fmtPct(kr) +
    '%: банки обычно кредитуют выше ключевой ставки, вероятно, в ставку входят льготные программы. Проверьте ставку или задайте свою ставку подсектора.');
  const used = recompute ? mr * avg : i0;
  return { actual: i0, avg_debt: avg, eff, recompute, why, used, zero, market: mr, market_src: msrc, market_note: mnote, threshold: thr };
}
function warnOnce(ctx, msg) {
  if (!ctx.warnings.includes(msg)) ctx.warnings.push(msg);
}
export const MARKET_SRC = { input: 'ставка аналитика для отрасли', sub: 'ставка подсектора из «Настроек»',
  nbkr: 'ставка из бюллетеня НБКР', segments: 'по долям сегментов агрохолдинга', all: 'общая ставка из «Настроек»' };
export function fmtPct(x) {
  return fmtNum(x, 2).replace(/0+$/, '').replace(/,$/, '');
}
// Рыночная ставка для нормализации процентов: введённая аналитиком для отрасли (с источником) или из настроек
function marketRate(ctx) {
  const st = ctx.settings;
  const v = parseNum(ctx.raw.mkt_rate);
  const src = rawStr(ctx.raw.s_mkt_rate);
  if (v !== null) {
    if (!(0.1 <= v && v <= 100)) warnOnce(ctx, 'Рыночная ставка для отрасли ' + fmtPct(v) + '% вне допустимого диапазона 0,1–100% — используется ' + fmtPct(st.market_rate) + '% (' + MARKET_SRC[st.market_src] + ').');
    else if (!src) warnOnce(ctx, 'Рыночная ставка для отрасли указана без источника — не учитывается; используется ' + fmtPct(st.market_rate) + '% (' + MARKET_SRC[st.market_src] + ').');
    else return [v / 100.0, 'input', src];
  }
  return [st.market_rate / 100.0, st.market_src, st.market_note ?? null];
}

// ── Бюллетень НБКР: ставки по новым кредитам в сомах по отраслям (табл. IV.2.19); порт раздела 15б kg_agro_rating.py
const NBKR_KEYS = C.nbkr_sectors.map((x) => x[0]);
export const NBKR_SECTORS = C.nbkr_sectors;
export const NBKR_SECTOR_NAMES = C.nbkr_sector_names;
export const NBKR_DEFAULT_MAP = C.nbkr_default_map;
const NBKR_NEW = 'IV.2.19', NBKR_PORT = 'IV.2.22';
const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');
function cellStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}
function nbkrTable(grid) {
  let first = null, lab = null;
  outer: for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v === 'string' && v.trim() === 'Всего') { first = r; lab = c; break outer; }
    }
  }
  if (first === null) return null;
  const names = {};
  for (const [k, n] of C.nbkr_sectors) names[n] = k;
  const srow = {};
  for (let r = first; r < grid.length; r++) {
    const row = grid[r];
    const s = lab < row.length ? cellStr(row[lab]) : '';
    if (s.toLowerCase().startsWith('из них')) break;
    if (has(names, s) && !has(srow, names[s])) srow[names[s]] = r;
  }
  if (!has(srow, 'total')) return null;
  let ncol = 0;
  for (let r = 0; r < first; r++) ncol = Math.max(ncol, grid[r].length);
  for (const r of Object.values(srow)) ncol = Math.max(ncol, grid[r].length);
  const years = {}, months = {};
  let curYear = null, curKey = null;
  for (let c = lab + 1; c < ncol; c++) {
    const texts = [];
    for (let r = 0; r < first; r++) if (c < grid[r].length && grid[r][c] !== null && grid[r][c] !== undefined) texts.push(grid[r][c]);
    const low = texts.map((t) => cellStr(t).toLowerCase()).join(' ');
    const isV = low.includes('объем') || low.includes('объём');
    const isR = low.includes('ставк');
    if (!isV && !isR) continue;
    if (isV) {
      let mon = null;
      for (const t of texts) {
        const s = cellStr(t).replace(/\*+$/, '').trim();
        if (/^\d{4}$/.test(s) && +s >= 1990 && +s <= 2100) curYear = +s;
        else if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12) mon = +s;
      }
      if (curYear === null) { curKey = null; continue; }
      curKey = mon !== null ? ['m', pad4(curYear) + '-' + pad2(mon)] : ['y', pad4(curYear)];
    }
    if (curKey === null) continue;
    const dst = curKey[0] === 'm' ? months : years;
    for (const [k, r] of Object.entries(srow)) {
      const v = c < grid[r].length ? grid[r][c] : null;
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      if (!has(dst, curKey[1])) dst[curKey[1]] = {};
      if (!has(dst[curKey[1]], k)) dst[curKey[1]][k] = [null, null];
      dst[curKey[1]][k][isV ? 1 : 0] = v;
    }
  }
  const clean = (d) => {
    const out = {};
    for (const p of Object.keys(d).sort()) {
      const row = {};
      for (const [k, [rt, vol]] of Object.entries(d[p])) if (rt !== null && vol !== null && rt > 0 && rt < 100 && vol > 0) row[k] = [rt, vol];
      if (Object.keys(row).length) out[p] = row;
    }
    return out;
  };
  return { years: clean(years), months: clean(months) };
}
// Ставки из бюллетеня: новые кредиты в сомах (IV.2.19) и справочно портфель в сомах (IV.2.22)
export function nbkrExtract(sheets, fname = '') {
  let tit = '';
  for (const row of sheets['Титул'] || []) {
    for (const v of row) {
      const m = /№\s*(\d{1,2}\s*\/\s*\d{4})/.exec(cellStr(v));
      if (m) { tit = '№' + m[1].replace(/ /g, ''); break; }
    }
    if (tit) break;
  }
  if (!has(sheets, NBKR_NEW)) throw new Error('В файле нет таблицы ' + NBKR_NEW + ' «Объёмы и процентные ставки по вновь выданным кредитам в национальной валюте». Нужен бюллетень НБКР целиком.');
  const nw = nbkrTable(sheets[NBKR_NEW]);
  if (nw === null || (!Object.keys(nw.years).length && !Object.keys(nw.months).length)) throw new Error('Таблица ' + NBKR_NEW + ' не распознана: не найдены строки отраслей или столбцы «общий объем» / «средневз. ставка». Возможно, НБКР изменил формат.');
  const port = has(sheets, NBKR_PORT) ? nbkrTable(sheets[NBKR_PORT]) : null;
  return { title: tit ? 'Бюллетень НБКР ' + tit : 'Бюллетень НБКР', file: fname, new: nw, port: { years: port ? port.years : {} } };
}
function normRateMap(d, re) {
  const out = {};
  if (!isObj(d)) return out;
  for (const p of Object.keys(d).sort()) {
    if (!re.test(p) || !isObj(d[p])) continue;
    const row = {};
    for (const k of NBKR_KEYS) {
      const e = d[p][k];
      if (Array.isArray(e) && e.length === 2 && e.every((x) => typeof x === 'number')) {
        const rt = e[0], vol = e[1];
        if (!Number.isNaN(rt) && !Number.isNaN(vol) && rt > 0 && rt < 100 && vol > 0) row[k] = [rt, vol];
      }
    }
    if (Object.keys(row).length) out[p] = row;
  }
  return out;
}
export function normNbkr(raw, notes) {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw) || !isObj(raw.new)) { notes.push('Данные бюллетеня НБКР в настройках повреждены — не используются.'); return null; }
  const nw = { years: normRateMap(raw.new.years, /^\d{4}$/), months: normRateMap(raw.new.months, /^\d{4}-(0[1-9]|1[0-2])$/) };
  if (!Object.keys(nw.years).length && !Object.keys(nw.months).length) { notes.push('В данных бюллетеня НБКР нет ни одной ставки — бюллетень не используется.'); return null; }
  const port = isObj(raw.port) ? raw.port : {};
  return { title: rawStr(raw.title) || 'Бюллетень НБКР', file: rawStr(raw.file), new: nw, port: { years: normRateMap(port.years, /^\d{4}$/) } };
}
const mdaysE = (y, m) => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
function nbkrPeriod(raw) {
  const r = isObj(raw) ? raw : {};
  const yv = parseNum(r.report_year);
  const ry = yv === null || yv < 1990 || yv > 2100 ? null : Math.trunc(yv);
  let fy = rawStr(r.fy_type) || 'year';
  if (!['year', 'ltm', 'interim'].includes(fy)) fy = 'year';
  const mv = parseNum(r.interim_months);
  const mo = [3, 6, 9].includes(mv) ? Math.trunc(mv) : 6;
  let bal = null;
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(rawStr(r.bal_date));
  if (m) {
    const d = parseInt(m[1], 10), mm = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (!(y < 1900 || mm < 1 || mm > 12 || d < 1 || d > mdaysE(y, mm))) bal = pad4(y) + '-' + pad2(mm) + '-' + pad2(d);
  }
  return { report_year: ry, fy_type: fy, interim_months: mo, bal };
}
// Ставка бюллетеня для отрасли за отчётный период компании: [ставка %, подпись периода] или [null, причина]
export function nbkrRate(nb, sector, pi) {
  const ry = pi.report_year;
  if (pi.fy_type === 'year') {
    if (ry === null) return [null, 'не указан последний полный финансовый год'];
    const yr = nb.new.years[pad4(ry)];
    const e = yr ? yr[sector] : undefined;
    if (e === undefined) return [null, 'нет годовой ставки за ' + ry + ' год'];
    return [e[0], ry + ' г.'];
  }
  if (pi.bal === null) return [null, 'не указана дата баланса'];
  const n = pi.fy_type === 'ltm' ? 12 : pi.interim_months;
  const y = parseInt(pi.bal.slice(0, 4), 10), m = parseInt(pi.bal.slice(5, 7), 10);
  const keys = [];
  for (let i = 0; i < n; i++) {
    const t = y * 12 + (m - 1) - i;
    keys.push(pad4(Math.floor(t / 12)) + '-' + pad2((t % 12) + 1));
  }
  keys.reverse();
  // среднее арифметическое помесячных ставок — так НБКР считает годовую ставку в той же таблице
  // (годовая = среднее 12 месяцев; LTM на 31.12 совпадает с годовой ставкой)
  let sr = 0.0;
  for (const k of keys) {
    const mm = nb.new.months[k];
    const e = mm ? mm[sector] : undefined;
    if (e === undefined) return [null, 'нет помесячных данных за ' + k.slice(5, 7) + '.' + k.slice(0, 4)];
    sr += e[0];
  }
  const lab = keys[0].slice(5, 7) + '.' + keys[0].slice(0, 4) + '–' + keys[keys.length - 1].slice(5, 7) + '.' + keys[keys.length - 1].slice(0, 4);
  return [sr / keys.length, lab];
}
export function nbkrSectorOf(st, code) {
  const ov = st.subsectors[code] || {};
  return ov.nbkr_sector || C.nbkr_default_map[code] || null;
}
export function nbkrPeriodOf(raw) { return nbkrPeriod(raw); }
// Рыночная ставка подсектора c: своя из настроек → бюллетень НБКР за отчётный период → общая
function subMarket(st, ctx, c) {
  const ov = st.subsectors[c] || {};
  if (has(ov, 'market_rate')) return [ov.market_rate, 'sub', null];
  const nb = st.nbkr || null;
  const sec = nbkrSectorOf(st, c);
  if (nb !== null && sec !== null) {
    const [r, lab] = nbkrRate(nb, sec, nbkrPeriod(ctx.raw));
    if (r !== null) return [q(r, 2), 'nbkr', nb.title + ', табл. IV.2.19: ' + C.nbkr_sector_names[sec] + ', ' + lab + ' — новые кредиты в сомах'];
    const msg = 'Бюллетень НБКР (' + nb.title + '), отрасль «' + C.nbkr_sector_names[sec] + '»: ' + lab + ' — используется общая ставка из «Настроек» (' + fmtPct(st.market_rate) + '%).';
    if (!ctx.warnings.includes(msg)) ctx.warnings.push(msg);
  }
  return [st.market_rate, 'all', null];
}
function levScores(ctx, E, intr, tax, div, d41, d43, cash, zero) {
  const b = ctx.settings.bounds;
  const out = { ebitda: E, interest: intr, tax, div, d41, d43, cash, v41: null, v42: null, v43: null, s41: null, s42: null, s43: null, ffo: null, rcf: null, nd: null,
    n41: null, n42: null, n43: null };
  if (E === null) {
    out.s41 = DEFAULT; out.s42 = DEFAULT; out.s43 = DEFAULT;
    out.missing = true;
    return out;
  }
  out.missing = false;
  if (E <= 0) { out.s41 = 20.5; out.n41 = 'EBITDA ≤ 0'; }
  else { out.v41 = d41 / E; out.s41 = q(scoreValue(out.v41, b.de, 'lower'), 2); }
  if (E <= 0) { out.s42 = 20.5; out.n42 = 'EBITDA ≤ 0'; }
  else if (zero || intr <= 0) { out.s42 = 0.5; out.n42 = 'Долга и процентов нет'; }
  else { out.v42 = E / intr; out.s42 = q(scoreValue(out.v42, b.ic, 'higher'), 2); }
  const ffo = E - intr - tax;
  const rcf = ffo - div;
  const nd = d43 - cash;
  out.ffo = ffo; out.rcf = rcf; out.nd = nd;
  if (nd <= 0) { out.s43 = rcf > 0 ? 0.5 : 20.5; out.n43 = 'Чистый долг ≤ 0, RCF ' + (rcf > 0 ? '> 0' : '≤ 0'); }
  else { out.v43 = (rcf / nd) * 100; out.s43 = q(scoreValue(out.v43, b.rcf, 'higher'), 2); }
  return out;
}
function liqCase(ctx, cash, undrawn, ffo, st44, capex, div, adv) {
  const num = cash + undrawn + (ffo !== null ? ffo : 0);
  const den = st44 + capex + div + adv;
  if (ffo === null) return { num: null, den, value: null, score: DEFAULT, missing: true, note: null };
  if (den <= 0) return { num, den, value: null, score: 0.5, missing: false, note: 'Потребностей в ликвидности нет' };
  const v = num / den;
  return { num, den, value: v, score: q(scoreValue(v, ctx.settings.bounds.liq, 'higher'), 2), missing: false, note: null };
}
function forecastBase(ctx, series, m3) {
  const rev0 = gnum(ctx, 'rev_0');
  const fc = { rev0, bp: !gbool(ctx, 'bp_none'), notes: [] };
  if (rev0 === null) { fc.B = null; fc.E = null; return fc; }
  const g3 = ctx.g3;
  let base = rev0;
  fc.base_III = null;
  if (g3 > 0) {
    const i0 = nz(parseNum(ctx.raw.infl_0)) / 100.0, i1 = nz(parseNum(ctx.raw.infl_1)) / 100.0;
    const vals = [];
    for (let y = 0; y < 3; y++) {
      const r = gnum(ctx, 'rev_' + y);
      if (r === null) break;
      let f = 1.0;
      if (y >= 1) f = f * (1 + i0);
      if (y >= 2) f = f * (1 + i1);
      vals.push(r * f);
    }
    let s = 0;
    for (const v of vals) s += v;
    const b3 = s / vals.length;
    fc.base_III = b3;
    fc.base_years = vals.length;
    base = g3 * b3 + (1 - g3) * rev0;
  }
  fc.base = base;
  const infl = parseNum(ctx.raw.infl_fc);
  fc.infl = infl;
  let g = 0, newcap = 0, gadd = 0;
  if (fc.bp) {
    const bg = parseNum(ctx.raw.bp_growth);
    const cap = nz(infl) + 5;
    g = Math.min(nz(bg), cap);
    fc.g_bp = bg;
    fc.g_cap = cap;
    const nr = gnum(ctx, 'newcap_rev'), nm = parseNum(ctx.raw.newcap_month);
    if (nr !== null && nr > 0 && nm !== null && nm >= 1 && nm <= 12) newcap = Math.min((nr * (13 - Math.trunc(nm))) / 12.0, 0.5 * nr);
    if (ctx.garden) {
      const price = gnum(ctx, 'garden_price');
      if (price !== null && price > 0) {
        let add = 0;
        for (const r of gardenRows(ctx)) {
          if (r.phase === 'young' || r.phase === 'entering') {
            const nxt = gardenPhase(r.kind, r.age + 1)[1];
            const inc = nxt - r.coef;
            if (inc > 0) add += inc * r.area * GARDEN[r.kind].yield;
          }
        }
        gadd = 0.5 * add * price;
      }
    }
  }
  fc.g = g;
  fc.newcap = newcap;
  fc.garden_add = gadd;
  const B = base * (1 + g / 100.0) + newcap + gadd;
  fc.B = B;
  let m = m3;
  if (fc.bp) {
    const bm = parseNum(ctx.raw.bp_margin);
    fc.m_bp = bm;
    if (bm !== null && m3 !== null) m = Math.min(bm, m3);
  }
  fc.m = m;
  fc.E = m !== null ? (B * m) / 100.0 : null;
  return fc;
}
function avgDistributions(ctx) {
  let s = 0, n = 0;
  for (let y = 0; y < 3; y++) {
    const vals = [gnum(ctx, 'div_' + y), gnum(ctx, 'buyback_' + y), gnum(ctx, 'ownloan_' + y), gnum(ctx, 'np_' + y)];
    if (vals[0] === null && vals[1] === null && vals[2] === null && vals[3] === null) continue;
    n += 1;
    s += nz(vals[0]) + nz(vals[1]) + nz(vals[2]);
  }
  return n > 0 ? s / n : 0;
}
export function c1Params(ctx, c) {
  let p = { ...SUBS[c].c1 };
  if (c === 'FSH' && subGroup(ctx, 'FSH') === 'II') p = { ...SUBS.FSH.c1_proc };
  if (c === 'FLR' && gbool(ctx, 'flr_regulated')) p.t = 0.5;
  if (c === 'CRP') {
    const pp = ctx.crp_p / 100.0;
    const a = 1 - pp;
    let w = parseNum(ctx.raw.crp_water_share);
    if (w === null || !textOk(gstr(ctx, 'crp_water_doc'))) w = 0;
    w = Math.max(0, Math.min(100, w)) / 100.0;
    let st = parseNum(ctx.raw.stone_share);
    p.stone_default = st === null && pp > 0;
    st = st === null ? 1.0 : Math.max(0, Math.min(100, st)) / 100.0;
    const doA = 0.4 * (1 - w) + 0.25 * w;
    const doG = 0.6 * st + 0.3 * (1 - st);
    p.d_o = a * doA + pp * doG;
    p.vsh = a * 0.15 + pp * 0.2;
    p.water = w;
    p.stone = st;
  }
  return p;
}
function vFor(ctx, c) {
  const v = parseNum(ctx.raw.v_share);
  if (v !== null && v >= 0 && v <= 100) return v / 100.0;
  return C.v_default[subGroup(ctx, c)];
}
function c1Delta(B, Cc, v, p) {
  const vsh = p.vsh === 'v' ? v : p.vsh;
  return B * p.d_o * (1 - vsh) + B * (1 - p.d_o) * p.d_c + Cc * (1 - p.d_o) * p.r * (1 - p.t);
}
function stressC1(ctx, B, k) {
  const parts = [];
  let tot = 0;
  for (const c of ctx.segs) {
    const p = c1Params(ctx, c);
    let Bc, rc;
    if (ctx.is_int) { Bc = (B * ctx.shares[c]) / 100.0; rc = gnum(ctx, 'seg_raw_' + c); }
    else { Bc = B; rc = gnum(ctx, 'raw_cost'); }
    let Cc, cdef;
    if (rc !== null) { Cc = rc * k; cdef = false; }
    else { Cc = C.c_default[subGroup(ctx, c)] * Bc; cdef = true; }
    const v = vFor(ctx, c);
    const dlt = c1Delta(Bc, Cc, v, p);
    parts.push({ sub: c, B: Bc, C: Cc, C_default: cdef, v, d_o: p.d_o, d_c: p.d_c, r: p.r, t: p.t, vsh: p.vsh === 'v' ? v : p.vsh, delta: dlt, shock: p.shock });
    tot += dlt;
  }
  return [tot, parts];
}
function companyT(ctx) {
  if (!ctx.is_int) return ctx.main !== null ? c1Params(ctx, ctx.main).t : 0;
  let t = 0;
  for (const c of ctx.segs) t += ctx.seg_w[c] * c1Params(ctx, c).t;
  return t;
}
function companyV(ctx) {
  const v = parseNum(ctx.raw.v_share);
  if (v !== null && v >= 0 && v <= 100) return v / 100.0;
  if (!ctx.is_int) return C.v_default[subGroup(ctx, ctx.main)];
  let t = 0;
  for (const c of ctx.segs) t += ctx.seg_w[c] * C.v_default[subGroup(ctx, c)];
  return t;
}
function nextTwoQuartersShare(ctx) {
  const qs = [1, 2, 3, 4].map((i) => gnum(ctx, 'q_rev_' + i));
  const bd = ctx.bal_date;
  if (qs.includes(null) || bd === null) return null;
  const t = qs[0] + qs[1] + qs[2] + qs[3];
  if (t <= 0) return null;
  const qb = Math.floor((bd[1] - 1) / 3);
  const a = (qb + 1) % 4, b = (qb + 2) % 4;
  return (qs[a] + qs[b]) / t;
}
function adjustments(ctx, A, ev) {
  const items = [];
  const caps = [];
  const lt = gnum(ctx, 'liab_total'), ou = gnum(ctx, 'oth_undisclosed');
  if (lt !== null && lt > 0 && ou !== null) {
    const r = (ou / lt) * 100;
    items.push({ id: 'undisclosed', notches: r > 20 ? -2 : r > 10 ? -1 : 0, value: r, unit: '%' });
  }
  const fxd = A.fx_debt, fxr = A.fx_rev;
  if (fxd > 0 || fxr > 0) {
    const ds = A.debt > 0 ? (fxd / A.debt) * 100 : 0;
    const rs = A.rev > 0 ? (fxr / A.rev) * 100 : 0;
    const gap = ds - rs;
    items.push({ id: 'fx', notches: gap > 60 ? -2 : gap > 30 ? -1 : 0, value: gap, unit: 'п.п.', debt_share: ds, rev_share: rs });
  }
  const ss = parseNum(ctx.raw.state_share), rg = parseNum(ctx.raw.regulated_share);
  let n = 0;
  const plus = (ss !== null && ss >= 50) || gbool(ctx, 'f_strategic');
  const minus = rg !== null && rg >= 30;
  if (plus) n += 1;
  if (minus) n -= 1;
  if (plus || minus) items.push({ id: 'state', notches: n, value: null, plus, minus });
  const ps = parseNum(ctx.raw.permit_share);
  if (ps !== null && ps >= 30) items.push({ id: 'event', notches: gbool(ctx, 'f_permit_active') ? -2 : -1, value: ps, unit: '%' });
  const pl = gnum(ctx, 'pledge_owners'), nm = gnum(ctx, 'nonmarket_deals');
  n = 0;
  let pv = null, nv = null;
  if (pl !== null && pl > 0) {
    const eq = A.equity;
    if (eq === null || eq <= 0) n -= 2;
    else {
      pv = (pl / eq) * 100;
      if (pv > 50) n -= 2;
      else if (pv > 25) n -= 1;
    }
  }
  if (nm !== null && nm > 0) {
    const ae = gnum(ctx, 'assets_end');
    if (ae !== null && ae > 0) {
      nv = (nm / ae) * 100;
      if (nv > 10) n -= 3;
    }
  }
  if (n < -3) n = -3;
  if ((pl !== null && pl > 0) || (nm !== null && nm > 0)) items.push({ id: 'pledges', notches: n, value: pv, unit: '%', nonmarket: nv });
  const r6 = nz(gnum(ctx, 'repay6')), d6 = nz(gnum(ctx, 'div6')), capex = nz(gnum(ctx, 'capex12'));
  const den = r6 + 0.5 * capex + d6;
  let share = 0.5, how = 'half';
  if (ctx.seasonal) {
    const sh = nextTwoQuartersShare(ctx);
    if (sh !== null) { share = sh; how = 'seasonal'; }
  }
  if (den > 0 && A.ffo !== null) {
    const ffo6 = A.ffo * share;
    const ratio = (A.cash + A.undrawn + ffo6) / den;
    items.push({ id: 'crisis', notches: ratio < 0.5 ? -3 : ratio < 0.7 ? -2 : ratio < 1.0 ? -1 : 0, value: ratio, unit: 'x', ffo6, share6: share, how });
  }
  if (gbool(ctx, 'f53_sanct')) {
    items.push({ id: 'aml', notches: 0, value: null, cap: true, what: 'sanctions' });
    caps.push('Санкции США, ЕС или Великобритании — итоговая оценка не выше B1');
  } else if (gbool(ctx, 'f53_crim')) items.push({ id: 'aml', notches: -1, value: null, what: 'criminal' });
  if (ev.default) {
    items.push({ id: 'credit', notches: -2, value: null, cap: true, what: 'default' });
    caps.push('Дефолт за 5 лет — итоговая оценка не лучше B1');
  } else {
    let n2 = 0;
    if (ev.type3) n2 -= 1;
    if (ev.refused) n2 -= 1;
    if (n2 !== 0) items.push({ id: 'credit', notches: n2, value: null, what: (ev.type3 ? 'type3' : '') + (ev.refused ? '+refused' : '') });
  }
  let tot = 0;
  for (const it of items) tot += it.notches;
  return { items, notches: tot, cap_b1: caps.length > 0, caps };
}
function applyRating(agg, adj) {
  const base = ratingIndex(agg);
  let idx = base - adj.notches;
  if (idx < 0) idx = 0;
  if (idx > C.rating_scale.length - 1) idx = C.rating_scale.length - 1;
  let capped = false;
  if (adj.cap_b1 && idx < C.cap_b1_index) { idx = C.cap_b1_index; capped = true; }
  return [base, idx, capped];
}
function aggregate(ctx, scores) {
  const w = ctx.settings.weights;
  let tot = 0, s = 0;
  for (const code of SF_CODES) { tot += w[code]; s += w[code] * scores[code]; }
  return tot > 0 ? q(s / tot, 2) : DEFAULT;
}

function block4(ctx, series, m3) {
  const D = debtData(ctx);
  const I = interestData(ctx, D);
  const [tax, tsrc] = taxFact(ctx);
  const e0 = yearEbitda(ctx, 0);
  const E0 = e0 !== null ? e0.ebitda : null;
  const div0 = nz(gnum(ctx, 'div_0'));
  const fact = levScores(ctx, E0, I.used, tax, div0, D.d41, D.d43, D.cash, I.zero);
  // справочно: покрытие по фактическим процентам, если проценты нормализованы
  I.ic_actual = I.recompute && I.actual > 0 && E0 !== null && E0 > 0 ? E0 / I.actual : null;
  let factNod = null;
  if (D.ded > 0 && E0 !== null && E0 > 0) factNod = D.d43 / E0;
  const fc = forecastBase(ctx, series, m3);
  const newl = nz(gnum(ctx, 'new_loans'));
  const rep = nz(gnum(ctx, 'repay12'));
  const delta = newl - rep;
  const endF = Math.max(0, D.bal + delta);
  const d41f = Math.max(0, D.d41 + delta);
  const d43f = Math.max(0, D.d43 + delta);
  const avgF = (D.bal + endF) / 2.0;
  let rateF;
  if (I.recompute) rateF = Math.max(I.eff !== null ? I.eff : 0, I.market);
  else if (I.eff !== null) rateF = I.eff;
  else rateF = avgF > 0 ? I.market : 0;
  const intF = avgF * rateF;
  const divp = nz(gnum(ctx, 'div_policy'));
  const divavg = avgDistributions(ctx);
  const divF = Math.max(divp, divavg);
  const trate = taxRateForecast(ctx, tax);
  const da0 = nz(gnum(ctx, 'da_0'));
  const E = fc.E;
  let taxF = 0;
  if (E !== null) {
    const pbtF = E - da0 - intF;
    taxF = pbtF > 0 ? trate * pbtF : 0;
  }
  const zeroF = avgF <= 0 && intF === 0;
  const fcs = levScores(ctx, E, intF, taxF, divF, d41f, d43f, D.cash, zeroF);
  const capex12 = nz(gnum(ctx, 'capex12'));
  const liq = liqCase(ctx, D.cash, D.undrawn, fcs.ffo, D.st44, capex12, divF, D.adv);
  Object.assign(fc, { new_loans: newl, repay12: rep, debt_end: endF, d41: d41f, d43: d43f, avg_debt: avgF, rate: rateF, interest: intF, div: divF,
    div_policy: divp, div_avg: divavg, tax_rate: trate, tax: taxF, capex12, scores: fcs, liq });
  const out = { debt: D, int: I, tax, tax_src: tsrc, E0, div0, fact, fact_nod: factNod, fc };
  const k = fc.B !== null && fc.rev0 !== null && fc.rev0 > 0 ? fc.B / fc.rev0 : 1;
  const fxd = nz(gnum(ctx, 'fx_debt'));
  const fxrate = nz(parseNum(ctx.raw.fx_rate)) / 100.0;
  const fxr = nz(gnum(ctx, 'fx_rev')), imp = nz(gnum(ctx, 'imp_cost')), ext = nz(gnum(ctx, 'export_top')), flt = nz(gnum(ctx, 'float_debt'));
  const scen = [];
  if (E !== null) {
    const B = fc.B;
    for (const sid of ['C1', 'C2', 'C3', 'C4']) {
      let dE = 0, dInt = 0, dDebt = 0, det = {};
      if (sid === 'C1') {
        const [t, parts] = stressC1(ctx, B, k);
        dE = t;
        det.parts = parts;
      } else if (sid === 'C2') {
        const t = companyT(ctx);
        const gain = 0.25 * fxr * k;
        const loss = 0.25 * imp * k * (1 - t);
        dE = loss - gain;
        dDebt = 0.25 * fxd;
        dInt = 0.25 * fxd * fxrate;
        det = { fx_rev_gain: gain, import_loss: loss, t, fx_debt_add: dDebt, fx_int_add: dInt };
      } else if (sid === 'C3') {
        const v = companyV(ctx);
        const lost = 0.5 * ext * k;
        dE = lost * (1 - v);
        det = { lost_rev: lost, v };
      } else {
        dInt = 0.05 * flt;
        det = { float_debt: flt, int_add: dInt };
      }
      const Es = E - dE;
      const ints = intF + dInt;
      const pbtS = Es - da0 - ints;
      const taxS = pbtS > 0 ? trate * pbtS : 0;
      const d41s = d41f + D.oth_st + dDebt;
      const d43s = d43f + D.oth_st + dDebt;
      const zs = avgF + dDebt <= 0 && ints === 0;
      const ls = levScores(ctx, Es, ints, taxS, divF, d41s, d43s, D.cash, zs);
      const lq = liqCase(ctx, D.cash, D.undrawn, ls.ffo, D.st44 + D.oth_st, capex12, divF, D.adv);
      scen.push({ id: sid, dE, E: Es, interest: ints, tax: taxS, d41: d41s, d43: d43s, scores: ls, liq: lq, d_debt: dDebt, detail: det });
    }
  }
  out.stress = scen;
  out.k = k;
  out.fx = { debt: fxd, rate: fxrate, rev: fxr, imp, export_top: ext, float: flt };
  return out;
}
function b4Subfactors(ctx, B4) {
  const fa = B4.fact, fs = B4.fc.scores;
  const res = {};
  for (const [code, key, metric] of [['4.1', '41', 'de'], ['4.2', '42', 'ic'], ['4.3', '43', 'rcf']]) {
    const sf_ = fa['s' + key], sc_ = fs['s' + key];
    const comb = q(0.5 * sf_ + 0.5 * sc_, 2);
    res[code] = { code, metric, fact: { value: fa['v' + key], score: sf_, note: fa['n' + key] }, fc: { value: fs['v' + key], score: sc_, note: fs['n' + key] },
      raw: comb, score: comb, cat: categoryForScore(comb), caps: [], all_default: fa.missing && fs.missing, unit: METRICS[metric].unit };
  }
  const lq = B4.fc.liq;
  res['4.4'] = { code: '4.4', metric: 'liq', value: lq.value, raw: lq.score, score: lq.score,
    cat: lq.value !== null ? categoryForValue(lq.value, ctx.settings.bounds.liq, 'higher') : categoryForScore(lq.score),
    caps: [], all_default: lq.missing, unit: 'x', note: lq.note, num: lq.num, den: lq.den };
  return res;
}

// ════════════════════════════════════════════════════════════════════════
// 7. Полный расчёт
// ════════════════════════════════════════════════════════════════════════

export function inputsForHash(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const f of C.fields) {
    const v = raw[f.key];
    if (f.type === 'bool') { if (rawBool(v)) out[f.key] = true; }
    else {
      const s = rawStr(v);
      if (s !== '') out[f.key] = s;
    }
  }
  for (const t of C.table_order) {
    const rows = raw[t];
    if (Array.isArray(rows)) {
      const rr = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const d = {};
        for (const c of C.tables[t].cols) {
          const v = row[c.key];
          if (c.type === 'bool') { if (rawBool(v)) d[c.key] = true; }
          else {
            const s = rawStr(v);
            if (s !== '') d[c.key] = s;
          }
        }
        if (Object.keys(d).length > 0) rr.push(d);
      }
      if (rr.length > 0) out[t] = rr;
    }
  }
  return out;
}
export const inputHash = (raw) => sha256Hex(canonical(inputsForHash(raw)));

function scoresWith(base, repl) {
  const out = {};
  for (const c of SF_CODES) out[c] = c in repl ? repl[c] : base[c];
  return out;
}

export function outlook(ctx, cur, fc, stv) {
  const better = cur - fc;
  const worse = stv - cur;
  const reasons = [];
  let code;
  if (gbool(ctx, 'f_review')) {
    code = 'REVIEW';
    reasons.push('произошло событие, данных для пересчёта ещё нет');
  } else if ((better >= 1 && worse >= 3) || gbool(ctx, 'f_event')) {
    code = 'DEVELOPING';
    if (gbool(ctx, 'f_event')) reasons.push('предстоит событие с неопределённым исходом (10% выручки или капитала и более)');
    if (better >= 1 && worse >= 3) reasons.push('прогнозная оценка выше текущей на ' + better + ' ступ., стрессовая ниже на ' + worse + ' ступ.');
  } else if (better <= -1 || worse >= 3) {
    code = 'NEGATIVE';
    if (better <= -1) reasons.push('прогнозная оценка ниже текущей на ' + -better + ' ступ.');
    if (worse >= 3) reasons.push('стрессовая оценка ниже текущей на ' + worse + ' ступ.');
  } else if (better >= 1 && worse <= 1) {
    code = 'POSITIVE';
    reasons.push('прогнозная оценка выше текущей на ' + better + ' ступ., стрессовая ниже не более чем на 1 ступ.');
  } else {
    code = 'STABLE';
    reasons.push('условия других прогнозов не выполнены');
  }
  return { code, label: C.outlooks[code].label, reasons, better, worse };
}

export function compute(raw, settings = null, haircut = null) {
  const [st, snotes] = settings !== null && settings !== undefined ? normalizeSettings(settings) : [defaultSettings(), []];
  const ctx = buildCtx(raw, st, haircut);
  const res = { model: C.model_version, marking: C.marking, status: null, message: null, errors: ctx.errors, warnings: ctx.warnings.concat(snotes),
    main: ctx.main, is_int: ctx.is_int, segs: ctx.segs, seg_w: ctx.seg_w, shares: ctx.shares, group: ctx.group, gshare: ctx.gshare, g3: ctx.g3,
    seasonal: ctx.seasonal, garden: ctx.garden, annual: ctx.annual, crp_p: ctx.crp_p, fx: ctx.fx, currency: ctx.currency, rate_avg: ctx.rate_avg,
    rate_end: ctx.rate_end, annualized: ctx.annualized, ann: ctx.ann, settings_changed: ctx.settings.changed, sub_source: ctx.sub_source,
    sub_selected: ctx.sub_selected, input_hash: inputHash(raw) };
  if (ctx.errors.length > 0) {
    res.status = 'error';
    res.message = 'Расчёт невозможен: ' + ctx.errors.join(' ');
    res.result_hash = sha256Hex(canonical({ status: 'error', errors: ctx.errors }));
    return res;
  }
  const series = marginSeries(ctx);
  res.series = series;
  const sf = {};
  sf['1.1'] = sf11(ctx);
  sf['1.2'] = sf12(ctx);
  sf['1.3'] = sf13(ctx);
  sf['1.4'] = sf14(ctx);
  sf['1.5'] = sf15(ctx, series);
  sf['1.6'] = sf16(ctx);
  sf['2.1'] = sf21(ctx);
  sf['2.2'] = sf22(ctx);
  sf['2.3'] = sf23(ctx);
  sf['3.1'] = sf31(ctx, series);
  sf['3.2'] = sf32(ctx, series);
  const m3 = sf['3.1'].value;
  const restr = restructurings(ctx);
  const ev = creditEvents(ctx, restr);
  const B4 = block4(ctx, series, m3);
  const b4 = b4Subfactors(ctx, B4);
  for (const c of ['4.1', '4.2', '4.3', '4.4']) sf[c] = b4[c];
  const tests = integrityTests(ctx);
  sf['5.1'] = sf51(ctx);
  sf['5.2'] = sf52(ctx, tests);
  sf['5.3'] = sf53(ctx);
  sf['6.1'] = sf61(ctx, ev);
  sf['6.2'] = sf62(ctx);
  sf['6.3'] = sf63(ctx, ev);
  for (const c of SF_CODES) {
    sf[c].code = c;
    sf[c].weight = ctx.settings.weights[c];
    sf[c].cat_score = categoryForScore(sf[c].score);
  }
  res.sf = sf;
  res.restr = restr;
  res.credit = ev;
  res.b4 = B4;
  for (const w of ctx.warnings) if (!res.warnings.includes(w)) res.warnings.push(w);
  res.tests = tests;
  const scores = {};
  for (const c of SF_CODES) scores[c] = sf[c].score;
  res.scores = scores;
  const [eq] = equityAdjusted(ctx);
  const rev0 = gnum(ctx, 'rev_0');
  const A = { fx_debt: B4.fx.debt, fx_rev: B4.fx.rev, debt: B4.debt.bal, rev: nz(rev0), equity: eq, ffo: B4.fc.scores.ffo, cash: B4.debt.cash, undrawn: B4.debt.undrawn };
  const adj = adjustments(ctx, A, ev);
  const agg = aggregate(ctx, scores);
  const [baseIdx, idx, capped] = applyRating(agg, adj);
  res.agg = agg;
  res.adj = adj;
  res.base_index = baseIdx;
  res.index = idx;
  res.capped = capped;
  res.rating_base = ratingInfo(baseIdx, agg);
  res.rating = ratingInfo(idx, idx === baseIdx ? agg : null);
  const fcs = B4.fc.scores;
  const scFc = scoresWith(scores, { '4.1': fcs.s41, '4.2': fcs.s42, '4.3': fcs.s43 });
  const aggFc = aggregate(ctx, scFc);
  const idxFc = applyRating(aggFc, adj)[1];
  res.forecast = { agg: aggFc, index: idxFc, rating: ratingInfo(idxFc) };
  let worst = null;
  const srs = [];
  for (const s of B4.stress) {
    const ls = s.scores;
    const scS = scoresWith(scores, { '4.1': ls.s41, '4.2': ls.s42, '4.3': ls.s43, '4.4': s.liq.score });
    const A2 = { ...A };
    A2.ffo = ls.ffo;
    if (s.id === 'C2') {
      A2.fx_debt = A.fx_debt * 1.25;
      A2.debt = A.debt + 0.25 * A.fx_debt;
      A2.fx_rev = A.fx_rev * 1.25;
      A2.rev = A.rev + 0.25 * A.fx_rev;
    }
    const adjS = adjustments(ctx, A2, ev);
    const aggS = aggregate(ctx, scS);
    const idxS = applyRating(aggS, adjS)[1];
    const item = { id: s.id, agg: aggS, index: idxS, rating: ratingInfo(idxS), notches: adjS.notches, s41: ls.s41, s42: ls.s42, s43: ls.s43, s44: s.liq.score };
    srs.push(item);
    if (worst === null || idxS > worst.index) worst = item;
  }
  res.stress = { items: srs, worst };
  res.outlook = outlook(ctx, idx, idxFc, worst ? worst.index : idx);
  const suff = [];
  if (gnum(ctx, 'rev_0') === null || gnum(ctx, 'op_0') === null) suff.push(C.sufficiency_rules[0]);
  else if (ctx.fy_type === 'interim' && !gbool(ctx, 'interim_typical'))
    suff.push(C.sufficiency_rules[0] + ' (промежуточный период не подтверждён как типичный — пересчёт в годовые данные не допускается)');
  let dw = 0, tw = 0;
  const dlist = [];
  for (const c of SF_CODES) {
    tw += ctx.settings.weights[c];
    if (sf[c].all_default) { dw += ctx.settings.weights[c]; dlist.push(c); }
  }
  res.default_weight = tw > 0 ? (dw / tw) * 100 : 0;
  res.default_list = dlist;
  if (tw > 0 && (dw / tw) * 100 > 20) suff.push(C.sufficiency_rules[1] + ' (сейчас ' + fmtNum((dw / tw) * 100, 1) + '%: ' + dlist.join(', ') + ')');
  if (tests[0].result === 'fail' && tests[1].result === 'fail') suff.push(C.sufficiency_rules[2]);
  const stops = stopFactors(ctx);
  res.stops = stops;
  res.insufficient = suff;
  if (stops.length > 0) { res.status = 'stop'; res.message = 'Оценка не присваивается: стоп-фактор ПОД/ФТ'; }
  else if (suff.length > 0) { res.status = 'insufficient'; res.message = 'Оценка не присваивается: недостаточно информации'; }
  else { res.status = 'rated'; res.message = null; }
  res.ref30 = null;
  if (ctx.annualized && haircut === null && res.status === 'rated') {
    const r2 = compute(raw, settings, 0.7);
    if (['rated', 'insufficient', 'stop'].includes(r2.status)) res.ref30 = { agg: r2.agg, index: r2.index, rating: r2.rating };
  }
  const core = { status: res.status, agg, index: idx, base: baseIdx, scores, fc: [aggFc, idxFc], stress: srs.map((x) => [x.id, x.agg, x.index]), outlook: res.outlook.code,
    adj: adj.items.map((x) => [x.id, x.notches]), ref30: res.ref30 ? res.ref30.index : null };
  res.core = core;
  res.result_hash = sha256Hex(canonical(core));
  return res;
}

// ── Для интерфейса: контекст без расчёта (видимость полей, подсектор)
export function inputContext(raw, settings = null) {
  const [st] = settings !== null && settings !== undefined ? normalizeSettings(settings) : [defaultSettings(), []];
  return buildCtx(raw, st);
}

// ── Для интерфейса: параметры подсектора с учётом настроек (что изменено относительно методологии)
export function subsectorParams(st, c) {
  const d = subDefaultParams(c);
  const subs = st && isObj(st.subsectors) ? st.subsectors : {};
  const ov = has(subs, c) ? subs[c] : {};
  const p = { weights: ov.weights ? { ...ov.weights } : d.weights, bounds: {}, defaults: d,
    changed: { weights: !!ov.weights, bounds: {}, margin: has(ov, 'margin'), nat: has(ov, 'nat'), any: Object.keys(ov).length > 0 } };
  for (const k of BOUND_KEYS) {
    const o = !!(ov.bounds && has(ov.bounds, k));
    p.bounds[k] = o ? [...ov.bounds[k]] : d.bounds[k];
    p.changed.bounds[k] = o;
  }
  if (has(d, 'margin')) p.margin = has(ov, 'margin') ? [...ov.margin] : d.margin;
  if (has(d, 'nat')) p.nat = has(ov, 'nat') ? [...ov.nat] : d.nat;
  const glob = st && isNum(st.market_rate) ? st.market_rate : defaultSettings().market_rate;
  p.market_rate = has(ov, 'market_rate') ? ov.market_rate : glob;
  p.market_glob = glob;
  p.changed.market = has(ov, 'market_rate');
  p.nbkr_sector = st && isObj(st.subsectors) ? nbkrSectorOf(st, c) : (C.nbkr_default_map[c] || null);
  p.changed.nbkr = has(ov, 'nbkr_sector');
  return p;
}
