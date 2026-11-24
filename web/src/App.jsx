import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cfg, compute, inputContext, normalizeSettings, defaultSettings, settingsChanged, inputHash, rawStr, canonical } from './engine.js';
import { Icon, Menu, Modal, DocsContext, PeriodContext } from './ui.jsx';
import { periodInfo, nextYearInputs, syncPeriod } from './period.js';
import { num, isN, ratingTone, download } from './format.js';
import InputView from './InputView.jsx';
import ForecastView from './ForecastView.jsx';
import RulesView from './RulesView.jsx';
import ReportView, { reportsHtml } from './ReportView.jsx';
import ArchiveView from './ArchiveView.jsx';
import SettingsView from './SettingsView.jsx';
import SelfCheckView from './SelfCheckView.jsx';
import { DemoView, HelpView } from './GuideViews.jsx';
import ProcessView from './ProcessView.jsx';
import { setDocMode, putFile, putBytes, presentIds, openDoc, syncToServer, entryDocIds, docFiles } from './docstore.js';
import { docsOf, processVerify, expectedStatus, monitoring, todayIso } from './process.js';
import { makeZip, readZip } from './zip.js';
import { makeEntry, localLoad, localWrite, legacyLoad, upsert, serverList, serverLegacy, serverSave, serverDelete, archiveCsv, archiveJson, shortDate } from './archive.js';
import { subName } from './labels.js';
import { LOGO_URL } from './brand.js';

const LS_FORM = 'kyrgyz-rating-form-v2';
const LS_SETTINGS = 'kyrgyz-rating-settings-v2';
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const MANUAL = new Set(cfg.archive_statuses.filter((x) => x.manual).map((x) => x.value));
// Документы для сравнения «сохранено / изменено»: пустые списки не считаются
const docsKey = (d) => canonical(Object.fromEntries(Object.entries(d && typeof d === 'object' ? d : {}).filter(([, v]) => Array.isArray(v) && v.length)));
const fileSafe = (s) => (s || 'company').replace(/[^\wа-яёөүң\-]+/gi, '_');
const DOCS_DIR = 'документы/';
const INVENTORY = 'опись документов.csv';
// Записи из файла: сохраняем протокол и перепроверяем решение
function withProcess(e, x) {
  if (!x || !x.process || typeof x.process !== 'object') return e;
  const out = { ...e, process: x.process };
  const [ok, errs] = processVerify(out);
  if (ok !== null) { out.process_ok = ok; out.process_errors = errs; if (ok) out.status = expectedStatus(out); }
  return out;
}

function loadForm() {
  try { const s = localStorage.getItem(LS_FORM); if (s) { const o = JSON.parse(s); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } } catch (e) { /* */ }
  return null;
}
function loadSettings() {
  try { const s = localStorage.getItem(LS_SETTINGS); if (s) return normalizeSettings(JSON.parse(s))[0]; } catch (e) { /* */ }
  return defaultSettings();
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsMode, setSettingsMode] = useState('local');
  const [form, setForm] = useState(() => loadForm() || clone(cfg.demos[0].inputs));
  const [tab, setTab] = useState(() => (loadForm() === null ? 'help' : 'input'));
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('kg-theme') || 'light'; } catch (e) { return 'light'; } });
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [py, setPy] = useState({ status: 'off' });
  const [archive, setArchive] = useState(() => ({ mode: 'local', entries: localLoad() || [], path: null, error: null }));
  const [legacy, setLegacy] = useState(() => legacyLoad());
  const [localOnly, setLocalOnly] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [present, setPresent] = useState(null);
  const [docBusy, setDocBusy] = useState(null);
  const [docModeState, setDocModeState] = useState('local');
  const [focusId, setFocusId] = useState(null);
  const fileRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('kg-theme', theme); } catch (e) { /* */ } }, [theme]);
  useEffect(() => { try { localStorage.setItem(LS_FORM, JSON.stringify(form)); } catch (e) { /* */ } }, [form]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 6500); return () => clearTimeout(t); }, [toast]);

  const result = useMemo(() => compute(form, settings), [form, settings]);
  const ctx = useMemo(() => inputContext(form, settings), [form, settings]);
  // поля периода связаны: год → дата баланса 31.12 этого года; дата баланса → год (если год пуст)
  const set = useCallback((key, value) => setForm((f) => syncPeriod(f, key, value)), []);
  const period = useMemo(() => periodInfo(form), [form]);
  const setMany = useCallback((obj) => setForm((f) => ({ ...f, ...obj })), []);

  // ── Python-сервер (python kg_agro_rating.py serve): настройки, архив, сверка расчёта
  useEffect(() => {
    if (!/^https?:/.test(window.location.protocol)) { setPy({ status: 'file' }); return; }
    fetch('/api/health').then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
      setPy({ status: 'on', version: j.version });
      if (j.files) { setDocMode('server'); setDocModeState('server'); }
      fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).then((a) => {
        const srv = normalizeSettings(a.settings)[0];
        const loc = loadSettings();
        if (!settingsChanged(srv) && settingsChanged(loc)) {
          fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: loc }) });
          setSettings(loc);
        } else setSettings(srv);
        setSettingsMode('server');
      }).catch(() => {});
      serverList().then((a) => {
        setArchive({ mode: 'server', entries: a.entries, path: a.path, error: null });
        const local = localLoad() || [];
        const ids = new Set(a.entries.map((e) => e.id));
        setLocalOnly(local.filter((e) => !ids.has(e.id)));
      }).catch((err) => setArchive((s) => ({ ...s, error: 'не удалось прочитать архив на сервере: ' + err.message })));
      serverLegacy().then((a) => { if (a.entries && a.entries.length) setLegacy(a.entries); }).catch(() => {});
    }).catch(() => setPy({ status: 'off' }));
  }, []);
  const pyReady = ['on', 'match', 'diff', 'wait'].includes(py.status);
  useEffect(() => {
    if (!pyReady) return undefined;
    setPy((p) => ({ ...p, status: 'wait' }));
    const t = setTimeout(() => {
      fetch('/api/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: form, settings }) })
        .then((r) => r.json()).then((j) => setPy((p) => ({ ...p, status: j.result_hash === result.result_hash ? 'match' : 'diff', pyHash: j.result_hash, pyFinal: j.status === 'rated' ? j.rating.national : j.message })))
        .catch(() => setPy((p) => ({ ...p, status: 'off' })));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.result_hash, pyReady]);

  // ── Архив
  const stKey = canonical(settings);
  const savedEntry = archive.entries.find((e) => e.input_hash === result.input_hash && canonical(normalizeSettings(e.settings || null)[0]) === stKey) || null;
  const docsChanged = !!savedEntry && docsKey(savedEntry.inputs && savedEntry.inputs.docs) !== docsKey(form.docs);
  const saved = !!savedEntry && !docsChanged;
  const demoHashes = useMemo(() => new Set(cfg.demos.map((d) => inputHash(d.inputs))), []);
  const isDirty = docsChanged || (!savedEntry && !demoHashes.has(result.input_hash) && Object.keys(form).some((k) => rawStr(form[k]) !== '' || form[k] === true));

  // ── Документы-основания
  const docIds = useMemo(() => docsOf(form).map(([, m]) => m.id).sort().join(','), [form]);
  useEffect(() => {
    let alive = true;
    presentIds(docIds ? docIds.split(',') : []).then((x) => { if (alive) setPresent(x); });
    return () => { alive = false; };
  }, [docIds, docModeState]);
  const attachDocs = useCallback(async (key, files) => {
    setDocBusy(key);
    const metas = [], errs = [];
    for (const f of files) { try { metas.push(await putFile(f)); } catch (e) { errs.push(String((e && e.message) || e)); } }
    setDocBusy(null);
    const fill = metas.length && key !== '_general' && !rawStr(formRef.current[key]);
    if (metas.length) {
      setForm((f) => {
        const d = { ...(f.docs && typeof f.docs === 'object' ? f.docs : {}) };
        const lst = [...(Array.isArray(d[key]) ? d[key] : [])];
        for (const m of metas) if (!lst.some((x) => x.id === m.id)) lst.push(m);
        d[key] = lst;
        const nf = { ...f, docs: d };
        if (key !== '_general' && !rawStr(f[key])) nf[key] = metas[0].name.replace(/\.[^.]+$/, '');
        return nf;
      });
      setPresent((p) => { const n = new Set(p || []); metas.forEach((m) => n.add(m.id)); return n; });
    }
    if (errs.length) setToast(<span><b>Не прикреплено:</b> {errs.join('; ')}</span>);
    else if (metas.length) setToast(<span><b>Прикреплено:</b> {metas.map((m) => m.name).join(', ')}.{fill ? ' Поле «Источник» заполнено именем файла — уточните номер и дату документа.' : ''} Документы не меняют расчёт.</span>);
  }, []);
  const removeDoc = useCallback((key, id) => setForm((f) => {
    const d = { ...(f.docs && typeof f.docs === 'object' ? f.docs : {}) };
    const lst = (Array.isArray(d[key]) ? d[key] : []).filter((x) => x.id !== id);
    if (lst.length) d[key] = lst; else delete d[key];
    const nf = { ...f };
    if (Object.keys(d).length) nf.docs = d; else delete nf.docs;
    return nf;
  }), []);
  const openDocUi = useCallback((m) => { openDoc(m).catch((e) => setToast(<span><b>Ошибка:</b> {String((e && e.message) || e)}</span>)); }, []);
  const docsApi = useMemo(() => ({ docs: form.docs && typeof form.docs === 'object' ? form.docs : {}, present, busy: docBusy, attach: attachDocs, remove: removeDoc, open: openDocUi }),
    [form.docs, present, docBusy, attachDocs, removeDoc, openDocUi]);
  const mon = useMemo(() => monitoring(archive.entries, todayIso()), [archive.entries]);
  const commit = async (entries, okMsg) => {
    try {
      if (archive.mode === 'server') {
        const sync = await syncToServer(entries.flatMap(entryDocIds));
        if (sync.missing.length) setToast(<span><b>Внимание:</b> {sync.missing.length} файл(ов) документов нет ни в браузере, ни на сервере — откройте запись и прикрепите их заново.</span>);
        const a = await serverSave(entries);
        setArchive((s) => ({ ...s, entries: a.entries, error: null }));
        const bad = a.entries.filter((e) => a.saved.includes(e.id) && e.verified === false);
        if (bad.length) { setToast(<span><b>Внимание:</b> Python получил другой результат для {bad.length} записи(ей) — проверьте версию программы.</span>); return true; }
      } else {
        const next = upsert(localLoad() || archive.entries, entries);
        localWrite(next);
        setArchive((s) => ({ ...s, entries: next, error: null }));
      }
      if (okMsg) setToast(okMsg);
      return true;
    } catch (err) {
      setArchive((s) => ({ ...s, error: 'запись не сохранена: ' + (err && err.message ? err.message : err) + (archive.mode === 'local' ? ' (возможно, переполнено хранилище браузера — сделайте «Скачать JSON»)' : '') }));
      setToast(<span><b>Ошибка:</b> результат не сохранён. Подробности — во вкладке «Архив оценок».</span>);
      return false;
    }
  };
  const saveCurrent = async (status, note) => {
    let e = makeEntry(result, clone(form), clone(settings), status, note, savedEntry ? savedEntry.saved_at : null, savedEntry ? savedEntry.id : null);
    if (savedEntry && savedEntry.process) {
      const log = Array.isArray(savedEntry.process.log) ? savedEntry.process.log : [];
      e.process = docsChanged ? { ...savedEntry.process, log: [...log, { at: new Date().toISOString(), text: `Документы-основания обновлены (файлов: ${docsOf(form).length})` }] } : savedEntry.process;
      if (savedEntry.process.decision) e.status = savedEntry.status;
    }
    const ok = await commit([e], <span><b>{savedEntry ? 'Запись обновлена' : 'Результат сохранён в архив'}:</b> {e.company || 'без названия'} — {e.final_national || e.message}.{docsOf(form).length ? ` Документов: ${docsOf(form).length}.` : ''} Можно вводить следующую компанию.</span>);
    if (ok) setSaveOpen(false);
  };
  const guard = (action) => {
    if (!isDirty) { action(); return; }
    setConfirm({
      title: 'Текущий результат не сохранён',
      text: docsChanged ? <>Документы-основания по <b>{rawStr(form.company) || 'текущей компании'}</b> изменены, но запись в архиве ещё не обновлена. Сохранить изменения?</>
        : <>Расчёт по <b>{rawStr(form.company) || 'текущей компании'}</b> ({result.status === 'rated' ? result.rating.national : 'оценка не присвоена'}) ещё не сохранён в архив. Сохранить его перед продолжением?</>,
      actions: [
        { label: 'Сохранить и продолжить', kind: 'green', fn: async () => {
          let e = makeEntry(result, clone(form), clone(settings), savedEntry ? savedEntry.status : 'draft', savedEntry ? savedEntry.note : '', savedEntry ? savedEntry.saved_at : null, savedEntry ? savedEntry.id : null);
          if (savedEntry && savedEntry.process) e = { ...e, process: savedEntry.process };
          const ok = await commit([e], null); if (ok) action();
        } },
        { label: 'Продолжить без сохранения', kind: 'plain', fn: action },
      ],
    });
  };
  const reproduce = (e) => {
    const r = compute(e.inputs, e.settings || null);
    if (r.result_hash === e.result_hash) return <span className="small"> ✓ Результат воспроизведён (код совпадает).</span>;
    if (e.model !== cfg.model_version) return <span className="small"> Запись сделана по прежним правилам расчёта; сейчас: {r.status === 'rated' ? r.rating.national : r.message}.</span>;
    return <span className="small"> ⚠ Пересчёт отличается от сохранённого — проверьте запись.</span>;
  };
  const openEntry = (e, toTab = 'input') => guard(() => {
    setForm(clone(e.inputs));
    if (e.settings) setSettings(normalizeSettings(e.settings)[0]);
    setTab(toTab);
    setToast(<span><b>Открыто из архива:</b> {e.company || 'без названия'} от {shortDate(e.saved_at)}.{reproduce(e)}{e.settings && settingsChanged(normalizeSettings(e.settings)[0]) ? ' Применены настройки, с которыми сделана оценка.' : ''}</span>);
  });
  const reevalSame = (e) => {
    setForm({ ...clone(e.inputs), eval_date: today() });
    setTab('input');
    setToast(<span><b>Новая оценка за тот же отчётный год:</b> {e.company} на основе записи от {shortDate(e.saved_at)}. Обновите изменившиеся данные{docsOf(e.inputs).length ? ' и замените устаревшие документы' : ''} — прошлая запись в архиве не изменится.</span>);
  };
  // Следующий отчётный год: годы сдвигаются, таблица «по годам» переносится на столбец назад
  const toNextYear = (inputs, from) => {
    const { inputs: ny, error } = nextYearInputs(inputs, todayIso());
    if (error) { setToast(<span><b>Перенос невозможен:</b> {error}</span>); return; }
    setForm(ny);
    setTab('input');
    setToast(<span><b>Следующий отчётный год — {ny.report_year}.</b> {from} Таблица «по годам» сдвинута: столбец {ny.report_year} пуст для новой отчётности, {ny.report_year - 1}–{ny.report_year - 4} перенесены. Профиль, реестры насаждений, оборудования и реструктуризаций сохранены; остальные данные, источники и документы введите по документам нового года.</span>);
  };
  const reevalEntry = (e) => {
    const pi = periodInfo(e.inputs);
    if (pi.report_year === null) { guard(() => reevalSame(e)); return; }
    const ry = pi.report_year;
    setConfirm({
      title: 'Новая оценка: ' + (e.company || 'без названия'),
      text: <>За какой отчётный год делается новая оценка?
        <ul className="choice-list">
          <li><b>Тот же год ({ry})</b> — копируются все данные записи от {shortDate(e.saved_at)}, дата оценки — сегодня. Для пересмотра при новых событиях или документах.</li>
          <li><b>Следующий год ({ry + 1})</b> — последний полный год {ry + 1}, дата баланса {pi.next_bal ? pi.next_bal.slice(8, 10) + '.' + pi.next_bal.slice(5, 7) + '.' + pi.next_bal.slice(0, 4) : '—'}; таблица «по годам» сдвигается ({ry}–{ry - 3} становятся прошлыми годами), профиль и реестры сохраняются, остальное вводится по новой отчётности.</li>
        </ul>Прошлая запись в архиве не изменится.</>,
      actions: [
        { label: `Тот же год (${ry})`, kind: 'plain', fn: () => guard(() => reevalSame(e)) },
        { label: `Следующий год (${ry + 1})`, kind: 'green', fn: () => guard(() => toNextYear(e.inputs, `Новая оценка ${e.company || ''} на основе записи от ${shortDate(e.saved_at)}.`)) },
      ],
    });
  };
  const nextYearCurrent = () => {
    const ry = period.report_year;
    if (ry === null) return;
    setConfirm({
      title: `Перейти на ${ry + 1} год?`,
      text: <>Форма станет новой оценкой <b>{rawStr(form.company) || 'этой компании'}</b> за следующий отчётный год:
        <ul className="choice-list">
          <li>последний полный финансовый год — <b>{ry + 1}</b>, дата баланса — <b>{period.next_bal ? period.next_bal.slice(8, 10) + '.' + period.next_bal.slice(5, 7) + '.' + period.next_bal.slice(0, 4) : '—'}</b>, дата оценки — сегодня;</li>
          <li>таблица «по годам» сдвигается на столбец: данные {ry}–{ry - 3} становятся прошлыми годами, столбец {ry + 1} пуст;</li>
          <li>профиль компании и реестры (насаждения, оборудование, реструктуризации) остаются;</li>
          <li>остальные показатели, источники и документы очищаются — их нужно ввести по документам нового года.</li>
        </ul>{isDirty ? 'Текущий расчёт не сохранён — программа предложит сохранить его.' : 'Текущая запись в архиве не изменится.'}</>,
      actions: [{ label: `Перейти на ${ry + 1} год`, kind: 'green', fn: () => guard(() => toNextYear(form, '')) }],
    });
  };
  const removeEntry = (e) => setConfirm({
    title: 'Удалить запись из архива?',
    text: <>Оценка <b>{e.company || 'без названия'}</b> ({e.final_national || e.message}, сохранена {shortDate(e.saved_at)}) будет удалена без возможности восстановления. Сделайте «Скачать JSON», если нужна копия.</>,
    actions: [{ label: 'Удалить', kind: 'danger', fn: async () => {
      try {
        if (archive.mode === 'server') { const a = await serverDelete(e.id); setArchive((s) => ({ ...s, entries: a.entries })); }
        else { const next = (localLoad() || archive.entries).filter((x) => x.id !== e.id); localWrite(next); setArchive((s) => ({ ...s, entries: next })); }
        setToast(<span><b>Запись удалена:</b> {e.company}</span>);
      } catch (err) { setToast(<span><b>Ошибка удаления:</b> {String(err.message || err)}</span>); }
    } }],
  });
  const setEntryStatus = (e, status) => commit([{ ...e, status, updated_at: new Date().toISOString() }], null);
  // Файлы документов из ZIP (досье или архив): имя в хранилище = SHA-256, поэтому ссылки в данных совпадут
  const importZipDocs = async (files) => {
    let n = 0;
    for (const f of files) {
      if (!f.name.startsWith(DOCS_DIR) || f.name.split('/').pop() === INVENTORY) continue;
      await putBytes(f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength), f.name.split('/').pop());
      n += 1;
    }
    return n;
  };
  const importArchive = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      let text, ndocs = 0;
      if (/\.zip$/i.test(file.name)) {
        const files = await readZip(await file.arrayBuffer());
        const j = files.find((f) => f.name === 'архив.json');
        if (!j) throw new Error('в ZIP нет файла «архив.json»');
        text = new TextDecoder().decode(j.data);
        ndocs = await importZipDocs(files);
      } else text = await file.text();
      const o = JSON.parse(text);
      const list = Array.isArray(o) ? o : o.entries;
      if (!Array.isArray(list)) throw new Error('нет списка записей');
      const items = list.filter((x) => x && typeof x.inputs === 'object' && x.inputs !== null && !(x.model === undefined && x.model_version !== undefined)).map((x) => {
        const st = x.settings ? normalizeSettings(x.settings)[0] : defaultSettings();
        return withProcess(makeEntry(compute(x.inputs, st), x.inputs, st, x.status || 'draft', x.note || '', x.saved_at || null, x.id || null), x);
      });
      const skipped = list.length - items.length;
      await commit(items, <span><b>Загружено записей:</b> {items.length}{ndocs ? `, файлов документов: ${ndocs}` : ''}{skipped ? ` (пропущено ${skipped}: записи прежней версии программы)` : ''}</span>);
    } catch (err) { setToast(<span><b>Ошибка загрузки:</b> {String(err.message || err)}</span>); }
  };
  const migrateLocal = async () => { const ok = await commit(localOnly, <span><b>Перенесено в файл архива:</b> {localOnly.length}</span>); if (ok) setLocalOnly([]); };
  const batchReports = (entries) => {
    if (!entries.length) return;
    const items = entries.map((e) => ({ form: e.inputs, result: compute(e.inputs, e.settings || null), process: e.process || null }));
    download(`otchety_${new Date().toISOString().slice(0, 10)}_${entries.length}.html`, reportsHtml(items, `Отчёты для комитета (${entries.length})`), 'text/html');
    setToast(<span><b>Скачан пакет отчётов:</b> {entries.length}. Откройте файл и нажмите Ctrl+P, чтобы распечатать или сохранить в PDF.</span>);
  };
  const exportArchive = async (kind) => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'csv') download(`arhiv_ocenok_${stamp}.csv`, archiveCsv(archive.entries), 'text/csv');
    else if (kind === 'zip') {
      setToast(<span>Собираю архив с документами…</span>);
      const files = [{ name: 'архив.json', data: archiveJson(archive.entries) }];
      let missing = 0, count = 0;
      for (const e of archive.entries) {
        const pf = e.process && Array.isArray(e.process.files) ? e.process.files : [];
        if (!docsOf(e.inputs).length && !pf.length) continue;
        const prefix = `${DOCS_DIR}${fileSafe(e.company)} ${(e.saved_at || '').slice(0, 10)} ${String(e.id).slice(-8)}/`;
        const d = await docFiles(e.inputs, prefix, pf);
        files.push(...d.files, { name: prefix + INVENTORY, data: d.csv });
        missing += d.missing; count += d.count;
      }
      download(`arhiv_s_dokumentami_${stamp}.zip`, makeZip(files));
      setToast(<span><b>Скачан архив с документами:</b> записей {archive.entries.length}, файлов {count - missing}{missing ? `; не найдено файлов: ${missing}` : ''}.</span>);
    } else download(`arhiv_ocenok_${stamp}.json`, archiveJson(archive.entries));
  };
  // Досье компании: отчёт, данные, документы по разделам и опись
  const downloadDossier = async () => {
    const proc = savedEntry && savedEntry.process ? savedEntry.process : null;
    const pf = proc && Array.isArray(proc.files) ? proc.files : [];
    const d = await docFiles(form, DOCS_DIR, pf);
    const data = { format: 'kyrgyz-rating-dossier/1', model: cfg.model_version, saved_at: new Date().toISOString(), inputs: form, settings,
      input_hash: result.input_hash, result_hash: result.result_hash, process: proc };
    const files = [{ name: 'данные.json', data: JSON.stringify(data, null, 1) },
      { name: 'отчёт.html', data: reportsHtml([{ result, form, process: proc }], 'Отчёт — ' + (rawStr(form.company) || '')) }, ...d.files, { name: DOCS_DIR + INVENTORY, data: d.csv }];
    download(`dosie_${fileSafe(rawStr(form.company))}_${new Date().toISOString().slice(0, 10)}.zip`, makeZip(files));
    setToast(<span><b>Скачано досье:</b> отчёт, данные и {d.count - d.missing} файл(ов) документов{d.missing ? `; не найдено: ${d.missing}` : ''}.</span>);
  };

  // ── Настройки
  const persistSettings = async (next) => {
    setSettings(next);
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch (e) { /* */ }
    if (settingsMode === 'server') {
      try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: next }) }); }
      catch (e) { setToast(<span><b>Ошибка:</b> настройки не записаны в файл на сервере.</span>); }
    }
  };
  const applySettings = (next) => { persistSettings(next); setToast(<span><b>Настройки применены</b> ко всем новым расчётам. Сохранённые оценки пересчитываются по своим настройкам.</span>); };
  const resetSettings = () => setConfirm({
    title: 'Вернуть настройки методологии для всех подсекторов?', text: <>Изменённые веса и пороги всех подсекторов и рыночная ставка будут заменены значениями методологии. Оценки в архиве не изменятся.</>,
    actions: [{ label: 'Вернуть методологию', kind: 'danger', fn: () => { persistSettings(defaultSettings()); setToast(<span><b>Готово:</b> действуют настройки методологии.</span>); } }],
  });
  const exportSettings = () => download(`nastroiki_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'kyrgyz-rating-settings/3', exported_at: new Date().toISOString(), settings }, null, 1));
  const importSettings = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { const o = JSON.parse(rd.result); const [n, notes] = normalizeSettings(o.settings || o); persistSettings(n); setToast(<span><b>Настройки загружены.</b>{notes.length ? ' ' + notes.join(' ') : ''}</span>); }
      catch (err) { setToast(<span><b>Ошибка:</b> файл не похож на файл настроек.</span>); }
    };
    rd.readAsText(file);
  };

  // ── Файл, примеры, новая компания
  const loadDemo = (d) => guard(() => { setForm(clone(d.inputs)); setTab('input'); setToast(<span><b>Открыт пример:</b> {d.title}. Это вымышленная компания для обучения.</span>); });
  const newCompany = () => guard(() => {
    const keep = ['analyst', 'report_year', 'bal_date', 'fy_type', 'interim_months', 'key_rate', 'currency'];
    const nf = {};
    for (const k of keep) if (form[k] !== undefined) nf[k] = form[k];
    nf.eval_date = today();
    setForm(nf);
    setTab('input');
    setToast(<span><b>Новая компания.</b> Форма очищена; аналитик и отчётный период сохранены, дата оценки — сегодня. Прошлые результаты — во вкладке «Архив оценок».</span>);
  });
  const saveCase = () => download(`dannye_${(rawStr(form.company) || 'company').replace(/[^\wа-яёөүң\-]+/gi, '_')}.json`,
    JSON.stringify({ model: cfg.model_version, saved_at: new Date().toISOString(), inputs: form, settings, input_hash: result.input_hash, result_hash: result.result_hash }, null, 1));
  const openCase = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      let text, ndocs = 0;
      if (/\.zip$/i.test(file.name)) {
        const files = await readZip(await file.arrayBuffer());
        const j = files.find((f) => f.name === 'данные.json');
        if (!j) throw new Error('в ZIP нет файла «данные.json» — это не досье компании');
        text = new TextDecoder().decode(j.data);
        ndocs = await importZipDocs(files);
      } else text = await file.text();
      const o = JSON.parse(text);
      const inp = o.inputs && typeof o.inputs === 'object' ? o.inputs : o;
      guard(() => { setForm(inp); if (o.settings) setSettings(normalizeSettings(o.settings)[0]); setTab('input'); setToast(<span><b>Данные открыты:</b> {rawStr(inp.company) || file.name}{ndocs ? `; документов: ${ndocs}` : ''}</span>); });
    } catch (err) { setToast(<span><b>Ошибка:</b> {String((err && err.message) || 'файл не является файлом данных JSON')}</span>); }
  };

  const nav = [
    ['input', 'grid', 'Ввод данных'],
    ['forecast', 'trend', 'Прогноз и стресс'],
    ['report', 'file', 'Отчёт для комитета'],
    ['rules', 'book', 'Шкалы и правила'],
    ['archive', 'archive', 'Архив оценок'],
    ['committee', 'gavel', 'Комитет и мониторинг'],
    ['sep'],
    ['demo', 'school', 'Примеры для обучения'],
    ['settings', 'gear', 'Настройки'],
    ['check', 'shield', 'Самопроверка'],
    ['help', 'help', 'Как пользоваться'],
  ];
  const pyText = {
    file: ['ok', 'Расчёт в браузере', 'программа открыта как файл'],
    off: ['ok', 'Расчёт в браузере', 'Python-сервер не запущен'],
    on: ['ok', 'Python-движок подключён', 'сверка расчёта…'],
    wait: ['warn', 'Сверка с Python…', ''],
    match: ['ok', 'Python ↔ браузер: совпадает', 'код ' + (py.pyHash || '').slice(0, 10)],
    diff: ['bad', 'Python ↔ браузер: расхождение', 'Python: ' + (py.pyFinal || '—')],
  }[py.status] || ['warn', '', ''];
  const rated = result.status === 'rated';
  const changedSettings = settingsChanged(settings);

  return (
    <DocsContext.Provider value={docsApi}>
    <PeriodContext.Provider value={period}>
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><img src={LOGO_URL} alt="Kyrgyz Rating" /></div>
          <div className="brand-text"><b>Kyrgyz Rating</b><span>Кыргыз Рейтинг</span></div>
        </div>
        {nav.map(([k, ic, label]) => (k === 'sep' ? <div key="sep" className="nav-sep" /> :
          <button key={k} className={'nav-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)} title={label}>
            <Icon name={ic} /><span className="nav-label">{label}{k === 'archive' && archive.entries.length > 0 ? ` · ${archive.entries.length}` : ''}{k === 'settings' && changedSettings ? ' · изменены' : ''}</span>
            {k === 'committee' && mon.counts.overdue + mon.counts.soon > 0 && <span className={'nav-badge ' + (mon.counts.overdue ? 'bad' : 'mid')} title="Пересмотр просрочен или наступает в ближайшие 30 дней">{mon.counts.overdue + mon.counts.soon}</span>}
          </button>
        ))}
        <div className="nav-sep" />
        <button className="nav-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Тема"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /><span className="nav-label">{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span></button>
        <button className="nav-btn" onClick={() => setCollapsed(!collapsed)} title="Свернуть меню"><Icon name="menu" /><span className="nav-label">{collapsed ? 'Развернуть' : 'Свернуть меню'}</span></button>
        <div className="sidebar-foot">
          <div className="engine-chip" title={pyText[2]}><span className={'dot ' + pyText[0]} /><span className="txt"><b>{pyText[1]}</b><br />{pyText[2]}</span></div>
          <div className="engine-chip" title="Код текущего расчёта: одинаковые данные всегда дают одинаковый код"><span className="txt">Код расчёта: <span className="mono">{result.result_hash.slice(0, 10)}</span></span></div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <h1>{nav.find((n) => n[0] === tab)[2]}</h1>
            <div className="sub">{rawStr(form.company) || 'Компания не указана'} · {result.main ? (result.main === 'INT' ? '🏭 Агрохолдинг' : cfg.subsectors[result.main].icon + ' ' + subName(result.main)) : 'подсектор не выбран'} · {rawStr(form.report_year) ? 'отчётность за ' + rawStr(form.report_year) : 'год не указан'}{result.settings_changed ? ' · изменённые настройки подсектора' : ''}</div>
          </div>
          <div className="kpis">
            <div className="kpi"><div className="l">Балл</div><div className="v">{isN(result.agg) ? num(result.agg, 2) : '—'}</div></div>
            <div className="kpi kpi-sc" title="Оценка только по баллу, до корректировок"><div className="l">По баллу</div><div className="v">{result.rating_base ? result.rating_base.national : '—'}</div></div>
            <div className={'kpi hl t-' + (rated ? ratingTone(result.index) : 'none')} title={rated ? '' : result.message}><div className="l">Итоговая</div><div className="v">{rated ? result.rating.national : 'не присв.'}</div></div>
            <div className="kpi kpi-ol"><div className="l">Прогноз</div><div className="v" style={{ fontSize: 13, fontFamily: 'var(--font)', paddingTop: 3 }}>{rated ? result.outlook.label : '—'}</div></div>
          </div>
          <div className="actions no-print">
            {saved
              ? <button id="btn-save" className="btn" onClick={() => setSaveOpen(true)} title="Результат уже в архиве — изменить статус или комментарий"><Icon name="check" size={16} />В архиве</button>
              : savedEntry ? <button id="btn-save" className="btn green" onClick={() => setSaveOpen(true)} title="Документы изменены — обновить запись в архиве"><Icon name="save" size={16} />Сохранить документы</button>
              : <button id="btn-save" className="btn green" onClick={() => setSaveOpen(true)} title="Сохранить текущий результат в архив"><Icon name="save" size={16} />Сохранить результат</button>}
            <button id="btn-new" className="btn" onClick={newCompany} title="Очистить форму для следующей компании"><Icon name="plus" size={16} />Новая компания</button>
            <Menu label="Файл" icon="download">
              <button onClick={saveCase}>Сохранить данные (JSON)<small>все введённые данные и настройки</small></button>
              <button onClick={() => fileRef.current && fileRef.current.click()}>Открыть данные или досье<small>JSON из «Сохранить данные» или ZIP-досье с документами</small></button>
              <button onClick={downloadDossier}>Скачать досье (ZIP)<small>отчёт, данные, документы по разделам и опись</small></button>
              <button onClick={() => exportArchive('csv')}>Выгрузить архив в Excel (CSV)<small>все сохранённые оценки</small></button>
            </Menu>
            <input ref={fileRef} type="file" accept=".json,application/json,.zip,application/zip" style={{ display: 'none' }} onChange={openCase} />
          </div>
        </header>

        <div className="content">
          {tab === 'input' && <InputView form={form} set={set} setMany={setMany} result={result} ctx={ctx} settings={settings} onNextYear={nextYearCurrent} />}
          {tab === 'forecast' && <ForecastView form={form} set={set} result={result} ctx={ctx} />}
          {tab === 'report' && <ReportView result={result} form={form} onSave={() => setSaveOpen(true)} savedEntry={savedEntry} saved={saved} onDossier={downloadDossier} />}
          {tab === 'rules' && <RulesView settings={settings} ctx={ctx} />}
          {tab === 'archive' && <ArchiveView archive={archive} legacy={legacy} localOnly={localOnly} currentHash={result.input_hash}
            onOpen={(e) => openEntry(e)} onReport={(e) => openEntry(e, 'report')} onReeval={reevalEntry} onDelete={removeEntry} onStatus={setEntryStatus}
            onExportJson={() => exportArchive('json')} onExportCsv={() => exportArchive('csv')} onExportZip={() => exportArchive('zip')} onImport={importArchive} onMigrate={migrateLocal} onBatchReports={batchReports}
            onCommittee={(e) => { setFocusId(e.id); setTab('committee'); }} />}
          {tab === 'committee' && <ProcessView entries={archive.entries} onCommit={commit} onOpen={(e) => openEntry(e)} onReport={(e) => openEntry(e, 'report')} onReeval={reevalEntry}
            focusId={focusId} setFocusId={setFocusId} setToast={setToast} />}
          {tab === 'settings' && <SettingsView settings={settings} mode={settingsMode} onApply={applySettings} onReset={resetSettings} onExport={exportSettings} onImport={importSettings} currentSub={ctx.sub_selected || ctx.main || 'DAI'} ctx={ctx} />}
          {tab === 'check' && <SelfCheckView py={py} result={result} />}
          {tab === 'help' && <HelpView onGo={setTab} />}
          {tab === 'demo' && <DemoView settings={settings} onLoad={loadDemo} />}
        </div>
      </div>
      {saveOpen && <SaveModal result={result} form={form} savedEntry={savedEntry} docsChanged={docsChanged} archive={archive} onClose={() => setSaveOpen(false)} onSave={saveCurrent} onCommittee={() => { setSaveOpen(false); if (savedEntry) setFocusId(savedEntry.id); setTab('committee'); }} />}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          actions={<><button className="btn" onClick={() => setConfirm(null)}>Отмена</button>
            {confirm.actions.map((a) => <button key={a.label} className={'btn ' + (a.kind === 'green' ? 'green' : a.kind === 'danger' ? 'danger' : '')} onClick={async () => { setConfirm(null); await a.fn(); }}>{a.label}</button>)}</>}>
          <div style={{ fontSize: 13.5 }}>{confirm.text}</div>
        </Modal>
      )}
      {toast && <div className="toast" role="status"><Icon name="spark" />{toast}</div>}
    </div>
    </PeriodContext.Provider>
    </DocsContext.Provider>
  );
}

function SaveModal({ result, form, savedEntry, docsChanged, archive, onClose, onSave, onCommittee }) {
  const decided = !!(savedEntry && savedEntry.process && savedEntry.process.decision);
  const opts = cfg.archive_statuses.filter((s) => s.manual || (savedEntry && s.value === savedEntry.status));
  const [status, setStatus] = useState(savedEntry ? savedEntry.status : 'draft');
  const [note, setNote] = useState(savedEntry ? savedEntry.note : '');
  const rated = result.status === 'rated';
  const nd = docsOf(form).length;
  const label = Object.fromEntries(cfg.archive_statuses.map((s) => [s.value, s.label]));
  return (
    <Modal title={savedEntry ? (docsChanged ? 'Обновить запись: документы изменены' : 'Запись в архиве') : 'Сохранить результат в архив'} onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>Отмена</button><button id="btn-save-confirm" className="btn green" onClick={() => onSave(decided ? savedEntry.status : status, note)}><Icon name="save" size={16} />{savedEntry ? 'Обновить запись' : 'Сохранить'}</button></>}>
      <div className="save-sum">
        <div><span>Компания</span><b>{rawStr(form.company) || 'без названия'}</b></div>
        <div><span>Подсектор</span><b>{subName(result.main)}</b></div>
        <div><span>Итоговая оценка</span><b>{rated ? `${result.rating.national} (${result.rating.internal})` : result.message}</b></div>
        <div><span>Балл</span><b>{isN(result.agg) ? num(result.agg, 2) : '—'}</b></div>
        {rated && <div><span>Прогноз</span><b>{result.outlook.label}</b></div>}
        <div><span>Документы-основания</span><b>{nd ? `${nd} файл(ов)` : 'не прикреплены'}</b></div>
      </div>
      {decided ? (
        <div className="callout small">Статус: <b>{label[savedEntry.status]}</b> — установлен решением комитета (протокол № {savedEntry.process.decision.protocol}) и здесь не меняется. {docsChanged ? 'Обновятся только документы-основания; запись об этом попадёт в журнал протокола.' : ''}</div>
      ) : (
        <label className="field"><span className="lbl">Статус</span>
          <select id="save-status" className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>{opts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      )}
      <label className="field"><span className="lbl">Комментарий</span><textarea id="save-note" className="inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: что уточнено в данных" /></label>
      <div className="small muted">Сохраняются все данные, настройки, список документов и результат. {archive.mode === 'server' ? 'Запись и файлы документов попадут в папку архива на сервере.' : 'Запись и документы хранятся в этом браузере; для переноса — «Архив оценок» → «Скачать с документами (ZIP)».'}
        {' '}Проверка вторым аналитиком и решение комитета оформляются в разделе <button type="button" className="linklike" onClick={onCommittee}>«Комитет и мониторинг»</button>.</div>
    </Modal>
  );
}
