// Хранилище документов-оснований. Имя файла в хранилище = SHA-256 его содержимого: одинаковые файлы хранятся
// один раз, а подмена файла обнаруживается. Режим «браузер» — IndexedDB этого браузера; режим «сервер» —
// папка kyrgyz_rating_files рядом с архивом (python kg_agro_rating.py serve), копия остаётся и в браузере.
import { cfg, sha256BytesHex, rawStr } from './engine.js';
import { DOC_ID_RE, docsOf, docFieldLabel, todayRu } from './process.js';
import { makeZip } from './zip.js';

const DB = 'kyrgyz-rating-docs';
const STORE = 'files';
export const MAX_BYTES = cfg.docs_cfg.max_mb * 1024 * 1024;
let mode = 'local';
export const setDocMode = (m) => { mode = m; };
export const docMode = () => mode;

let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('хранилище документов браузера недоступно')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('хранилище документов браузера недоступно'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbPut(rec) { const db = await idb(); return req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec)); }
async function idbGet(id) { try { const db = await idb(); return await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(id)); } catch (e) { return undefined; } }
async function idbKeys() { try { const db = await idb(); return new Set(await req(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys())); } catch (e) { return new Set(); } }

export async function hashBytes(buf) {
  try {
    if (globalThis.crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* запасной вариант ниже */ }
  return sha256BytesHex(new Uint8Array(buf));
}

const EXT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', csv: 'text/csv' };
export const guessType = (name) => EXT_TYPES[(/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase()] || 'application/octet-stream';

async function serverPut(id, buf) {
  const r = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Id': id }, body: buf });
  if (!r.ok) { let m = 'сервер ответил ' + r.status; try { m = (await r.json()).error || m; } catch (e) { /* */ } throw new Error(m); }
}

// Сохраняет файл и возвращает его описание для данных оценки
export async function putBytes(buf, name, type) {
  if (buf.byteLength > MAX_BYTES) throw new Error(`«${name}» больше ${cfg.docs_cfg.max_mb} МБ`);
  const id = await hashBytes(buf);
  const t = type || guessType(name);
  const meta = { id, name, type: t, size: buf.byteLength, added: todayRu() };
  let saved = false;
  let err = null;
  try { await idbPut({ id, name, type: t, size: buf.byteLength, blob: new Blob([buf], { type: t }) }); saved = true; } catch (e) { err = e; }
  if (mode === 'server') {
    try { await serverPut(id, buf); saved = true; } catch (e) { err = e; }
  }
  if (!saved) throw err || new Error('файл не сохранён');
  return meta;
}
export async function putFile(file) {
  if (file.size > MAX_BYTES) throw new Error(`«${file.name}» больше ${cfg.docs_cfg.max_mb} МБ`);
  return putBytes(await file.arrayBuffer(), file.name, file.type || guessType(file.name));
}

export async function getBlob(meta) {
  if (mode === 'server') {
    try {
      const r = await fetch(`/api/files/${meta.id}`, { cache: 'no-store' });
      if (r.ok) return await r.blob();
    } catch (e) { /* пробуем копию в браузере */ }
  }
  const rec = await idbGet(meta.id);
  return rec && rec.blob ? rec.blob : null;
}

// Какие файлы из списка есть в хранилище
export async function presentIds(ids) {
  const want = [...new Set(ids.filter((x) => DOC_ID_RE.test(x)))];
  const out = new Set();
  if (!want.length) return out;
  const local = await idbKeys();
  for (const id of want) if (local.has(id)) out.add(id);
  if (mode === 'server') {
    try {
      for (let i = 0; i < want.length; i += 100) {
        const r = await fetch('/api/files?ids=' + want.slice(i, i + 100).join(','), { cache: 'no-store' });
        if (r.ok) for (const id of (await r.json()).present || []) out.add(id);
      }
    } catch (e) { /* */ }
  }
  return out;
}

// Перед записью в общий архив на сервере докладывает туда файлы, которые есть только в этом браузере
export async function syncToServer(ids) {
  if (mode !== 'server') return { uploaded: 0, missing: [] };
  const want = [...new Set(ids.filter((x) => DOC_ID_RE.test(x)))];
  if (!want.length) return { uploaded: 0, missing: [] };
  const r = await fetch('/api/files?ids=' + want.join(','), { cache: 'no-store' });
  const on = new Set(r.ok ? (await r.json()).present || [] : []);
  let uploaded = 0;
  const missing = [];
  for (const id of want) {
    if (on.has(id)) continue;
    const rec = await idbGet(id);
    if (!rec || !rec.blob) { missing.push(id); continue; }
    await serverPut(id, await rec.blob.arrayBuffer());
    uploaded += 1;
  }
  return { uploaded, missing };
}

// Открыть: PDF, изображения и текст — в новой вкладке; остальные типы скачиваются (их нельзя безопасно показать)
export async function openDoc(meta) {
  const inline = cfg.docs_cfg.inline_types.includes(meta.type);
  const win = inline ? window.open('', '_blank') : null;
  const blob = await getBlob(meta);
  if (!blob) { if (win) win.close(); throw new Error(`файл «${meta.name}» не найден в хранилище документов`); }
  const url = URL.createObjectURL(new Blob([blob], { type: inline ? meta.type : 'application/octet-stream' }));
  if (win) win.location.href = url;
  else {
    const a = document.createElement('a');
    a.href = url; a.download = meta.name || 'document';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function entryDocIds(e) {
  const ids = docsOf(e.inputs).map(([, m]) => m.id);
  const pf = e.process && Array.isArray(e.process.files) ? e.process.files : [];
  for (const m of pf) if (m && DOC_ID_RE.test(m.id || '')) ids.push(m.id);
  return ids;
}

export const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');
const safeName = (s) => (rawStr(s) || 'файл').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120);
function uniq(used, path) {
  if (!used.has(path)) { used.add(path); return path; }
  const m = /^(.*?)(\.[^./]*)?$/.exec(path);
  for (let i = 2; ; i++) { const p = `${m[1]} (${i})${m[2] || ''}`; if (!used.has(p)) { used.add(p); return p; } }
}

// Файлы документов для ZIP: папки по разделам методологии + опись
export async function docFiles(inputs, prefix = 'документы/', extra = []) {
  const groups = [];
  const seen = new Map();
  for (const [k, m] of docsOf(inputs)) {
    const g = docFieldLabel(k);
    if (!seen.has(g)) { seen.set(g, groups.length); groups.push([g, []]); }
    groups[seen.get(g)][1].push([k, m]);
  }
  if (extra.length) groups.push(['Протокол комитета', extra.map((m) => ['_protocol', m])]);
  const used = new Set();
  const files = [];
  const rows = [['Раздел', 'Источник (текст в данных)', 'Файл', 'Размер', 'Добавлен', 'SHA-256', 'Наличие']];
  let missing = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const [g, list] = groups[gi];
    const folder = prefix + String(gi + 1).padStart(2, '0') + ' ' + safeName(g) + '/';
    for (const [k, m] of list) {
      const blob = await getBlob(m);
      const path = uniq(used, folder + safeName(m.name));
      if (blob) files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
      else missing += 1;
      rows.push([g, k.startsWith('_') ? '' : rawStr(inputs[k]), path.slice(prefix.length), fmtSize(m.size || 0), m.added || '', m.id, blob ? 'есть' : 'файл не найден']);
    }
  }
  const csv = '﻿' + rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n') + '\r\n';
  return { files, csv, missing, count: rows.length - 1 };
}

export { makeZip };
