const nf = {};
function fmt(d) {
  if (!nf[d]) nf[d] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  return nf[d];
}
export const isN = (x) => typeof x === 'number' && Number.isFinite(x);
export function num(x, d = 2) {
  if (!isN(x)) return '—';
  return fmt(d).format(x).replace('-', '−');
}
export function money(x) {
  if (!isN(x)) return '—';
  return fmt(0).format(Math.round(x)).replace('-', '−');
}
export function mln(x, d = 1) {
  if (!isN(x)) return '—';
  return num(x / 1e6, d) + ' млн';
}
export function pct(x, d = 1) {
  if (!isN(x)) return '—';
  return num(x, d) + '%';
}
export function signed(n) {
  if (!isN(n)) return '—';
  const a = Number.isInteger(n) ? String(Math.abs(n)) : num(Math.abs(n), 1);
  if (n > 0) return '+' + a;
  if (n < 0) return '−' + a;
  return '0';
}
export function metricValue(row) {
  if (row.text) return row.text;
  if (!isN(row.value)) return '—';
  const u = row.unit;
  if (u === 'x') return num(row.value, 2) + '×';
  if (u === '%') return num(row.value, 1) + '%';
  if (u === 'п.п.') return num(row.value, 1) + ' п.п.';
  if (u === 'млн сом') return num(row.value, 0) + ' млн сом';
  if (u === 'дней') return num(row.value, 0) + ' дн.';
  return num(row.value, 2);
}
export function catTone(cat) {
  if (!cat) return 'none';
  if (['Aaa', 'Aa', 'A'].includes(cat)) return 'good';
  if (cat === 'Baa') return 'ok';
  if (cat === 'Ba') return 'mid';
  if (cat === 'B') return 'weak';
  return 'bad';
}
export function ratingTone(idx) {
  if (!isN(idx)) return 'none';
  if (idx <= 6) return 'good';
  if (idx <= 9) return 'ok';
  if (idx <= 12) return 'mid';
  if (idx <= 15) return 'weak';
  return 'bad';
}
export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
