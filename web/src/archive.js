// Архив оценок. Формат записи совпадает с Python (entry_summary / make_entry в kg_agro_rating.py).
import { cfg, rawStr } from './engine.js';
import { num, isN } from './format.js';
import { docsOf, deviationText } from './process.js';

export const ARCHIVE_FORMAT = 'kyrgyz-rating-archive/2';
const LS_ARCHIVE = 'kyrgyz-rating-archive-v2';
const LS_LEGACY = 'kg-agro-rating-archive-v1';

export function entrySummary(res, raw, settings) {
  const rated = res.status === 'rated';
  const sub = res.main;
  return {
    model: cfg.model_version, company: rawStr(raw.company), inn: rawStr(raw.inn), analyst: rawStr(raw.analyst),
    eval_date: rawStr(raw.eval_date), report_year: rawStr(raw.report_year),
    subsector: sub, subsector_name: sub && cfg.subsectors[sub] ? cfg.subsectors[sub].name : '',
    calc_status: res.status, message: res.message ?? null,
    agg: res.agg ?? null, base_national: res.rating_base ? res.rating_base.national : null,
    notches: res.adj ? res.adj.notches : null,
    final_index: rated ? res.index : null, final_internal: rated ? res.rating.internal : null, final_national: rated ? res.rating.national : null,
    outlook_code: rated ? res.outlook.code : null, outlook_label: rated ? res.outlook.label : null,
    input_hash: res.input_hash, result_hash: res.result_hash,
    inputs: raw, settings,
  };
}

export function makeEntry(res, raw, settings, status = 'draft', note = '', savedAt = null, id = null) {
  const e = entrySummary(res, raw, settings);
  const now = new Date().toISOString();
  e.saved_at = savedAt || now;
  e.updated_at = now;
  e.id = id || 'k' + e.saved_at.replace(/\D/g, '').slice(0, 14) + '-' + e.input_hash.slice(0, 8);
  e.status = status;
  e.note = note || '';
  return e;
}

export const sortEntries = (list) => [...list].sort((a, b) => ((b.saved_at || '') + (b.id || '')).localeCompare((a.saved_at || '') + (a.id || '')));

export function localLoad() {
  try {
    const s = localStorage.getItem(LS_ARCHIVE);
    if (!s) return [];
    const o = JSON.parse(s);
    return Array.isArray(o) ? o : Array.isArray(o.entries) ? o.entries : [];
  } catch (e) { return null; }
}
export function localWrite(entries) {
  localStorage.setItem(LS_ARCHIVE, JSON.stringify({ format: ARCHIVE_FORMAT, entries }));
}
// Оценки прежней программы (только просмотр): пересчитать их по новому скоркарду нельзя — другой набор данных
export function legacyLoad() {
  try {
    const s = localStorage.getItem(LS_LEGACY);
    if (!s) return [];
    const o = JSON.parse(s);
    const list = Array.isArray(o) ? o : Array.isArray(o.entries) ? o.entries : [];
    return list.filter((e) => e && typeof e === 'object').map((e) => ({ id: e.id, company: e.company_name, saved_at: e.saved_at, subsector_name: e.subsector_name,
      final_national: e.final_national, outlook_label: e.outlook_label, analyst: e.analyst, period: e.period_label, status: e.status, note: e.note }));
  } catch (e) { return []; }
}
export function upsert(list, entries) {
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const e of entries) byId.set(e.id, e);
  return sortEntries([...byId.values()]);
}

async function api(method, path, body) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (!r.ok) throw new Error('сервер ответил ' + r.status);
  return r.json();
}
export const serverList = () => api('GET', '/api/archive');
export const serverLegacy = () => api('GET', '/api/archive-legacy');
export const serverSave = (entries) => api('POST', '/api/archive', { entries });
export const serverDelete = (id) => api('DELETE', '/api/archive?id=' + encodeURIComponent(id));

function csvProcess(e) {
  const p = e.process && typeof e.process === 'object' ? e.process : {};
  const d = p.decision && typeof p.decision === 'object' ? p.decision : {};
  const n = docsOf(e.inputs).length;
  if (!d.status) return ['', '', '', '', '', '', n || ''];
  return [d.decision_label, d.protocol, d.date, d.final_national, d.outlook_label, deviationText(d.deviation), n || ''];
}

export function archiveCsv(entries) {
  const status = Object.fromEntries(cfg.archive_statuses.map((x) => [x.value, x.label]));
  const head = ['Дата сохранения', 'Компания', 'ИНН', 'Подсектор', 'Последний полный год', 'Аналитик', 'Дата оценки', 'Балл скоркарда',
    'Оценка по баллу', 'Корректировки, ступ.', 'Итоговая оценка', 'Итоговая (внутр.)', 'Прогноз', 'Результат расчёта', 'Статус', 'Комментарий',
    'Решение комитета', 'Протокол', 'Дата решения', 'Оценка комитета', 'Прогноз комитета', 'Отклонение от программы', 'Документов', 'Код расчёта'];
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csvNum = (x) => (isN(x) ? (Math.floor(x * 100 + 0.5 + 1e-9) / 100).toFixed(2).replace('.', ',') : '');
  const rows = [head.join(';')];
  for (const e of entries) {
    rows.push([(e.saved_at || '').slice(0, 19).replace('T', ' '), e.company, e.inn, e.subsector_name, e.report_year, e.analyst, e.eval_date, csvNum(e.agg),
      e.base_national, e.notches, e.final_national, e.final_internal, e.outlook_label, e.message || 'Оценка рассчитана', status[e.status] || e.status, e.note,
      ...csvProcess(e), e.result_hash].map(cell).join(';'));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
export function archiveJson(entries) {
  return JSON.stringify({ format: ARCHIVE_FORMAT, model: cfg.model_version, exported_at: new Date().toISOString(), entries }, null, 1);
}
export const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const aggText = (e) => (isN(e.agg) ? num(e.agg, 2) : '—');
