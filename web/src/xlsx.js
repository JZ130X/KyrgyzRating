// Чтение книги Excel 2007+ (.xlsx; бюллетень НБКР бывает с расширением .xls) прямо в браузере, без библиотек:
// zip → XML листов → сетка значений. Совпадает с xlsx_sheets в kg_agro_rating.py (разбор — engine.nbkrExtract).
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

function zipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файл повреждён: не найден каталог архива Excel.');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const map = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Файл повреждён: неверный каталог архива Excel.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    map[name] = { method, csize, off };
    p += 46 + nlen + elen + clen;
  }
  return map;
}

async function entryText(u8, map, name) {
  const e = map[name];
  if (!e) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const lp = e.off;
  const start = lp + 30 + dv.getUint16(lp + 26, true) + dv.getUint16(lp + 28, true);
  const raw = u8.subarray(start, start + e.csize);
  const data = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
  if (data === null) throw new Error('Неподдерживаемое сжатие в файле Excel.');
  return new TextDecoder('utf-8').decode(data);
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');

// Листы книги как сетки {имя: [[значение, …], …]}; только листы из want
export async function xlsxSheets(buffer, want) {
  const u8 = new Uint8Array(buffer);
  if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) {
    throw new Error('Файл в старом формате Excel 97–2003. Откройте его в Excel и сохраните как «Книга Excel (.xlsx)».');
  }
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) throw new Error('Это не файл Excel: ожидается бюллетень НБКР в формате .xlsx (или .xls, сохранённый как .xlsx).');
  const map = zipEntries(u8);
  const wb = xml(await entryText(u8, map, 'xl/workbook.xml'));
  const rels = xml(await entryText(u8, map, 'xl/_rels/workbook.xml.rels'));
  const target = {};
  for (const r of Array.from(rels.getElementsByTagName('Relationship'))) {
    const t = r.getAttribute('Target');
    target[r.getAttribute('Id')] = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
  }
  const ss = [];
  const sst = await entryText(u8, map, 'xl/sharedStrings.xml');
  if (sst !== null) {
    for (const si of Array.from(xml(sst).getElementsByTagNameNS(NS, 'si'))) {
      ss.push(Array.from(si.getElementsByTagNameNS(NS, 't')).map((t) => t.textContent || '').join(''));
    }
  }
  const out = {};
  for (const sh of Array.from(wb.getElementsByTagNameNS(NS, 'sheet'))) {
    const name = (sh.getAttribute('name') || '').trim();
    if (!want.includes(name)) continue;
    const doc = xml(await entryText(u8, map, target[sh.getAttributeNS(RNS, 'id')]));
    const rows = new Map();
    for (const c of Array.from(doc.getElementsByTagNameNS(NS, 'c'))) {
      const ref = c.getAttribute('r');
      let col = 0, i = 0;
      while (i < ref.length && /[A-Za-z]/.test(ref[i])) { col = col * 26 + (ref.toUpperCase().charCodeAt(i) - 64); i++; }
      const row = parseInt(ref.slice(i), 10) - 1;
      const t = c.getAttribute('t');
      const v = c.getElementsByTagNameNS(NS, 'v')[0];
      const vt = v ? v.textContent : null;
      let val;
      if (t === 's') val = v ? ss[parseInt(vt, 10)] : null;
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagNameNS(NS, 't')).map((x) => x.textContent || '').join('');
      else if (t === 'str' || t === 'e' || t === 'b') val = t === 'str' ? (v ? vt : null) : null;
      else val = v && vt !== null && vt !== '' ? Number(vt) : null;
      if (val !== null && val !== undefined && val !== '') {
        if (!rows.has(row)) rows.set(row, new Map());
        rows.get(row).set(col - 1, val);
      }
    }
    const n = rows.size ? Math.max(...rows.keys()) + 1 : 0;
    const grid = [];
    for (let r = 0; r < n; r++) {
      const cells = rows.get(r) || new Map();
      const w = cells.size ? Math.max(...cells.keys()) + 1 : 0;
      const line = [];
      for (let k = 0; k < w; k++) line.push(cells.has(k) ? cells.get(k) : null);
      grid.push(line);
    }
    out[name] = grid;
  }
  return out;
}
