import React, { useState } from 'react';
import { cfg, subsectorParams, defaultSettings, fmtPct } from './engine.js';
import { SubsectorProfile } from './SubsectorView.jsx';
import { Icon } from './ui.jsx';
import { num, catTone } from './format.js';
import { SF, ratingMeaning } from './labels.js';

const CATS = cfg.categories;
const fmt = (v) => num(v, Number.isInteger(v) ? 0 : v < 1 ? 2 : 1);

// Подписи диапазонов индикатора по его порогам (правило границ раздела В.2)
export function indRanges(ind, rules) {
  if (ind.labels) return ind.labels;
  const rl = rules || ind.rules;
  const out = [];
  const op = rl[0][1];
  for (let i = 0; i < 8; i++) {
    if (i < rl.length) {
      const v = rl[i][2];
      if (i === 0) out.push((op === '>=' ? '≥' : '≤') + fmt(v));
      else out.push(op === '>=' ? `${fmt(v)}–${fmt(rl[i - 1][2])}` : `${fmt(rl[i - 1][2])}–${fmt(v)}`);
    } else if (i === rl.length && CATS[i] === ind.else) out.push((op === '>=' ? '<' : '>') + fmt(rl[rl.length - 1][2]));
    else out.push('—');
  }
  return out;
}
export function quantRanges(b, dir, strictLabels) {
  if (strictLabels) return strictLabels;
  const out = [];
  for (let i = 0; i < 8; i++) {
    if (i === 0) out.push((dir === 'higher' ? '≥' : '≤') + fmt(b[1]));
    else if (i === 7) out.push((dir === 'higher' ? '<' : '>') + fmt(b[7]));
    else out.push(dir === 'higher' ? `${fmt(b[i + 1])}–${fmt(b[i])}` : `${fmt(b[i])}–${fmt(b[i + 1])}`);
  }
  return out;
}

function Sec({ id, title, children, open: o0 = false }) {
  const [open, setOpen] = useState(o0);
  return (
    <div className={'card rule-sec' + (open ? ' open' : '')} id={'rules-' + id}>
      <button className="card-h incard-h" onClick={() => setOpen(!open)} aria-expanded={open}><h3>{title}</h3><span className="chev" style={{ marginLeft: 'auto' }}><Icon name="chev" /></span></button>
      {open && <div className="card-b">{children}</div>}
    </div>
  );
}
const CatHead = () => <>{CATS.map((c) => <th key={c} className={'c t-' + catTone(c)}>{c}<div className="small">{cfg.category_scores[c]}</div></th>)}</>;
const QuantHead = () => <>{CATS.map((c) => <th key={c} className={'c t-' + catTone(c)}>{c}</th>)}<th className="c">0,5 / 20,5</th></>;

function pointList(group) {
  return cfg.fields.filter((f) => f.group === group && f.type === 'bool');
}

export default function RulesView({ settings, ctx }) {
  const [code, setCode] = useState(() => (ctx && (ctx.sub_selected || ctx.main)) || cfg.subsector_order[0]);
  const P = subsectorParams(settings, code);
  const M = subsectorParams(defaultSettings(), code);
  const st = { weights: P.weights, bounds: P.bounds, market_rate: settings.market_rate };
  const sub = cfg.subsectors[code];
  const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  const qrow = (label, key, unit, b, dir, labels, mb) => (
    <tr key={label}><td><b>{label}</b>{unit ? `, ${unit}` : ''}{changed(b, mb || (key ? M.bounds[key] : b)) ? <span className="chip yellow">изменено в настройках</span> : null}</td>
      {quantRanges(b, dir, labels).map((x, i) => <td key={i} className="c nowrap">{x}</td>)}<td className="c nowrap">{fmt(b[0])} / {fmt(b[8])}{dir === 'lower' ? ' и выше' : ''}</td></tr>
  );
  const fshGroup = code === 'FSH' && ctx && ctx.main === 'FSH' ? ctx.group : sub.group;
  return (
    <div className="rules">
      <div className="callout">На этой странице собраны все правила, по которым программа считает оценку. Ни одно правило не требует мнения аналитика: каждое значение вводится числом или отметкой «да/нет» с документом-источником, а категория и балл получаются по порогам ниже. Таблицы строятся из тех же настроек, которыми пользуется расчёт.</div>
      <div className="card"><div className="card-b">
        <label className="field rules-sub"><span className="lbl">Показать веса, пороги и правила для подсектора</span>
          <select id="rules-sub" className="inp filled" value={code} onChange={(e) => setCode(e.target.value)}>
            {cfg.subsector_order.map((c) => <option key={c} value={c}>{cfg.subsectors[c].icon} {cfg.subsectors[c].name}{ctx && (ctx.sub_selected || ctx.main) === c ? ' — текущая компания' : ''}</option>)}
          </select></label>
        <SubsectorProfile code={code} settings={settings} ctx={ctx && ctx.main === code ? ctx : null} title="Подсектор" />
      </div></div>

      <Sec id="how" title="1. Как читать шкалы" open>
        <ul className="guide-text">
          <li><b>Балл</b> — число от 0,5 (лучший уровень) до 20,5 (худший). Чем меньше балл, тем надёжнее компания. Как в школьном рейтинге мест: первое место лучше десятого.</li>
          <li><b>Категория</b> — ступень от Aaa (лучшая) до Ca (худшая). Метрический индикатор получает фиксированный балл своей категории: {CATS.map((c) => `${c} ${cfg.category_scores[c]}`).join(', ')}.</li>
          <li><b>Количественный подфактор</b> (выручка, маржа, долговые коэффициенты, просрочка) считается по формуле: Балл = балл лучшей границы + (лучшая граница − значение) / (лучшая граница − худшая граница) × ширина категории. Например, выручка 1 600 млн сом лежит между 900 и 1 750 (Ba, баллы 10,5–13,5): 10,5 + (1 750 − 1 600) / (1 750 − 900) × 3 = 11,03.</li>
          <li><b>Правило границ:</b> для показателей «больше = лучше» нижняя граница входит в лучшую категорию (20% при пороге «20–30» — это A); для «меньше = лучше» — верхняя граница (15% крупнейшего покупателя при пороге «10–15» — это A).</li>
          <li><b>Подфактор из индикаторов</b> = взвешенное среднее баллов индикаторов. Неприменимый индикатор не учитывается, его вес делится между остальными.</li>
          <li><b>Нет данных:</b> индикатор без значения или без источника получает {cfg.default_score} (Ba). Если без данных больше половины веса подфактора — подфактор не лучше 15 (B).</li>
          <li><b>Итог</b> = Σ балл подфактора × вес. Затем корректировки сдвигают оценку на целые ступени шкалы.</li>
        </ul>
      </Sec>

      <Sec id="scale" title="2. Шкала итоговой оценки">
        <table className="tbl"><thead><tr><th>Балл (верхняя граница включается)</th><th>Внутренняя</th><th>Национальная</th><th>Значение</th></tr></thead>
          <tbody>{cfg.rating_scale.map((r, i) => <tr key={r.internal}><td>{i === 0 ? '≤ 1,5' : r.upper === null ? '> 20,5' : `${num(cfg.rating_scale[i - 1].upper, 1)}–${num(r.upper, 1)}`}</td><td className="mono">{r.internal}</td><td className="mono"><b>{r.national}</b></td><td className="small">{ratingMeaning(r.national)}</td></tr>)}</tbody></table>
        <p className="small muted">Балл 10,50 — Baa3, 10,51 — уже Ba1. Программа показывает запас до границы со ступенью ниже: малый запас означает, что небольшое ухудшение снизит оценку.</p>
      </Sec>

      <Sec id="weights" title="3. Блоки, подфакторы и веса">
        <p className="small">Веса для подсектора «{sub.name}»{P.changed.weights ? ' — изменены в «Настройках» (* — отличается от методологии)' : ' — по методологии'}. По методологии веса одинаковы для всех подсекторов; особенности подсекторов учтены в шкалах (натуральный объём, маржа, сезонность, сырьё, стресс).</p>
        <table className="tbl"><thead><tr><th>Код</th><th>Подфактор</th><th>Тип</th><th className="r">Вес</th></tr></thead>
          <tbody>{cfg.blocks.map((b) => (
            <React.Fragment key={b.id}>
              <tr className="rep-block"><td colSpan={4}><b>Блок {b.id}. {b.name}</b> — {num(cfg.subfactors.filter((s) => s.block === b.id).reduce((a, s) => a + st.weights[s.code], 0), 1)}% · <span className="small">{b.desc}</span></td></tr>
              {cfg.subfactors.filter((s) => s.block === b.id).map((s) => <tr key={s.code}><td className="mono">{s.code}</td><td>{s.name}</td><td className="small">{s.type === 'quant' ? 'количественный' : s.type === 'decision' ? 'таблица решений' : 'метрический'}</td><td className="r">{num(st.weights[s.code], st.weights[s.code] % 1 ? 1 : 0)}%{st.weights[s.code] !== M.weights[s.code] ? ' *' : ''}</td></tr>)}
            </React.Fragment>
          ))}</tbody></table>
      </Sec>

      <Sec id="quant" title="4. Количественные подфакторы: пороги">
        <div className="tbl-wrap"><table className="tbl scale-tbl"><thead><tr><th>Показатель</th><QuantHead /></tr></thead>
          <tbody>
            {qrow('1.1 Выручка', 'rev', 'млн сом', st.bounds.rev, 'higher')}
            {code === 'INT'
              ? ['I', 'II', 'III'].map((g) => qrow(`3.1 Маржа EBITDA, группа ${cfg.margin_groups[g].name}`, null, '%', cfg.margin_groups[g].bounds, 'higher'))
              : qrow(`3.1 Маржа EBITDA — ${sub.name} (группа ${fshGroup})`, null, '%', P.changed.margin ? P.margin : cfg.margin_groups[fshGroup].bounds, 'higher', null, cfg.margin_groups[fshGroup].bounds)}
            {qrow('3.2 Максимальное падение маржи (МПМ)', 'mpm', '%', st.bounds.mpm, 'lower')}
            {qrow('4.1 Debt / EBITDA', 'de', 'x', st.bounds.de, 'lower')}
            {qrow('4.2 EBITDA / проценты', 'ic', 'x', st.bounds.ic, 'higher')}
            {qrow('4.3 RCF / чистый долг', 'rcf', '%', st.bounds.rcf, 'higher')}
            {qrow('4.4 Покрытие ликвидности', 'liq', 'x', st.bounds.liq, 'higher')}
            {qrow('6.1 Максимальная просрочка за 36 мес.', 'overdue', 'дней', st.bounds.overdue, 'lower', cfg.metrics.overdue.labels)}
            {qrow('6.2 Доля просроченной кредиторской задолженности', 'payables', '%', st.bounds.payables, 'lower')}
          </tbody></table></div>
        <p className="small muted">Группы маржи по методологии: {['I', 'II', 'III'].map((g) => `${cfg.margin_groups[g].name} — Baa ${fmt(cfg.margin_groups[g].bounds[4])}–${fmt(cfg.margin_groups[g].bounds[3])}%`).join('; ')}. Агрохолдинг: каждая граница маржи = Σ доля группы в выручке × граница группы (если для подсектора сегмента пороги изменены в настройках — Σ доля сегмента × его граница). 3.2: ряд из 3 лет — не лучше 4,5; из 2 лет — не лучше 7,5; один год — подфактор не рассчитывается; средняя маржа ≤ 0 — 20,5. 4.1–4.3: балл = 0,5 × факт + 0,5 × прогноз; отрицательная EBITDA — 20,5. Нормализация процентов (4.2–4.4): если эффективная ставка (проценты / средний долг) ниже {fmtPct(settings.low_rate_share)}% ключевой ставки НБКР или проценты не начислены при наличии долга, проценты считаются по рыночной ставке — для этого подсектора {fmtPct(P.market_rate)}%{P.changed.market ? ' (изменена в настройках)' : ''}; если аналитик указал в профиле ставку для отрасли с источником, берётся она. Нормализация не уменьшает проценты: если рыночная ставка не выше фактической, проценты остаются фактическими (с предупреждением). Покрытие по фактическим процентам показывается справочно. 6.1: просрочка более 90 дней — дефолт (20 баллов).</p>
        <h4>1.6 Натуральный объём по подсекторам</h4>
        <div className="tbl-wrap"><table className="tbl scale-tbl"><thead><tr><th>Подсектор и метрика</th><QuantHead /></tr></thead>
          <tbody>{cfg.segment_subs.map((c) => { const s = cfg.subsectors[c]; const pc = subsectorParams(settings, c); return qrow(`${c === code ? '▶ ' : ''}${s.icon} ${s.name}: ${s.nat.label}`, null, '', pc.nat, 'higher', null, s.nat.bounds); })}</tbody></table></div>
        <table className="tbl small"><thead><tr><th>Подсектор</th><th>Что считается</th><th>Для ориентира</th></tr></thead>
          <tbody>{cfg.segment_subs.map((c) => <tr key={c}><td>{cfg.subsectors[c].name}</td><td>{cfg.subsectors[c].nat.what}</td><td>{cfg.subsectors[c].nat.aaa_note}</td></tr>)}</tbody></table>
        <h4>Условное поголовье (животноводство)</h4>
        <p className="small">{cfg.livestock.map((l) => `${l.name} — ${num(l.k, l.k < 0.1 ? 2 : 1)}`).join('; ')}.</p>
      </Sec>

      <Sec id="metric" title="5. Метрические подфакторы: индикаторы и пороги">
        {cfg.subfactors.filter((s) => s.type === 'metric').map((s) => {
          const inds = cfg.indicators.filter((i) => i.sf === s.code && i.rules);
          return (
            <div key={s.code} className="rule-block">
              <h4>{s.code} {s.name}</h4>
              <div className="tbl-wrap"><table className="tbl scale-tbl"><thead><tr><th>Индикатор</th><th className="r">Вес</th><CatHead /></tr></thead>
                <tbody>{inds.map((i) => <tr key={i.code}><td>{i.code} {i.name}{i.unit && i.unit !== 'баллов' ? `, ${i.unit}` : ''}{i.na ? <div className="small muted">не применяется: {i.na.join(', ')}</div> : null}</td><td className="r">{i.w}%</td>{indRanges(i).map((x, k) => <td key={k} className="c nowrap">{x}</td>)}</tr>)}
                  {s.code === '2.2' && ['I', 'III'].map((g) => <tr key={g}><td>2.2.В Сезонность, доля крупнейшего квартала, % — {g === 'I' ? 'переработка (группы I и II)' : 'первичное производство (группа III)'}</td><td className="r">20%</td>{indRanges({ rules: cfg.seasonality_scales[g].map((v, k) => [CATS[k], '<=', v]), else: 'Ca' }).map((x, k) => <td key={k} className="c nowrap">{x}</td>)}</tr>)}
                </tbody></table></div>
              {s.code === '1.2' && <p className="small">Рынок — национальный рынок КР товарной продукции ключевого сегмента. Относительная доля = доля компании / доля крупнейшего из других участников (лидер делит на долю №2, остальные — на долю лидера). Данные самой компании не принимаются: оба индикатора считаются без данных.</p>}
              {s.code === '1.3' && <p className="small">Новая продукция — новая рецептура, формат, культура, сорт или порода; смена упаковки не считается. Private label в 1.3.Б не засчитывается. Перечни продукции с добавленной стоимостью — в разделе 10.</p>}
              {s.code === '1.4' && <p className="small">Покупатель: связанные компании, одна торговая сеть и все государственные заказчики — один покупатель. Рынки: 7 областей, Бишкек, Ош и каждая страна экспорта. Более 70% экспорта в одну страну — индикатор экспорта на одну категорию ниже, но не ниже Ba.</p>}
              {s.code === '1.5' && <p className="small">Ключевой сегмент — товарная группа от 10% внешней выручки с положительной валовой прибылью. Группы с одним основным сырьём объединяются: зерновые с мукой и хлебом; маслосемена с маслом и шротом. Товарные группы: {cfg.commodity_groups.map((c) => c.name).join('; ')}.</p>}
              {s.code === '2.1' && <p className="small">2.1.А = (собственное производство + 0,5 × закупки по договорам от 12 месяцев с фиксированным объёмом) / годовая потребность. Агрохолдинг: индикаторы по каждому сегменту от 10% выручки, баллы взвешиваются по выручке. Растениеводство: однолетние культуры — вариант 2.1.1, сады — 2.1.2; если каждое направление даёт 15% выручки и больше, баллы взвешиваются по долям.</p>}
              {s.code === '2.1' && <p className="small">Защита сада (2.1.Д″), по 1 баллу, если выполнено на 50% площади и больше: капельное орошение; противоградовая сетка; защита от заморозков; сертифицированный материал; холодильник от 30% среднего урожая за 3 года.</p>}
              {s.code === '2.2' && <p className="small">2.2.А: {pointList('2.2 Производственные риски: безопасность и допуски').map((f) => f.label + ' (' + f.hint.replace('.', '') + ')').join('; ')}. 2.2.Г, по 1 баллу: резервное электроснабжение от 50%; гарантированный источник воды (для растениеводства — от 80% орошаемых площадей по договору); страхование имущества; страхование урожая, поголовья или биоактивов от 50% стоимости; для DAI, MEA, CRP, PRM, FSH, API — программа ветеринарной или фитосанитарной защиты с охватом 100%, для FLR, OIL, FED, SUG, CTN, FRU — хранилища от 2 месяцев потребления.</p>}
              {s.code === '2.3' && <p className="small">Машины и оборудование — включая транспорт, сельхозтехнику и лизинг; без земли, зданий, насаждений и незавершённого строительства. Основное оборудование — единицы, на которые приходится 80% стоимости (по убыванию). Средний возраст взвешивается по стоимости.</p>}
              {s.code === '5.1' && <p className="small">5.1.А, по 1 баллу: {pointList('5.1 Финансовая политика и собственность: формализация политики').map((f) => f.label.toLowerCase()).join('; ')}. 5.1.Б = (займы и авансы связанным сторонам + их дебиторская задолженность + гарантии за них) / собственный капитал. 5.1.В = (дивиденды + выкуп долей + беспроцентные займы владельцам) / чистая прибыль за 3 года; если прибыль ≤ 0 — Ca при выплатах, Ba без выплат.</p>}
              {s.code === '5.3' && <p className="small">5.3.А, по 1 баллу: бенефициары раскрыты до физических лиц и подтверждены; нет санкций США, ЕС, Великобритании (компания, владельцы, руководитель, банки с 50% оборотов); наличные поступления не больше 20% выручки; нет операций со странами высокого риска (кроме документированных до 5%); нет решений о нарушениях за 3 года.</p>}
              {s.code === '6.3' && <p className="small">Учитываются кредиты не меньше 5% текущего долга; эпизоды — просрочки свыше 10 дней по всем кредиторам за 5 лет.</p>}
            </div>
          );
        })}
        <div className="rule-block">
          <h4>5.2 Качество и прозрачность отчётности — таблица решений</h4>
          <table className="tbl small"><thead><tr><th>Категория</th><th>Стандарт</th><th>Аудитор</th><th>Лет аудита</th><th>Мнение</th><th>Срок</th></tr></thead>
            <tbody>
              <tr><td>Aaa (1)</td><td>МСФО полные</td><td>член Форума фирм IFAC</td><td>≥5</td><td>немодифицированное</td><td>≤120 дней</td></tr>
              <tr><td>Aa (3)</td><td>МСФО полные</td><td>член Форума фирм IFAC</td><td>≥3</td><td>немодифицированное</td><td>≤120 дней</td></tr>
              <tr><td>A (6)</td><td>МСФО полные</td><td>IFAC (≥1 года) или лицензированная (≥3 лет)</td><td>см. аудитора</td><td>немодифицированное</td><td>≤150 дней</td></tr>
              <tr><td>Baa (9)</td><td>МСФО или МСФО для МСП</td><td>любая лицензированная</td><td>≥1</td><td>немодифицированное</td><td>—</td></tr>
              <tr><td>Ba (12)</td><td>любой</td><td>любая лицензированная</td><td>≥1</td><td>с оговоркой (или немодифицированное)</td><td>—</td></tr>
              <tr><td>B (15)</td><td>любой</td><td>аудита нет; формы 1–3 полные</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Caa (18)</td><td>любой</td><td>отрицательное мнение или отказ; либо нет одной из форм 1–3</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Ca (20)</td><td>—</td><td>отчётность не предоставлена или налоговая и представленная расходятся по выручке более чем на 10%</td><td>—</td><td>—</td><td>—</td></tr>
            </tbody></table>
          <p className="small">Присваивается лучшая категория, все условия которой выполнены. Тесты целостности: {cfg.integrity_tests.map((t) => `${t.id}) ${t.name} — ${t.criterion}${t.auto ? ' (проверяет программа)' : ''}`).join('; ')}. 2 проваленных теста — не лучше B; 3 и более — не лучше Caa; тесты 1 и 2 одновременно — оценка не присваивается.</p>
        </div>
      </Sec>

      <Sec id="caps" title="6. Ограничения подфакторов">
        <table className="tbl"><thead><tr><th>Подфактор</th><th>Правило</th><th>Условие и результат</th></tr></thead>
          <tbody>{cfg.caps.map((c, i) => <tr key={i}><td className="mono">{c.sf}</td><td><b>{c.name}</b></td><td className="small">{c.text}</td></tr>)}</tbody></table>
      </Sec>

      <Sec id="adj" title="7. Корректировки итоговой оценки">
        <table className="tbl"><thead><tr><th>Корректировка</th><th>Формульный триггер</th><th>Ступени</th></tr></thead>
          <tbody>{cfg.adjustment_rules.map((a) => <tr key={a.id}><td><b>{a.name}</b></td><td className="small">{a.text}</td><td className="nowrap">{a.range}</td></tr>)}</tbody></table>
        <p className="small">Наличие, запрос или ожидание гарантии и объём деловых отношений с организацией, которая использует оценку, факторами оценки не являются.</p>
      </Sec>

      <Sec id="suff" title="8. Когда оценка не присваивается">
        <ul className="small">{cfg.sufficiency_rules.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p className="small">Стоп-факторы ПОД/ФТ: санкционные перечни ГСФР или СБ ООН (компания, бенефициар, руководитель, главный бухгалтер); отказ раскрыть бенефициаров или нераскрыто более 25% капитала; приговор или решение суда за легализацию доходов или финансирование терроризма за 5 лет.</p>
      </Sec>

      <Sec id="fc" title="9. Прогноз и стресс-сценарии">
        <ul className="small">
          <li>Выручка = база × (1 + g), g = меньшее из роста по бизнес-плану и прогноза инфляции НБКР + 5 п.п.; снижение по бизнес-плану берётся полностью. База — выручка последнего года; для первичного производства — средняя за 3 года в ценах последнего года.</li>
          <li>Новые мощности — с месяца ввода и не больше 50% проектной выручки; прирост урожая садов — по нормативам с коэффициентом 0,5.</li>
          <li>Маржа = меньшее из маржи по бизнес-плану и средней за 3 года. Долг = текущий + подписанные кредиты − погашения по графикам. Проценты = средний долг × фактическая ставка (или рыночная {fmtPct(P.market_rate)}%, если проценты нормализованы). Дивиденды = большее из политики и среднего за 3 года. Налог = ставка последнего года (0–10%) × прогнозная прибыль.</li>
        </ul>
        <table className="tbl"><thead><tr><th>Сценарий</th><th>Что меняется</th></tr></thead><tbody>{cfg.stress_scenarios.map((s) => <tr key={s.id}><td><b>{s.id}. {s.name}</b></td><td className="small">{s.text}</td></tr>)}</tbody></table>
        <h4>Параметры главного отраслевого шока (С1)</h4>
        <div className="tbl-wrap"><table className="tbl small"><thead><tr><th>Подсектор</th><th>Шок</th><th className="r">d_о</th><th className="r">d_ц</th><th className="r">r</th><th className="r">t</th><th className="r">v_ш</th><th>Наблюдавшиеся данные</th></tr></thead>
          <tbody>{cfg.segment_subs.flatMap((c) => {
            const s = cfg.subsectors[c];
            const rows = [[c, s.c1]];
            if (s.c1_proc) rows.push([c + '-proc', s.c1_proc]);
            return rows.map(([k, p]) => <tr key={k}><td>{s.name}{k.endsWith('-proc') ? ': переработка' : c === 'FSH' ? ': выращивание' : ''}</td><td>{p.shock}</td>
              <td className="r">{c === 'CRP' ? 'однолетние 40% (25% со своей водой); сады 60% × доля косточковых + 30% × прочие' : num(p.d_o * 100, 0) + '%'}</td>
              <td className="r">{p.d_c ? num(p.d_c * 100, 0) + '%' : '—'}</td><td className="r">{p.r ? (p.r > 0 ? '+' : '') + num(p.r * 100, 0) + '%' : '—'}</td>
              <td className="r">{p.r ? num(p.t, 2) + (c === 'FLR' ? ' (0,5 при регулировании цен)' : '') : '—'}</td><td className="r">{c === 'CRP' ? '0,15 / 0,20' : p.vsh === 'v' ? '= v' : num(p.vsh, 2)}</td><td className="small">{p.data}</td></tr>);
          })}</tbody></table></div>
        <p className="small">ΔEBITDA = В × d_о × (1 − v_ш) + В × (1 − d_о) × d_ц + С × (1 − d_о) × r × (1 − t). Нет данных: доля переменных затрат v — группа I {cfg.v_default.I}, II {cfg.v_default.II}, III {cfg.v_default.III}; покупное сырьё С — {cfg.c_default.I}, {cfg.c_default.II}, {cfg.c_default.III} выручки. Стрессовая EBITDA ≤ 0 — 4.1 и 4.2 получают 20,5.</p>
        <h4>Прогноз по оценке</h4>
        <ol className="small">{cfg.outlook_rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
      </Sec>

      <Sec id="subs" title="10. Подсекторы: группы, сырьё, продукция с добавленной стоимостью">
        <p className="small">Подсектор выбирается в профиле компании. Правило выбора (раздел А.2): основной подсектор — тот, на который приходится 60% выручки и больше; если ни один не даёт 60%, а два и больше дают по 15% — интегрированный агрохолдинг; иначе — подсектор с наибольшей долей. Для агрохолдинга программа проверяет это правило по введённым долям выручки.</p>
        <div className="tbl-wrap"><table className="tbl small"><thead><tr><th>Подсектор</th><th>Группа маржи</th><th>Ключевое сырьё</th><th>Засчитывается в 1.3.А</th><th>Не засчитывается</th></tr></thead>
          <tbody>{cfg.subsector_order.map((c) => { const s = cfg.subsectors[c]; return <tr key={c} className={c === code ? 'hl' : ''}><td><b>{s.icon} {s.name}</b><div className="muted">{s.desc}</div></td><td>{s.group === 'MIX' ? 'смешанная' : s.group}{cfg.seasonal_subs.includes(c) ? '; сезонный долг' : ''}</td><td>{s.raw}</td><td>{s.va_yes}</td><td>{s.va_no}</td></tr>; })}</tbody></table></div>
      </Sec>

      <Sec id="garden" title="11. Многолетние насаждения: нормативы и фазы">
        <div className="tbl-wrap"><table className="tbl small"><thead><tr><th>Вид и тип</th><th>Густота на 1 га</th><th className="r">Вступление, год</th><th className="r">Полное плодоношение, лет</th><th className="r">Конец периода, лет</th><th className="r">Урожайность, т/га</th></tr></thead>
          <tbody>{cfg.garden_kinds.map((g) => <tr key={g.key}><td>{g.name}</td><td>{g.density}</td><td className="r">{g.start}</td><td className="r">{g.full_from}–{g.full_to}</td><td className="r">{g.end}</td><td className="r">{num(g.yield, g.yield % 1 ? 1 : 0)}</td></tr>)}</tbody></table></div>
        <table className="tbl small"><thead><tr><th>Фаза</th><th>Коэффициент к нормативу</th><th>Значение</th></tr></thead><tbody>{cfg.garden_phases.map((p) => <tr key={p.key}><td>{p.name}</td><td>{p.coef}</td><td>{p.note}</td></tr>)}</tbody></table>
        <p className="small">Возраст = год урожая − год посадки. 2.1.Б″ = Σ фактический сбор за 3 года / Σ нормативный сбор (площадь × урожайность × коэффициент фазы). Выпады усредняются по площади кварталов. Право на землю достаточно, если срок аренды не меньше оставшегося продуктивного периода (но не больше 10 лет). В капитале насаждения учитываются по меньшему из балансовой стоимости и оценки по методике.</p>
      </Sec>

      <Sec id="restr" title="12. Виды реструктуризации">
        <table className="tbl small"><thead><tr><th>Вид</th><th>Признаки</th><th>Как учитывается</th></tr></thead>
          <tbody>
            <tr><td>1. Системная</td><td>Решение или рекомендация НБКР или Правительства; режим ЧС; после неё нет просрочки более 30 дней</td><td>Не учитывается</td></tr>
            <tr><td>2. Техническая</td><td>Перенос под сезон, пролонгация или рефинансирование на рыночных условиях без списаний и снижения ставки</td><td>Не учитывается</td></tr>
            <tr><td>3. Вынужденная</td><td>Трудности самой компании без уменьшения стоимости требований кредитора; первая за 36 месяцев</td><td>6.1 не лучше 10,5 и −1 ступень на 36 месяцев</td></tr>
            <tr><td>4. Приравненная к дефолту</td><td>Списание, капитализация процентов без процентов на них, ставка ниже рыночной (ниже прежней более чем на 3 п.п. и ниже средней ставки НБКР, кроме госсубсидии), вторая вынужденная за 36 месяцев, просрочка более 30 дней после реструктуризации</td><td>Дефолт: 6.1 = 20, −2 ступени, итог не лучше B1, 6.3 не лучше 18 на 5 лет</td></tr>
          </tbody></table>
        <p className="small">Без справки кредитора или документов о ЧС реструктуризация относится к виду 3. Несколько реструктуризаций — учитывается худший вид.</p>
      </Sec>
    </div>
  );
}
