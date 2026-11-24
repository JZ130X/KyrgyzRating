import React, { useState } from 'react';
import { num, isN } from './format.js';
import { useTooltip } from './ui.jsx';

// Вклад блоков в итоговый балл — одна величина, один оттенок (горизонтальные полосы)
export function BlockBars({ blocks, total }) {
  const [tipNode, show, hide] = useTooltip();
  const max = Math.max(0.0001, ...blocks.map((b) => (isN(b.weighted) ? b.weighted : 0)));
  return (
    <div className="hbars" onMouseLeave={hide}>
      {blocks.map((b) => (
        <div key={b.id} className="hbar" onMouseMove={(e) => show(e, (
          <div>
            <b>{b.name}</b>
            <div>Вес блока: {num(b.weight, 0)}%</div>
            <div>Средний балл: {isN(b.avg_score) ? num(b.avg_score, 2) + ' (' + b.category + ')' : 'не заполнен'}</div>
            <div>Вклад в итог: {isN(b.weighted) ? num(b.weighted, 3) : '—'}{isN(total) && isN(b.weighted) ? ` (${num((b.weighted / total) * 100, 0)}%)` : ''}</div>
          </div>
        ))}>
          <span className="t">{b.short || b.name}</span>
          <div className="track"><div className="fill" style={{ width: (isN(b.weighted) ? (b.weighted / max) * 100 : 0) + '%' }} /></div>
          <span className="v">{isN(b.weighted) ? num(b.weighted, 2) : '—'}</span>
        </div>
      ))}
      {tipNode}
    </div>
  );
}

// Линия балла модели по сценариям: «сейчас → 12 → 18 мес.». Ось Y одна (балл), инвертирована: вверху лучше.
export function ForecastChart({ current, scenarios, scale }) {
  const [hoverX, setHoverX] = useState(null);
  const [tipNode, show, hide] = useTooltip();
  const W = 640, H = 300, L = 66, R = 104, T = 18, B = 34;
  const keys = [['base', 'var(--series-1)'], ['stress', 'var(--series-2)'], ['optimistic', 'var(--series-3)']];
  const xs = [0, 12, 18];
  const vals = [current];
  for (const [k] of keys) for (const h of ['12', '18']) { const t = scenarios[k].points[h].total; if (isN(t)) vals.push(t); }
  let lo = Math.floor(Math.min(...vals) - 0.6), hi = Math.ceil(Math.max(...vals) + 0.6);
  lo = Math.max(0.5, lo); hi = Math.min(20.5, hi);
  if (hi - lo < 3) { hi = Math.min(20.5, lo + 3); }
  const xPos = (m) => L + (m / 18) * (W - L - R);
  const yPos = (s) => T + ((s - lo) / (hi - lo)) * (H - T - B);
  const bands = scale.filter((r) => r.upper !== null && r.upper > lo && r.upper < hi);
  const series = keys.map(([k, color]) => ({
    k, color, name: scenarios[k].name,
    pts: [[0, current], [12, scenarios[k].points['12'].total], [18, scenarios[k].points['18'].total]].filter((p) => isN(p[1])),
    fin: [null, scenarios[k].points['12'].final_rating, scenarios[k].points['18'].final_rating],
  }));
  // прямые подписи справа с разведением по вертикали
  const ends = series.map((s) => ({ name: s.name, color: s.color, y: yPos(s.pts[s.pts.length - 1][1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = 1e9;
    for (const m of xs) { const d = Math.abs(xPos(m) - px); if (d < bd) { bd = d; best = m; } }
    setHoverX(best);
    const idx = xs.indexOf(best);
    show(e, (
      <div>
        <b>{best === 0 ? 'Сейчас' : best + ' мес.'}</b>
        {best === 0 ? <div>Текущий балл: {num(current, 2)}</div> : series.map((s) => {
          const p = s.pts.find((q) => q[0] === best);
          const fr = s.fin[idx];
          return (
            <div key={s.k} className="tt-row"><i className="sw" style={{ background: s.color }} />{s.name}: {p ? num(p[1], 2) : '—'}{fr ? ` · ${fr.national}` : ''}</div>
          );
        })}
      </div>
    ));
  };
  return (
    <div>
      <div className="legend" style={{ marginBottom: 6 }}>
        {series.map((s) => <span key={s.k}><i style={{ background: s.color }} />{s.name}</span>)}
        <span className="muted">меньше балл — выше рейтинг</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Прогноз балла модели по сценариям"
        onMouseMove={onMove} onMouseLeave={() => { setHoverX(null); hide(); }} style={{ display: 'block' }}>
        {bands.map((r) => (
          <g key={r.internal}>
            <line x1={L} x2={W - R} y1={yPos(r.upper)} y2={yPos(r.upper)} stroke="var(--border)" strokeWidth="1" />
          </g>
        ))}
        {scale.map((r, i) => {
          const up = r.upper ?? 21, low = i > 0 ? scale[i - 1].upper : 0.5;
          const mid = (Math.max(low, lo) + Math.min(up, hi)) / 2;
          if (up <= lo || low >= hi || Math.min(up, hi) - Math.max(low, lo) < 0.45) return null;
          return <text key={'b' + i} x={L - 8} y={yPos(mid) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{r.national}</text>;
        })}
        {xs.map((m) => (
          <g key={m}>
            <line x1={xPos(m)} x2={xPos(m)} y1={T} y2={H - B} stroke={hoverX === m ? 'var(--text-2)' : 'var(--border)'} strokeDasharray={hoverX === m ? '' : '3 4'} />
            <text x={xPos(m)} y={H - 12} textAnchor="middle" fontSize="11.5" fill="var(--text-2)">{m === 0 ? 'Сейчас' : m + ' мес.'}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.k}>
            <polyline points={s.pts.map((p) => `${xPos(p[0])},${yPos(p[1])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            {s.pts.map((p) => <circle key={p[0]} cx={xPos(p[0])} cy={yPos(p[1])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
          </g>
        ))}
        {ends.map((e) => <text key={e.name} x={xPos(18) + 12} y={e.y + 4} fontSize="11.5" fontWeight="500" fill="var(--text-2)">{e.name}</text>)}
      </svg>
      {tipNode}
    </div>
  );
}

const ZONES = (i) => (i <= 6 ? 'good' : i <= 9 ? 'ok' : i <= 12 ? 'mid' : i <= 15 ? 'weak' : 'bad');
export function ScaleStrip({ scale, finalIdx, scIdx }) {
  return (
    <div>
      <div className="scale" aria-label="Положение на шкале рейтинга">
        {scale.map((r, i) => (
          <i key={i} title={`${r.internal} / ${r.national}`} className={'zone-' + ZONES(i) + (i === finalIdx ? ' cur' : '') + (i === scIdx && scIdx !== finalIdx ? ' sc' : '')} />
        ))}
      </div>
      <div className="scale-l" style={{ display: 'grid', gridTemplateColumns: 'repeat(21, 1fr)' }}>
        <span style={{ gridColumn: '1 / 5' }}>kgAAA</span>
        <span style={{ gridColumn: '9 / 14' }}>kgBBB−</span>
        <span style={{ gridColumn: '15 / 19' }}>kgB−</span>
        <span style={{ gridColumn: '19 / 22', textAlign: 'right' }}>kgC</span>
      </div>
    </div>
  );
}
