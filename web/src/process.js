// Жизненный цикл оценки: проверка вторым аналитиком, протокол комитета, рейтинговые действия, мониторинг.
// Построчный порт раздела 15 kg_agro_rating.py; совпадение проверяет tools/process_parity.py.
import { cfg, rawStr, canonical } from './engine.js';

const C = cfg.committee;
const RS = cfg.rating_scale;
const OUT = cfg.outlooks;
const DECISION_STATUS = Object.fromEntries(C.decisions.map((d) => [d.value, d.status]));
const DECISION_LABEL = Object.fromEntries(C.decisions.map((d) => [d.value, d.label]));
const ACTION_LABEL = Object.fromEntries(C.actions.map((a) => [a.value, a.label]));
const REVIEW_LABEL = Object.fromEntries(C.review_states.map((a) => [a.value, a.label]));
export const WORK_STATUSES = ['draft', 'check', 'committee'];
export const DOC_ID_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const len = (s) => Array.from(s).length;
const p2 = (n) => String(n).padStart(2, '0');
const p4 = (n) => String(n).padStart(4, '0');

export function mdays(y, m) {
  if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}
export function dateIso(s) {
  const m = DATE_RE.exec(rawStr(s));
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > mdays(y, mo)) return null;
  return `${p4(y)}-${p2(mo)}-${p2(d)}`;
}
export const isoRu = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const ymd = (iso) => [parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10), parseInt(iso.slice(8, 10), 10)];
export function addMonths(iso, n) {
  const [y, m, d] = ymd(iso);
  const t = y * 12 + (m - 1) + n;
  const y2 = Math.floor(t / 12), m2 = (t % 12) + 1;
  return `${p4(y2)}-${p2(m2)}-${p2(Math.min(d, mdays(y2, m2)))}`;
}
const dayNo = (iso) => { const [y, m, d] = ymd(iso); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export function addDays(iso, n) { return new Date((dayNo(iso) + n) * 86400000).toISOString().slice(0, 10); }
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);
export const todayIso = () => { const d = new Date(); return `${p4(d.getFullYear())}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const todayRu = () => isoRu(todayIso());

export const personKey = (s) => rawStr(s).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).join(' ');
const D = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const isInt = (x) => typeof x === 'number' && Number.isInteger(x);

export function deviationText(dv) {
  if (!isInt(dv)) return '';
  if (dv === 0) return 'нет';
  return (dv > 0 ? 'ниже на ' : 'выше на ') + Math.abs(dv) + ' ступ.';
}

export function committeeCheck(entry, process) {
  const p = D(process);
  const chk = D(p.check);
  const com = D(p.committee);
  const eChk = [], eCom = [], warns = [];
  const preparer = personKey(entry.analyst);
  const evalIso = dateIso(entry.eval_date);
  // 1. Проверка вторым аналитиком
  const by = personKey(chk.by);
  if (!preparer) eChk.push('В данных оценки не указан аналитик, подготовивший оценку (поле «Аналитик» в профиле).');
  if (!by) eChk.push('Не указан проверяющий — второй аналитик.');
  else if (by === preparer) eChk.push('Проверяющий совпадает с аналитиком, подготовившим оценку: проверку проводит другой сотрудник.');
  const chkIso = dateIso(chk.date);
  if (!chkIso) eChk.push('Дата проверки: укажите в формате ДД.ММ.ГГГГ.');
  else if (evalIso && chkIso < evalIso) eChk.push('Дата проверки раньше даты оценки.');
  const res = rawStr(chk.result);
  if (res !== 'ok' && res !== 'remarks') eChk.push('Укажите результат проверки.');
  else if (res === 'remarks' && len(rawStr(chk.comment)) < C.min_reason) eChk.push(`Опишите замечания проверяющего (не короче ${C.min_reason} знаков).`);
  const checkOk = eChk.length === 0 && res === 'ok';
  // 2. Заседание комитета
  if (!checkOk) eCom.push('Комитет рассматривает оценку только после проверки вторым аналитиком без замечаний.');
  const number = rawStr(com.number);
  if (!number) eCom.push('Не указан номер протокола.');
  const comIso = dateIso(com.date);
  if (!comIso) eCom.push('Дата заседания: укажите в формате ДД.ММ.ГГГГ.');
  else if (chkIso && comIso < chkIso) eCom.push('Дата заседания раньше даты проверки вторым аналитиком.');
  const members = Array.isArray(com.members) ? com.members : [];
  const seen = new Set();
  const chairs = [];
  let nVoting = 0, nConf = 0;
  const votes = { for: 0, against: 0, abstain: 0 };
  members.forEach((m0, i) => {
    const m = D(m0);
    const nm = personKey(m.name);
    const disp = rawStr(m.name);
    if (!nm) { eCom.push(`Состав комитета, строка ${i + 1}: не указано ФИО.`); return; }
    if (seen.has(nm)) { eCom.push(`${disp} указан(а) в составе дважды.`); return; }
    seen.add(nm);
    const conflict = m.conflict === true;
    if (rawStr(m.role) === 'chair') chairs.push([disp, conflict, nm]);
    if (preparer && nm === preparer) { eCom.push(`${disp} подготовил(а) оценку: докладчик не голосует и не входит в состав комитета.`); return; }
    if (conflict) { nConf += 1; return; }
    nVoting += 1;
    const v = rawStr(m.vote);
    if (!has(votes, v)) { eCom.push(`${disp}: не указан голос.`); return; }
    votes[v] += 1;
  });
  if (chairs.length !== 1) eCom.push(`В составе должен быть ровно один председатель (сейчас: ${chairs.length}).`);
  else if (chairs[0][1]) eCom.push('Председатель заявил конфликт интересов — заседание ведёт другой член комитета.');
  if (nVoting < C.quorum) eCom.push(`Нет кворума: голосуют ${nVoting}, нужно не меньше ${C.quorum} (члены с конфликтом интересов не голосуют).`);
  const dec = rawStr(com.decision);
  const rated = entry.calc_status === 'rated' && isInt(entry.final_index);
  const modelIndex = rated ? entry.final_index : null;
  const modelOutlook = rated ? rawStr(entry.outlook_code) : null;
  const ri = com.rating_index;
  const oc = rawStr(com.outlook);
  const rationale = rawStr(com.rationale);
  if (!has(DECISION_STATUS, dec)) eCom.push('Выберите решение комитета.');
  else if (DECISION_STATUS[dec] === 'approved') {
    if (!rated) eCom.push(`Программа не присвоила оценку (${rawStr(entry.message) || 'нет результата'}): комитет может только вернуть оценку на доработку или отклонить.`);
    else if (dec === 'approve_dev') {
      const okRi = isInt(ri) && ri >= 0 && ri < RS.length;
      if (!okRi) eCom.push('Выберите оценку, которую утверждает комитет.');
      if (!has(OUT, oc)) eCom.push('Выберите прогноз, который утверждает комитет.');
      if (okRi && has(OUT, oc) && ri === modelIndex && oc === modelOutlook) eCom.push(`Оценка и прогноз совпадают с программой — выберите «${DECISION_LABEL.approve}».`);
      if (len(rationale) < C.min_rationale) eCom.push(`Обоснование отклонения от программы — не короче ${C.min_rationale} знаков.`);
    }
  } else if (len(rationale) < C.min_reason) eCom.push(`Укажите причину решения (не короче ${C.min_reason} знаков).`);
  if (has(DECISION_STATUS, dec) && nVoting >= C.quorum && votes.for * 2 <= nVoting) eCom.push(`Решение не принято: «за» ${votes.for} из ${nVoting} голосующих — нужно больше половины.`);
  let decision = null;
  if (!eChk.length && !eCom.length) {
    const st = DECISION_STATUS[dec];
    decision = {
      decision: dec, decision_label: DECISION_LABEL[dec], status: st, protocol: number,
      date: isoRu(comIso), date_iso: comIso, check_by: rawStr(chk.by), check_date: isoRu(chkIso),
      votes_for: votes.for, votes_against: votes.against, votes_abstain: votes.abstain,
      voting: nVoting, conflicts: nConf, chair: chairs[0][0],
      model_index: modelIndex, model_national: rated ? entry.final_national : null, model_outlook: modelOutlook,
      final_index: null, final_national: null, final_internal: null, outlook_code: null, outlook_label: null,
      deviation: null, rationale,
    };
    if (st === 'approved') {
      const fi = dec === 'approve' ? modelIndex : ri;
      const fo = dec === 'approve' ? modelOutlook : oc;
      Object.assign(decision, { final_index: fi, final_national: RS[fi].national, final_internal: RS[fi].internal, outlook_code: fo, outlook_label: OUT[fo].label, deviation: fi - modelIndex });
      const dv = fi - modelIndex;
      if (dv !== 0) warns.push(`Решение комитета отличается от оценки программы на ${Math.abs(dv)} ступ. (${RS[modelIndex].national} → ${RS[fi].national})${Math.abs(dv) > C.big_deviation ? ' — значительное отклонение' : ''}.`);
      else if (fo !== modelOutlook) warns.push(`Комитет изменил прогноз программы: ${OUT[modelOutlook].label} → ${OUT[fo].label}.`);
    }
  }
  return { errors_check: eChk, errors_committee: eCom, warnings: warns, check_ok: checkOk, votes, voting: nVoting, conflicts: nConf, decision };
}

export function withdrawalCheck(entry, process) {
  const p = D(process);
  const d = D(p.decision);
  const w = D(p.withdrawal);
  const errs = [];
  if (d.status !== 'approved') errs.push('Отозвать можно только оценку, утверждённую комитетом.');
  const wIso = dateIso(w.date);
  if (!wIso) errs.push('Дата отзыва: укажите в формате ДД.ММ.ГГГГ.');
  else if (d.date_iso && wIso < d.date_iso) errs.push('Дата отзыва раньше даты решения комитета.');
  if (len(rawStr(w.reason)) < C.min_reason) errs.push(`Укажите причину отзыва (не короче ${C.min_reason} знаков).`);
  if (!personKey(w.by)) errs.push('Укажите, кто оформил отзыв.');
  return errs;
}

export function processVerify(e) {
  const p = e.process;
  if (!p || typeof p !== 'object' || !p.decision || typeof p.decision !== 'object') return [null, []];
  const r = committeeCheck(e, p);
  const errs = [...r.errors_check, ...r.errors_committee];
  if (!errs.length && canonical(r.decision) !== canonical(p.decision)) errs.push('Сохранённое решение не совпадает с протоколом.');
  if (p.withdrawal && typeof p.withdrawal === 'object' && !Array.isArray(p.withdrawal)) errs.push(...withdrawalCheck(e, p));
  return [errs.length === 0, errs];
}

export function expectedStatus(e) {
  const p = D(e.process);
  const d = D(p.decision);
  if (!d.status) return null;
  return p.withdrawal && typeof p.withdrawal === 'object' && !Array.isArray(p.withdrawal) ? 'withdrawn' : d.status;
}

export const companyKey = (e) => { const inn = rawStr(e.inn).split(/\s+/).join(''); return inn ? 'inn:' + inn : 'name:' + personKey(e.company); };

function approvedDecision(e) {
  const d = D(D(e.process).decision);
  return d.status === 'approved' && dateIso(d.date) && isInt(d.final_index) ? d : null;
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function ratingEvents(entries) {
  const ev = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const d = approvedDecision(e);
    if (!d) continue;
    const p = e.process;
    const eid = rawStr(e.id);
    ev.push([dateIso(d.date), 0, rawStr(p.finalized_at), eid, 'decision', e]);
    const w = p.withdrawal;
    if (w && typeof w === 'object' && !Array.isArray(w) && dateIso(w.date)) ev.push([dateIso(w.date), 1, rawStr(w.at), eid, 'withdraw', e]);
  }
  ev.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]) || cmp(a[3], b[3]));
  return ev;
}
function action(code, key, e, iso, prev, state, reason = null) {
  return {
    key, company: rawStr(e.company), inn: rawStr(e.inn), entry_id: rawStr(e.id), date: isoRu(iso), date_iso: iso, action: code, action_label: ACTION_LABEL[code],
    prev_national: prev ? prev.national : null, prev_outlook: prev ? prev.outlook_label : null,
    national: state ? state.national : null, outlook: state ? state.outlook_label : null,
    protocol: state ? state.protocol : null, deviation: state ? state.deviation : null, reason,
  };
}

export function ratingActions(entries) {
  const cur = {};
  const out = [];
  for (const [iso, , , eid, kind, e] of ratingEvents(entries)) {
    const key = companyKey(e);
    const prev = has(cur, key) ? cur[key] : null;
    const d = e.process.decision;
    if (kind === 'decision') {
      const fi = d.final_index, oc = d.outlook_code ?? null;
      let code;
      if (prev === null) code = 'assigned';
      else if (fi < prev.index) code = 'upgraded';
      else if (fi > prev.index) code = 'downgraded';
      else if (oc !== prev.outlook_code) code = oc === 'REVIEW' ? 'review' : 'outlook';
      else code = 'affirmed';
      const state = {
        entry_id: eid, index: fi, national: d.final_national ?? null, internal: d.final_internal ?? null,
        outlook_code: oc, outlook_label: d.outlook_label ?? null, date: isoRu(iso), date_iso: iso,
        protocol: rawStr(d.protocol), deviation: d.deviation ?? null,
        company: rawStr(e.company), inn: rawStr(e.inn), report_year: rawStr(e.report_year),
      };
      out.push(action(code, key, e, iso, prev, state));
      cur[key] = state;
    } else if (prev !== null && prev.entry_id === eid) {
      out.push(action('withdrawn', key, e, iso, prev, null, rawStr(e.process.withdrawal.reason)));
      cur[key] = null;
    }
  }
  return [out, cur];
}

export function reviewDue(state) {
  if (state.outlook_code === 'REVIEW') return addDays(state.date_iso, C.watch_review_days);
  return addMonths(state.date_iso, C.review_months);
}

export function monitoring(entries, today) {
  const [actions, cur] = ratingActions(entries);
  const inWork = {};
  for (const e of entries) {
    if (e && typeof e === 'object' && WORK_STATUSES.includes(e.status)) { const k = companyKey(e); inWork[k] = (inWork[k] || 0) + 1; }
  }
  const active = [], withdrawn = [];
  for (const key of Object.keys(cur).sort(cmp)) {
    const st = cur[key];
    if (st === null) {
      const last = actions.filter((a) => a.key === key).slice(-1)[0];
      withdrawn.push({ key, company: last.company, inn: last.inn, date: last.date, date_iso: last.date_iso, reason: last.reason, prev_national: last.prev_national, in_work: inWork[key] || 0 });
      continue;
    }
    const nxt = reviewDue(st);
    const left = daysBetween(today, nxt);
    const state = left < 0 ? 'overdue' : left <= C.soon_days ? 'soon' : 'ok';
    active.push({
      ...st, key, next_review_iso: nxt, next_review: isoRu(nxt), days_left: left, review_state: state, review_label: REVIEW_LABEL[state], in_work: inWork[key] || 0,
      review_basis: st.outlook_code === 'REVIEW' ? `прогноз «На пересмотре»: не позднее ${C.watch_review_days} дней` : `плановый пересмотр через ${C.review_months} месяцев`,
    });
  }
  active.sort((a, b) => cmp(a.next_review_iso, b.next_review_iso) || cmp(a.company, b.company) || cmp(a.key, b.key));
  withdrawn.sort((a, b) => cmp(b.date_iso, a.date_iso) || cmp(b.key, a.key));
  const counts = { active: active.length, overdue: active.filter((a) => a.review_state === 'overdue').length, soon: active.filter((a) => a.review_state === 'soon').length, withdrawn: withdrawn.length };
  return { today, active, withdrawn, actions, counts };
}

// ── Документы-основания: список (поле, описание файла) из inputs.docs
export function docsOf(inputs) {
  const d = inputs && typeof inputs === 'object' ? inputs.docs : null;
  const out = [];
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    for (const k of Object.keys(d).sort(cmp)) {
      const lst = d[k];
      if (!Array.isArray(lst)) continue;
      for (const m of lst) if (m && typeof m === 'object' && typeof m.id === 'string' && DOC_ID_RE.test(m.id)) out.push([k, m]);
    }
  }
  return out;
}
export function docFieldLabel(key) {
  if (key === '_general') return 'Общие документы компании';
  const f = cfg.fields.find((x) => x.key === key);
  return f ? f.group : key;
}
export { canonical } from './engine.js';
