import React, { useMemo, useRef, useState } from 'react';
import { cfg } from './engine.js';
import { Icon } from './ui.jsx';
import { ratingTone } from './format.js';
import { shortDate, aggText } from './archive.js';
import { docsOf, processVerify } from './process.js';

const MANUAL = cfg.archive_statuses.filter((s) => s.manual);
const LABEL = Object.fromEntries(cfg.archive_statuses.map((s) => [s.value, s.label]));

export default function ArchiveView({ archive, legacy, localOnly, currentHash, onOpen, onReport, onReeval, onDelete, onStatus, onExportJson, onExportCsv, onExportZip, onImport, onMigrate, onBatchReports, onCommittee }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [showLegacy, setShowLegacy] = useState(false);
  const fileRef = useRef(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return archive.entries.filter((e) => (!st || e.status === st) && (!s || [e.company, e.inn, e.analyst, e.subsector_name, e.final_national, e.note].some((x) => (x || '').toLowerCase().includes(s))));
  }, [archive.entries, q, st]);
  const toggle = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = list.filter((e) => sel.has(e.id));
  return (
    <div className="archive">
      <div className="callout small">
        Архив хранит все сохранённые оценки: исходные данные, настройки и результат. Любую запись можно открыть, распечатать отчёт или начать по ней новую оценку. {archive.mode === 'server'
          ? <>Записи хранятся в файле <span className="mono">{archive.path}</span>, документы — в папке kyrgyz_rating_files рядом с ним (программа запущена через Python-сервер; Python перепроверяет каждую запись и протокол).</>
          : <>Записи и прикреплённые документы хранятся в этом браузере. Чтобы перенести архив с документами на другой компьютер, используйте «Скачать с документами (ZIP)» и «Загрузить JSON / ZIP»; для общего архива и папки документов запустите <span className="mono">python kg_agro_rating.py serve</span>.</>}
      </div>
      {archive.error && <div className="capnote bad">{archive.error}</div>}
      {localOnly.length > 0 && <div className="callout warn">В этом браузере есть {localOnly.length} записей, которых нет в файле архива. <button className="btn sm" onClick={onMigrate}>Перенести в файл</button></div>}
      <div className="toolbar">
        <div className="search"><Icon name="search" size={16} /><input placeholder="Поиск: компания, ИНН, аналитик, оценка" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="inp" style={{ width: 230 }} value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Все статусы</option>
          {cfg.archive_statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="btn sm" onClick={() => onBatchReports(chosen.length ? chosen : list)} disabled={!list.length}><Icon name="printer" size={14} />Отчёты для комитета ({chosen.length || list.length})</button>
        <button className="btn sm" onClick={onExportCsv}><Icon name="download" size={14} />Excel (CSV)</button>
        <button className="btn sm" onClick={onExportJson}><Icon name="download" size={14} />Скачать JSON</button>
        <button className="btn sm" onClick={onExportZip} title="Архив и все прикреплённые документы одним ZIP-файлом — для переноса на другой компьютер"><Icon name="clip" size={14} />Скачать с документами (ZIP)</button>
        <button className="btn sm" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="upload" size={14} />Загрузить JSON / ZIP</button>
        <input ref={fileRef} type="file" accept=".json,application/json,.zip,application/zip" style={{ display: 'none' }} onChange={(e) => { onImport(e); e.target.value = ''; }} />
      </div>
      {archive.entries.length === 0 ? (
        <div className="empty">Архив пуст. Введите данные компании и нажмите «Сохранить результат» вверху страницы.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl arch">
            <thead><tr><th /><th>Сохранено</th><th>Компания</th><th>Подсектор</th><th>Итоговая оценка</th><th className="r">Балл</th><th>Прогноз</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={e.input_hash === currentHash ? 'hl' : ''}>
                  <td><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} aria-label="выбрать" /></td>
                  <td className="nowrap small">{shortDate(e.saved_at)}{e.verified === true ? <span title="Python пересчитал запись — результат совпал"> ✓</span> : e.verified === false ? <span title="Python получил другой результат"> ⚠</span> : null}</td>
                  <td><b>{e.company || 'без названия'}</b>{e.inn ? <div className="small muted">ИНН {e.inn}</div> : null}<div className="small muted">{e.analyst || ''}{e.eval_date ? ' · ' + e.eval_date : ''}{e.input_hash === currentHash ? ' · открыта сейчас' : ''}</div>
                    {docsOf(e.inputs).length > 0 && <div className="small muted"><Icon name="clip" size={12} /> документов: {docsOf(e.inputs).length}</div>}</td>
                  <td className="small">{e.subsector === 'INT' ? 'Агрохолдинг' : e.subsector_name}</td>
                  <td>{e.final_national ? <span className={'tag t-' + ratingTone(e.final_index)}>{e.final_national}</span> : <span className="small muted">{e.message || '—'}</span>}</td>
                  <td className="r">{aggText(e)}</td>
                  <td className="small">{e.outlook_label || '—'}</td>
                  <td>{MANUAL.some((s) => s.value === e.status) && !(e.process && e.process.decision)
                    ? <select className="inp sm" value={e.status} onChange={(ev) => onStatus(e, ev.target.value)}>{MANUAL.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                    : <div className="small" title="Статус установлен решением комитета — меняется в разделе «Комитет и мониторинг»"><b>{LABEL[e.status] || e.status}</b>{e.process && e.process.decision ? <div className="muted">протокол № {e.process.decision.protocol} от {e.process.decision.date}</div> : null}</div>}
                    {processVerify(e)[0] === false && <div className="small" style={{ color: 'var(--danger)' }} title={processVerify(e)[1].join(' ')}>⚠ протокол не проходит перепроверку</div>}
                    {e.note ? <div className="small muted" title={e.note}>{e.note.slice(0, 60)}{e.note.length > 60 ? '…' : ''}</div> : null}</td>
                  <td className="nowrap">
                    <button className="btn sm" onClick={() => onOpen(e)} title="Открыть данные этой оценки">Открыть</button>
                    <button className="btn sm" onClick={() => onReport(e)} title="Отчёт для комитета">Отчёт</button>
                    <button className="btn sm" onClick={() => onReeval(e)} title="Новая оценка этой компании на основе сохранённых данных">Новая оценка</button>
                    <button className="btn sm" onClick={() => onCommittee(e)} title="Проверка вторым аналитиком, протокол комитета, отзыв">Комитет</button>
                    <button className="icon-btn" onClick={() => onDelete(e)} title="Удалить запись"><Icon name="trash" size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {legacy.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="card-h incard-h" onClick={() => setShowLegacy(!showLegacy)}><Icon name="history" /><h3>Оценки прежней версии программы ({legacy.length})</h3><span className="chev" style={{ marginLeft: 'auto' }}><Icon name="chev" /></span></button>
          {showLegacy && <div className="card-b">
            <div className="small muted" style={{ marginBottom: 8 }}>Эти оценки сделаны по прежнему скоркарду с качественными категориями. Они сохранены только для просмотра: пересчитать их по действующей методике нельзя, потому что набор данных другой. Для повторной оценки компании введите её данные заново.</div>
            <table className="tbl small"><thead><tr><th>Сохранено</th><th>Компания</th><th>Подсектор</th><th>Период</th><th>Оценка</th><th>Прогноз</th></tr></thead>
              <tbody>{legacy.map((e) => <tr key={e.id}><td>{shortDate(e.saved_at)}</td><td>{e.company}</td><td>{e.subsector_name}</td><td>{e.period}</td><td>{e.final_national || '—'}</td><td>{e.outlook_label || '—'}</td></tr>)}</tbody></table>
          </div>}
        </div>
      )}
    </div>
  );
}
