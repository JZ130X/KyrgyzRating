// Сборка руководства пользователя Kyrgyz Rating в Word (.docx) из markdown + скриншотов
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, LevelFormat, BorderStyle, Footer, Header, PageNumber, PageBreak, TableLayoutType, LineRuleType,
} = require('docx');

const ROOT = __dirname;
const md = fs.readFileSync(path.join(ROOT, 'guide.md'), 'utf8');
const FIG = { 1: 'overview', 2: 'sidebar', 3: 'help', 4: 'period', 5: 'profile', 6: 'profile_int', 7: 'years', 8: 'balance', 9: 'block3', 10: 'sfbox', 11: 'docs_src', 12: 'docs_general', 13: 'hint', 14: 'seg15', 15: 'gardens', 16: 'gardens2', 17: 'b22', 18: 'equip', 19: 'seasonal', 20: 'b4', 21: 'b52', 22: 'b53', 23: 'restr', 24: 'adj', 25: 'result', 26: 'insufficient', 27: 'fc_inputs', 28: 'fc_table', 29: 'fc_stress', 30: 'outlook', 31: 'rules', 32: 'report', 33: 'save', 34: 'archive', 35: 'next_year', 36: 'proc_check', 37: 'proc_committee', 38: 'proc_final', 39: 'protocol', 40: 'proc_monitor', 41: 'proc_actions', 42: 'demo', 43: 'settings', 44: 'settings2', 45: 'nbkr', 46: 'selfcheck', 47: 'dark' };

const FONT = 'Arial';
const MONO = 'Consolas';
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134; // A4, поля 2 см
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9638 DXA
const MAX_IMG_W = 640, MAX_IMG_H = 860; // пиксели (96 dpi)
const ACCENT = '2A2FA8'; // между синим и фиолетовым логотипа
const GRAY = '5B6472';

// ── inline: **жирный**, *курсив*, `код`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, ...base, size: (base.size || 22) - 2 }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}

const LOGO = pngSize(path.join(ROOT, '..', 'brand', 'logo_mark.png'));

function imageParagraph(n) {
  const name = FIG[n];
  const file = path.join(ROOT, 'img', name + '.png');
  const { w, h, data } = pngSize(file);
  // снимки сделаны с масштабом 1,5 — естественный размер в CSS-пикселях
  let cw = w / 1.5, ch = h / 1.5;
  const s = Math.min(MAX_IMG_W / cw, MAX_IMG_H / ch, 1);
  cw = Math.round(cw * s); ch = Math.round(ch * s);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 120, after: 60, line: 240, lineRule: LineRuleType.AUTO },
    children: [new ImageRun({ type: 'png', data, transformation: { width: cw, height: ch },
      altText: { title: 'Рисунок ' + n, description: 'Скриншот программы Kyrgyz Rating', name: name } })],
  });
}

// ── таблицы
function colWidths(rows) {
  const n = rows[0].length;
  const len = Array(n).fill(0);
  for (const r of rows) r.forEach((c, i) => { len[i] = Math.max(len[i], Math.min(c.replace(/[*`]/g, '').length, 90)); });
  const fixed = rows[0].map((h) => (h.trim() === '№' ? 560 : null));
  const free = CONTENT_W - fixed.reduce((a, x) => a + (x || 0), 0);
  const weights = len.map((l, i) => (fixed[i] ? 0 : Math.pow(Math.max(l, 6), 0.75)));
  const ws = weights.reduce((a, x) => a + x, 0);
  const res = fixed.map((f, i) => f || Math.floor((free * weights[i]) / ws));
  const diff = CONTENT_W - res.reduce((a, x) => a + x, 0);
  res[res.length - 1] += diff;
  return res;
}

const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D1DE' };
const borders = { top: border, bottom: border, left: border, right: border };

function table(rows) {
  const widths = colWidths(rows);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      cantSplit: true,
      children: r.map((c, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        borders,
        shading: ri === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E3EAF6' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          spacing: { before: 0, after: 0, line: 264, lineRule: LineRuleType.AUTO },
          alignment: rows[0][ci].trim() === '№' ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: runs(c.trim(), { size: 19, bold: ri === 0 ? true : undefined, color: ri === 0 ? '1F2633' : undefined }),
        })],
      })),
    })),
  });
}

// ── разбор markdown
const lines = md.split('\n');
const body = [];
let i = 0, olInstance = 0, skippedTitle = false;
const sections = [];

while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  if (line.startsWith('# ')) { skippedTitle = true; i++; continue; }
  if (/^[A-Z][a-z]{2} \d+, \d{4} ·/.test(line)) { i++; continue; } // строка даты из исходника
  if (line.startsWith('## ')) {
    const t = line.slice(3).trim();
    sections.push(t);
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] }));
    i++; continue;
  }
  if (line.startsWith('### ')) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.slice(4).trim())] }));
    i++; continue;
  }
  const cap = line.match(/^\*Рисунок (\d+)\. (.+)\*$/);
  if (cap) {
    const n = Number(cap[1]);
    body.push(imageParagraph(n));
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: `Рисунок ${n}. `, bold: true, size: 19, color: GRAY }), new TextRun({ text: cap[2], italics: true, size: 19, color: GRAY })],
    }));
    i++; continue;
  }
  if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      if (!cells.every((c) => /^\s*-{3,}\s*$/.test(c))) rows.push(cells);
      i++;
    }
    body.push(table(rows));
    body.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }));
    continue;
  }
  if (/^- /.test(line)) {
    while (i < lines.length && /^- /.test(lines[i])) {
      body.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 }, children: runs(lines[i].slice(2)) }));
      i++;
    }
    continue;
  }
  if (/^\d+\. /.test(line)) {
    olInstance++;
    while (i < lines.length && /^\d+\. /.test(lines[i])) {
      body.push(new Paragraph({ numbering: { reference: 'num', level: 0, instance: olInstance }, spacing: { after: 60 }, children: runs(lines[i].replace(/^\d+\. /, '')) }));
      i++;
    }
    continue;
  }
  body.push(new Paragraph({ spacing: { after: 140 }, children: runs(line.trim()) }));
  i++;
}

// ── титульная страница и содержание
const cover = [
  new Paragraph({ spacing: { before: 1800, after: 240 }, children: [new ImageRun({ type: 'png', data: LOGO.data, transformation: { width: 220, height: Math.round(220 * LOGO.h / LOGO.w) },
    altText: { title: 'Логотип Kyrgyz Rating', description: 'Знак KR', name: 'logo' } })] }),
  new Paragraph({ spacing: { before: 240, after: 0 }, children: [new TextRun({ text: 'КЫРГЫЗ РЕЙТИНГ · МОДУЛЬ АПК', size: 18, color: GRAY, bold: true })] }),
  new Paragraph({ spacing: { before: 200, after: 120 }, children: [new TextRun({ text: 'Kyrgyz Rating', size: 64, bold: true, color: ACCENT })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'Руководство пользователя', size: 40, color: '1F2633' })] }),
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } }, spacing: { after: 360 },
    children: [new TextRun({ text: 'Программа расчёта предварительной индикативной оценки кредитоспособности компаний агропромышленного комплекса Кыргызстана: ввод измеримых данных, автоматический расчёт по скоркарду, прогноз и стресс-сценарии, отчёт для рейтингового комитета и архив оценок.', size: 24, color: GRAY })],
  }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Для кого: ', bold: true, size: 22 }), new TextRun({ text: 'аналитики, члены рейтингового комитета, методологи.', size: 22 })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Что внутри: ', bold: true, size: 22 }), new TextRun({ text: 'каждая кнопка, поле и блок программы — с пронумерованными скриншотами и пояснениями.', size: 22 })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Дата: ', bold: true, size: 22 }), new TextRun({ text: '19 ноября 2026 г.', size: 22 })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Содержание')] }),
  ...sections.map((s) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: s, size: 24 })] })),
  new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: 'Как читать скриншоты. ', bold: true }), new TextRun('Красные кружки с номерами на рисунках соответствуют строкам таблицы под рисунком: номер на картинке — номер строки с объяснением.')] }),
];

const doc = new Document({
  creator: 'Kyrgyz Rating',
  title: 'Kyrgyz Rating — руководство пользователя',
  styles: {
    default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 34, bold: true, color: ACCENT }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: '1F2633' }, paragraph: { spacing: { before: 320, after: 140 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }, titlePage: true },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Kyrgyz Rating — руководство пользователя', size: 16, color: GRAY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Стр. ', PageNumber.CURRENT, ' из ', PageNumber.TOTAL_PAGES], size: 16, color: GRAY })] })] }) },
    children: [...cover, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(ROOT, 'Kyrgyz_Rating_Руководство_пользователя.docx');
  fs.writeFileSync(out, buf);
  console.log('OK', out, buf.length, 'bytes; sections', sections.length);
});
